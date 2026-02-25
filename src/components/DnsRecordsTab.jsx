import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Edit2, Trash2, ChevronDown, ChevronRight, Check, X, GripVertical } from 'lucide-react';

const GROUP_BY_KEY = 'dns_group_by';

const DRAGGABLE_TYPES = ['MX', 'SRV'];

const DnsRecordsTab = ({
    zone,
    records,
    setRecords,
    filteredRecords,
    loading,
    searchTerm,
    setSearchTerm,
    selectedRecords,
    setSelectedRecords,
    fetchDNS,
    onOpenAddRecord,
    onOpenEditRecord,
    onOpenBulkImport,
    onShowHistory,
    onUpdatePriority,
    getHeaders,
    authFetch,
    t,
    showToast,
    openConfirm
}) => {
    const af = authFetch || fetch;
    const [savingRecords, setSavingRecords] = useState(new Set());
    const [importLoading, setImportLoading] = useState(false);
    const [expandedRecords, setExpandedRecords] = useState(new Set());
    const [groupBy, setGroupBy] = useState(() => localStorage.getItem(GROUP_BY_KEY) || 'none');
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());
    const fileInputRef = useRef(null);

    // Inline editing state
    const [editingCell, setEditingCell] = useState(null); // { id, field }
    const [editValue, setEditValue] = useState('');
    const [inlineSaving, setInlineSaving] = useState(false);
    const inlineInputRef = useRef(null);

    // Drag and drop state
    const [draggedRecord, setDraggedRecord] = useState(null);
    const [dragOverRecord, setDragOverRecord] = useState(null);

    // Focus input when inline editing starts
    useEffect(() => {
        if (editingCell && inlineInputRef.current) {
            inlineInputRef.current.focus();
            inlineInputRef.current.select();
        }
    }, [editingCell]);

    const handleGroupByChange = (value) => {
        setGroupBy(value);
        localStorage.setItem(GROUP_BY_KEY, value);
        setCollapsedGroups(new Set());
    };

    const toggleGroupCollapse = (groupKey) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            return next;
        });
    };

    const groupedRecords = useMemo(() => {
        if (groupBy === 'none') return null;

        const groups = new Map();
        for (const record of filteredRecords) {
            let key;
            if (groupBy === 'type') {
                key = record.type;
            } else {
                // Group by subdomain
                const zoneName = zone?.name || '';
                let sub = record.name;
                if (sub === zoneName) {
                    sub = '@';
                } else if (sub.endsWith('.' + zoneName)) {
                    sub = sub.slice(0, -(zoneName.length + 1));
                }
                key = sub;
            }
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(record);
        }

        // Sort groups
        const sorted = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        return sorted;
    }, [filteredRecords, groupBy, zone?.name]);

    const toggleExpand = (id) => {
        setExpandedRecords(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const deleteRecord = async (id) => {
        openConfirm(t('confirmTitle'), t('confirmDelete'), async () => {
            const res = await af(`/api/zones/${zone.id}/dns_records?id=${id}`, {
                method: 'DELETE',
                headers: getHeaders(true)
            });
            if (res.ok) {
                fetchDNS();
                showToast(t('deleteSuccess'));
            } else {
                const data = await res.json().catch((err) => { console.error('Failed to parse response JSON:', err); return {}; });
                showToast(data.message || t('errorOccurred'), 'error');
            }
        });
    };

    const toggleProxied = async (record) => {
        if (!['A', 'AAAA', 'CNAME'].includes(record.type)) return;
        if (savingRecords.has(record.id)) return;

        const originalStatus = record.proxied;
        setSavingRecords(prev => new Set(prev).add(record.id));
        setRecords(prev => prev.map(r =>
            r.id === record.id ? { ...r, proxied: !originalStatus } : r
        ));

        try {
            const res = await af(`/api/zones/${zone.id}/dns_records?id=${record.id}`, {
                method: 'PATCH',
                headers: getHeaders(true),
                body: JSON.stringify({ proxied: !originalStatus })
            });
            const data = await res.json();
            if (!res.ok) {
                setRecords(prev => prev.map(r =>
                    r.id === record.id ? { ...r, proxied: originalStatus } : r
                ));
                const isFallbackError = data.errors?.some(e => e.code === 1040);
                if (isFallbackError) {
                    showToast(t('fallbackError'), 'error');
                } else {
                    showToast(data.errors?.[0]?.message || data.message || t('errorOccurred'), 'error');
                }
            } else {
                showToast(t('updateSuccess'));
            }
        } catch (e) {
            setRecords(prev => prev.map(r =>
                r.id === record.id ? { ...r, proxied: originalStatus } : r
            ));
            showToast(t('errorOccurred'), 'error');
        } finally {
            setSavingRecords(prev => { const next = new Set(prev); next.delete(record.id); return next; });
        }
    };

    const handleExport = async () => {
        try {
            const headers = getHeaders();
            const res = await af(`/api/zones/${zone.id}/dns_export`, { headers });
            if (!res.ok) throw new Error('Export failed');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dns_records_${zone.name}.txt`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            showToast(t('exportSuccess'));
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setImportLoading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('proxied', 'true');

        try {
            const res = await af(`/api/zones/${zone.id}/dns_import`, {
                method: 'POST',
                headers: getHeaders(),
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                showToast(t('importSuccess'));
                fetchDNS();
            } else {
                showToast(data.message || t('errorOccurred'), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setImportLoading(false);
        e.target.value = '';
    };

    const handleBatchDelete = async () => {
        const count = selectedRecords.size;
        if (count === 0) return;
        openConfirm(t('confirmTitle'), t('confirmBatchDelete').replace('{count}', count), async () => {
            try {
                const res = await af(`/api/zones/${zone.id}/dns_batch`, {
                    method: 'POST',
                    headers: getHeaders(true),
                    body: JSON.stringify({
                        deletes: Array.from(selectedRecords).map(id => ({ id }))
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    showToast(t('deleteSuccess'));
                    setSelectedRecords(new Set());
                    fetchDNS();
                } else {
                    showToast(data.message || t('errorOccurred'), 'error');
                }
            } catch (e) {
                showToast(t('errorOccurred'), 'error');
            }
        });
    };

    const toggleSelectAll = () => {
        if (selectedRecords.size === filteredRecords.length) {
            setSelectedRecords(new Set());
        } else {
            setSelectedRecords(new Set(filteredRecords.map(r => r.id)));
        }
    };

    const toggleSelect = (id) => {
        setSelectedRecords(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const formatGroupLabel = (key, count) => {
        if (groupBy === 'type') {
            return `${key} ${t('dnsRecords')} (${count})`;
        }
        return `${key} (${count})`;
    };

    // ─── Inline Editing ──────────────────────────────────────────

    const startInlineEdit = useCallback((record, field) => {
        if (inlineSaving) return;
        const value = field === 'ttl' ? (record.ttl === 1 ? '' : String(record.ttl)) : record[field];
        setEditingCell({ id: record.id, field });
        setEditValue(value || '');
    }, [inlineSaving]);

    const cancelInlineEdit = useCallback(() => {
        setEditingCell(null);
        setEditValue('');
    }, []);

    const saveInlineEdit = useCallback(async (record) => {
        if (!editingCell || inlineSaving) return;

        const { field } = editingCell;
        let newValue = editValue;

        // Validate
        if (field === 'content' && !newValue.trim()) {
            cancelInlineEdit();
            return;
        }
        if (field === 'ttl') {
            if (newValue === '' || newValue === '0') {
                newValue = 1; // auto
            } else {
                newValue = parseInt(newValue, 10);
                if (isNaN(newValue) || newValue < 1) {
                    cancelInlineEdit();
                    return;
                }
            }
        }

        // No change
        if (field === 'ttl' && newValue === record.ttl) {
            cancelInlineEdit();
            return;
        }
        if (field === 'content' && newValue === record.content) {
            cancelInlineEdit();
            return;
        }

        setInlineSaving(true);
        try {
            const payload = {
                type: record.type,
                name: record.name,
                content: field === 'content' ? newValue : record.content,
                ttl: field === 'ttl' ? newValue : record.ttl,
                proxied: record.proxied
            };
            if (record.priority !== undefined) {
                payload.priority = record.priority;
            }

            const res = await af(`/api/zones/${zone.id}/dns_records?id=${record.id}`, {
                method: 'PATCH',
                headers: getHeaders(true),
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showToast(t('updateSuccess'));
                fetchDNS();
            } else {
                const data = await res.json().catch(() => ({}));
                const isFallbackError = data.errors?.some(e => e.code === 1040);
                showToast(isFallbackError ? t('fallbackError') : (data.errors?.[0]?.message || data.message || t('errorOccurred')), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setInlineSaving(false);
        cancelInlineEdit();
    }, [editingCell, editValue, inlineSaving, zone?.id, getHeaders, af, fetchDNS, showToast, t, cancelInlineEdit]);

    const handleInlineKeyDown = useCallback((e, record) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveInlineEdit(record);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelInlineEdit();
        }
    }, [saveInlineEdit, cancelInlineEdit]);

    const renderInlineEditCell = (record, field, displayValue) => {
        const isEditing = editingCell && editingCell.id === record.id && editingCell.field === field;

        if (isEditing) {
            return (
                <div className="inline-edit-wrapper">
                    <input
                        ref={inlineInputRef}
                        type={field === 'ttl' ? 'number' : 'text'}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleInlineKeyDown(e, record)}
                        onBlur={() => {
                            // Delay to allow button clicks to register
                            setTimeout(() => {
                                if (editingCell && editingCell.id === record.id) {
                                    cancelInlineEdit();
                                }
                            }, 150);
                        }}
                        disabled={inlineSaving}
                        min={field === 'ttl' ? '0' : undefined}
                        placeholder={field === 'ttl' ? t('ttlAuto') : ''}
                    />
                    <div className="inline-edit-actions">
                        <button
                            className="inline-save"
                            onMouseDown={(e) => { e.preventDefault(); saveInlineEdit(record); }}
                            title={t('inlineEditSave')}
                            disabled={inlineSaving}
                        >
                            <Check size={14} />
                        </button>
                        <button
                            className="inline-cancel"
                            onMouseDown={(e) => { e.preventDefault(); cancelInlineEdit(); }}
                            title={t('inlineEditCancel')}
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            );
        }

        return displayValue;
    };

    // ─── Drag and Drop ───────────────────────────────────────────

    const isDraggableGroup = useCallback((groupKey) => {
        return groupBy === 'type' && DRAGGABLE_TYPES.includes(groupKey);
    }, [groupBy]);

    const handleDragStart = useCallback((e, record) => {
        setDraggedRecord(record);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', record.id);
        // Timeout to allow the drag image to render before changing opacity
        setTimeout(() => {
            const row = e.target.closest('tr');
            if (row) row.classList.add('dragging');
        }, 0);
    }, []);

    const handleDragEnd = useCallback((e) => {
        const row = e.target.closest('tr');
        if (row) row.classList.remove('dragging');
        setDraggedRecord(null);
        setDragOverRecord(null);
        // Clean up all drag-over classes
        document.querySelectorAll('.drag-over, .drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });
    }, []);

    const handleDragOver = useCallback((e, record) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedRecord && draggedRecord.id !== record.id) {
            setDragOverRecord(record);
            // Add visual feedback
            const row = e.target.closest('tr');
            if (row) {
                document.querySelectorAll('.drag-over, .drag-over-top, .drag-over-bottom').forEach(el => {
                    el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
                });
                row.classList.add('drag-over');
            }
        }
    }, [draggedRecord]);

    const handleDragLeave = useCallback((e) => {
        const row = e.target.closest('tr');
        if (row) {
            row.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        }
    }, []);

    const handleDrop = useCallback((e, targetRecord, groupRecords) => {
        e.preventDefault();
        document.querySelectorAll('.drag-over, .drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });

        if (!draggedRecord || draggedRecord.id === targetRecord.id) {
            setDraggedRecord(null);
            setDragOverRecord(null);
            return;
        }

        // Reorder the records
        const reordered = [...groupRecords];
        const dragIndex = reordered.findIndex(r => r.id === draggedRecord.id);
        const targetIndex = reordered.findIndex(r => r.id === targetRecord.id);

        if (dragIndex === -1 || targetIndex === -1) return;

        // Remove dragged item and insert at target position
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(targetIndex, 0, moved);

        // Assign sequential priorities: 10, 20, 30...
        const updates = reordered.map((record, index) => ({
            ...record,
            priority: (index + 1) * 10
        }));

        // Call parent callback to persist
        if (onUpdatePriority) {
            onUpdatePriority(updates);
        }

        setDraggedRecord(null);
        setDragOverRecord(null);
    }, [draggedRecord, onUpdatePriority]);

    // ─── Row Renderers ───────────────────────────────────────────

    const renderDesktopRow = (record, { draggable = false, groupRecords = null } = {}) => (
        <tr
            key={record.id}
            draggable={draggable ? 'true' : undefined}
            onDragStart={draggable ? (e) => handleDragStart(e, record) : undefined}
            onDragEnd={draggable ? handleDragEnd : undefined}
            onDragOver={draggable ? (e) => handleDragOver(e, record) : undefined}
            onDragLeave={draggable ? handleDragLeave : undefined}
            onDrop={draggable ? (e) => handleDrop(e, record, groupRecords) : undefined}
        >
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {draggable && (
                        <span className="drag-handle" title={t('dragHandle')}>
                            <GripVertical size={14} />
                        </span>
                    )}
                    <input
                        type="checkbox"
                        checked={selectedRecords.has(record.id)}
                        onChange={() => toggleSelect(record.id)}
                        className="record-checkbox"
                    />
                </div>
            </td>
            <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
                    <span className="badge badge-blue">{record.type}</span>
                    {(record.tags || []).map((tag, idx) => (
                        <span key={idx} className="badge badge-green" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>{tag}</span>
                    ))}
                </div>
            </td>
            <td>
                <div style={{ fontWeight: 600 }}>{record.name}</div>
                {record.comment && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{record.comment}</div>}
            </td>
            <td
                className="inline-edit-cell truncate-mobile"
                style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}
                onDoubleClick={() => startInlineEdit(record, 'content')}
                title={t('inlineEditHint')}
            >
                {renderInlineEditCell(record, 'content', record.content)}
            </td>
            <td
                className="inline-edit-cell"
                style={{ fontSize: '0.8125rem' }}
                onDoubleClick={() => startInlineEdit(record, 'ttl')}
                title={t('inlineEditHint')}
            >
                {renderInlineEditCell(record, 'ttl', record.ttl === 1 ? t('ttlAuto') : record.ttl)}
            </td>
            <td>
                {['A', 'AAAA', 'CNAME'].includes(record.type) ? (
                    <label className="toggle-switch" style={savingRecords.has(record.id) ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
                        <input
                            type="checkbox"
                            checked={record.proxied}
                            onChange={() => toggleProxied(record)}
                            disabled={savingRecords.has(record.id)}
                        />
                        <span className="slider"></span>
                    </label>
                ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', opacity: 0.5 }}>---</span>
                )}
            </td>
            <td>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => onOpenEditRecord(record)} aria-label={`Edit ${record.name}`}>
                        <Edit2 size={16} color="var(--primary)" />
                    </button>
                    <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => deleteRecord(record.id)} aria-label={`Delete ${record.name}`}>
                        <Trash2 size={16} color="var(--error)" />
                    </button>
                </div>
            </td>
        </tr>
    );

    const renderMobileCard = (record) => (
        <div key={record.id} className="record-card">
            <div className="record-type-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                <span className="dns-type-label">{record.type}</span>
                {(record.tags || []).map((tag, idx) => (
                    <span key={idx} className="badge badge-green" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>{tag}</span>
                ))}
            </div>
            <div className="record-header" role="button" tabIndex={0} onClick={() => toggleExpand(record.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(record.id); } }} aria-expanded={expandedRecords.has(record.id)}>
                <div className="record-header-main">
                    <div className="dns-selection" onClick={e => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={selectedRecords.has(record.id)}
                            onChange={() => toggleSelect(record.id)}
                            className="record-checkbox"
                        />
                    </div>
                    <div className="dns-name-wrapper">
                        <div className="dns-name">{record.name}</div>
                        {record.comment && <div className="dns-comment">{record.comment}</div>}
                    </div>
                </div>
                <div className="record-actions-inline" onClick={e => e.stopPropagation()}>
                    {['A', 'AAAA', 'CNAME'].includes(record.type) && (
                        <label className="toggle-switch" style={{ transform: 'scale(0.8)', margin: 0 }}>
                            <input
                                type="checkbox"
                                checked={record.proxied}
                                onChange={() => toggleProxied(record)}
                            />
                            <span className="slider"></span>
                        </label>
                    )}
                    <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => onOpenEditRecord(record)} aria-label={`Edit ${record.name}`}>
                        <Edit2 size={16} color="var(--primary)" />
                    </button>
                    <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => deleteRecord(record.id)} aria-label={`Delete ${record.name}`}>
                        <Trash2 size={16} color="var(--error)" />
                    </button>
                </div>
            </div>
            {expandedRecords.has(record.id) && (
                <div className="record-details">
                    <div className="detail-row" style={{ alignItems: 'stretch' }}>
                        <div className="record-content-cell" title={record.content} role="button" tabIndex={0} onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(record.content);
                            showToast(t('copied'));
                        }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(record.content); showToast(t('copied')); } }} aria-label={`Copy content: ${record.content}`}>
                            {record.content}
                        </div>
                        <div className="ttl-box">
                            <span className="ttl-label">TTL</span>
                            <span className="ttl-value">{record.ttl === 1 ? t('ttlAuto') : record.ttl}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderGroupHeader = (groupKey, count, isDraggable) => {
        const isCollapsed = collapsedGroups.has(groupKey);
        return (
            <div
                key={`group-header-${groupKey}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleGroupCollapse(groupKey)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroupCollapse(groupKey); } }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '0.6rem 0.75rem',
                    background: 'var(--hover-bg, #f9fafb)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    marginBottom: '4px',
                    marginTop: '8px',
                    userSelect: 'none',
                    border: '1px solid var(--border)',
                }}
            >
                {isCollapsed ? <ChevronRight size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>
                    {formatGroupLabel(groupKey, count)}
                </span>
                {isDraggable && !isCollapsed && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '4px' }}>
                        {t('dragReorderHint')}
                    </span>
                )}
            </div>
        );
    };

    return (
        <>
            {/* Group By Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{t('groupBy')}:</span>
                {['none', 'type', 'subdomain'].map(option => (
                    <button
                        key={option}
                        onClick={() => handleGroupByChange(option)}
                        style={{
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            border: '1px solid',
                            borderColor: groupBy === option ? 'var(--primary)' : 'var(--border)',
                            background: groupBy === option ? 'var(--select-active-bg, #fff7ed)' : 'transparent',
                            color: groupBy === option ? 'var(--primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        {t('groupBy' + option.charAt(0).toUpperCase() + option.slice(1))}
                    </button>
                ))}
            </div>

            {/* Desktop Table */}
            {groupBy === 'none' ? (
                <table className="data-table desktop-only">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>
                                <input
                                    type="checkbox"
                                    checked={filteredRecords.length > 0 && selectedRecords.size === filteredRecords.length}
                                    onChange={toggleSelectAll}
                                    className="record-checkbox"
                                />
                            </th>
                            <th>{t('type')}</th>
                            <th>{t('name')} / {t('comment')}</th>
                            <th>{t('content')}</th>
                            <th>{t('ttl')}</th>
                            <th>{t('proxied')}</th>
                            <th>{t('actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRecords.map(record => renderDesktopRow(record))}
                    </tbody>
                </table>
            ) : (
                <div className="desktop-only">
                    {groupedRecords && groupedRecords.map(([groupKey, groupRecords]) => {
                        const draggable = isDraggableGroup(groupKey);
                        return (
                            <div key={groupKey}>
                                {renderGroupHeader(groupKey, groupRecords.length, draggable)}
                                {!collapsedGroups.has(groupKey) && (
                                    <table className="data-table" style={{ marginBottom: '0.5rem' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '40px' }}>
                                                    <input type="checkbox" className="record-checkbox" onChange={() => {
                                                        const ids = groupRecords.map(r => r.id);
                                                        const allSelected = ids.every(id => selectedRecords.has(id));
                                                        setSelectedRecords(prev => {
                                                            const next = new Set(prev);
                                                            ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
                                                            return next;
                                                        });
                                                    }} checked={groupRecords.length > 0 && groupRecords.every(r => selectedRecords.has(r.id))} />
                                                </th>
                                                <th>{t('type')}</th>
                                                <th>{t('name')} / {t('comment')}</th>
                                                <th>{t('content')}</th>
                                                <th>{t('ttl')}</th>
                                                <th>{t('proxied')}</th>
                                                <th>{t('actions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groupRecords.map(record => renderDesktopRow(record, { draggable, groupRecords }))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Mobile Cards */}
            {groupBy === 'none' ? (
                <div className="mobile-only">
                    {filteredRecords.map(renderMobileCard)}
                </div>
            ) : (
                <div className="mobile-only">
                    {groupedRecords && groupedRecords.map(([groupKey, groupRecords]) => (
                        <div key={groupKey}>
                            {renderGroupHeader(groupKey, groupRecords.length, isDraggableGroup(groupKey))}
                            {!collapsedGroups.has(groupKey) && groupRecords.map(renderMobileCard)}
                        </div>
                    ))}
                </div>
            )}

            {/* Hidden file input for .txt import */}
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleImport}
                accept=".txt"
            />
        </>
    );
};

export default DnsRecordsTab;
