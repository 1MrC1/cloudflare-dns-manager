import React, { useState, useEffect, useRef } from 'react';
import { Globe, Server, User, Plus, Trash2, Edit2, RefreshCw, CheckCircle, AlertCircle, X, Search, ChevronDown, Upload, Download, Copy } from 'lucide-react';
import { getAuthHeaders } from '../utils/auth.js';
import CustomSelect from './CustomSelect.jsx';

const ZoneDetail = ({ zone, zones, onSwitchZone, onRefreshZones, zonesLoading, auth, onBack, t, showToast, onAddAccount, onAddSession, onToggleZoneStorage, zoneStorageLoading }) => {
    const [tab, setTab] = useState('dns');
    const [records, setRecords] = useState([]);
    const [hostnames, setHostnames] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState(null);
    const [expandedRecords, setExpandedRecords] = useState(new Set());
    const [showVerifyModal, setShowVerifyModal] = useState(false);
    const [verifyingSaaS, setVerifyingSaaS] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null });
    const [showHistory, setShowHistory] = useState(false);
    const [snapshots, setSnapshots] = useState([]);
    const [snapshotsLoading, setSnapshotsLoading] = useState(false);
    const [rollbackLoading, setRollbackLoading] = useState(null); // snapshot key being rolled back

    const openConfirm = (title, message, onConfirm) => {
        setConfirmModal({ show: true, title, message, onConfirm });
    };

    // Zone Selector State
    const [showZoneSelector, setShowZoneSelector] = useState(false);
    const zoneSelectorRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (zoneSelectorRef.current && !zoneSelectorRef.current.contains(event.target)) {
                setShowZoneSelector(false);
            }
        }
        if (showZoneSelector) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showZoneSelector]);

    const toggleExpand = (id) => {
        setExpandedRecords(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Modal Control
    const [showDNSModal, setShowDNSModal] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [newRecord, setNewRecord] = useState({ type: 'A', name: '', content: '', ttl: 1, proxied: true, comment: '', priority: 10, data: {} });
    const [importLoading, setImportLoading] = useState(false);
    const [selectedRecords, setSelectedRecords] = useState(new Set());
    const fileInputRef = useRef(null);

    const initialSaaS = {
        hostname: '',
        ssl: {
            method: 'txt',
            type: 'dv',
            settings: {
                min_tls_version: '1.0'
            }
        },
        custom_origin_server: ''
    };

    const [showSaaSModal, setShowSaaSModal] = useState(false);
    const [editingSaaS, setEditingSaaS] = useState(null);
    const [newSaaS, setNewSaaS] = useState(initialSaaS);

    const startEditSaaS = (h) => {
        setEditingSaaS(h);
        const originValue = h.custom_origin_server || h.custom_origin || h.custom_origin_snihost || '';
        setNewSaaS({
            hostname: h.hostname,
            ssl: {
                method: h.ssl?.method || 'txt',
                type: h.ssl?.type || 'dv',
                settings: {
                    min_tls_version: h.ssl?.settings?.min_tls_version || '1.0'
                }
            },
            custom_origin_server: originValue
        });
        setShowSaaSModal(true);
    };

    const [fallback, setFallback] = useState({ value: '', status: '' });
    const [fallbackLoading, setFallbackLoading] = useState(false);

    const getHeaders = (withType = false) => getAuthHeaders(auth, withType);

    const fetchDNS = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/zones/${zone.id}/dns_records`, { headers: getHeaders() });
            const data = await res.json();
            setRecords((data.result || []).sort((a, b) => new Date(b.modified_on) - new Date(a.modified_on)));
        } catch (e) { }
        setLoading(false);
    };

    const fetchSnapshots = async () => {
        setSnapshotsLoading(true);
        try {
            const res = await fetch(`/api/zones/${zone.id}/dns_history`, {
                headers: getAuthHeaders(auth)
            });
            if (res.ok) {
                const data = await res.json();
                setSnapshots(data.snapshots || []);
            }
        } catch (err) { }
        setSnapshotsLoading(false);
    };

    const handleRollback = async (snapshotKey) => {
        if (!confirm(t('rollbackConfirm'))) return;
        setRollbackLoading(snapshotKey);
        try {
            const res = await fetch(`/api/zones/${zone.id}/dns_history`, {
                method: 'POST',
                headers: { ...getAuthHeaders(auth), 'Content-Type': 'application/json' },
                body: JSON.stringify({ snapshotKey })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const r = data.results;
                showToast(
                    t('rollbackSuccess') + ` (${t('rollbackDetail').replace('{deleted}', r.deleted).replace('{created}', r.created).replace('{updated}', r.updated)})`,
                    'success'
                );
                fetchDNS(); // refresh the DNS records
                fetchSnapshots(); // refresh snapshots
            } else {
                showToast(data.error || 'Rollback failed', 'error');
            }
        } catch (err) {
            showToast('Rollback failed', 'error');
        }
        setRollbackLoading(null);
    };

    const fetchHostnames = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/zones/${zone.id}/custom_hostnames`, { headers: getHeaders() });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Failed to fetch custom hostnames');
            }
            const data = await res.json();
            setHostnames(data.result || []);
        } catch (e) {
            console.error("Error fetching custom hostnames:", e);
            setError(e.message || 'Failed to load SaaS hostnames.');
        }
        setLoading(false);
    };

    const fetchFallback = async () => {
        setError(null);
        try {
            const res = await fetch(`/api/zones/${zone.id}/fallback_origin`, { headers: getHeaders() });
            const data = await res.json();
            if (data.result) {
                setFallback({
                    value: data.result.origin || '',
                    status: data.result.status || 'inactive'
                });
            } else {
                setFallback({ value: '', status: 'not_set' });
            }
        } catch (e) {
            setFallback({ value: '', status: 'error' });
        }
    };

    const handleUpdateFallback = async (e) => {
        e.preventDefault();
        setFallbackLoading(true);
        try {
            const res = await fetch(`/api/zones/${zone.id}/fallback_origin`, {
                method: 'PUT',
                headers: getHeaders(true),
                body: JSON.stringify({ origin: fallback.value })
            });
            if (res.ok) {
                fetchFallback();
                showToast(t('updateSuccess'));
            } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.message || t('errorOccurred'), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setFallbackLoading(false);
    };

    useEffect(() => {
        setShowHistory(false);
        if (tab === 'dns') {
            fetchDNS();
            setSelectedRecords(new Set()); // Reset selection on tab change
        }
        if (tab === 'saas') {
            fetchHostnames();
            fetchFallback();
        }
    }, [tab, zone.id]);

    const handleDNSSubmit = async (e) => {
        e.preventDefault();
        const method = editingRecord ? 'PATCH' : 'POST';
        const url = `/api/zones/${zone.id}/dns_records${editingRecord ? `?id=${editingRecord.id}` : ''}`;

        // Clean up data for types that don't need it
        const payload = { ...newRecord };
        const structuredTypes = ['SRV', 'CAA', 'URI', 'DS', 'TLSA', 'NAPTR', 'SSHFP', 'HTTPS', 'SVCB'];
        if (!structuredTypes.includes(payload.type)) {
            delete payload.data;
        } else {
            delete payload.content;
            if (payload.type === 'SRV' || payload.type === 'URI') {
                delete payload.priority; // Priority is inside data for SRV/URI
                // Ensure data.name is sync with record name for SRV
                if (payload.type === 'SRV' && payload.name) {
                    payload.data = { ...payload.data, name: payload.name };
                }
            }
        }

        const res = await fetch(url, {
            method,
            headers: getHeaders(true),
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            setShowDNSModal(false);
            setEditingRecord(null);
            fetchDNS();
            showToast(editingRecord ? t('updateSuccess') : t('addSuccess'));
        } else {
            const data = await res.json().catch(() => ({}));
            const isFallbackError = data.errors?.some(e => e.code === 1040);
            showToast(isFallbackError ? t('fallbackError') : (data.errors?.[0]?.message || data.message || t('errorOccurred')), 'error');
        }
    };

    const handleSaaSSubmit = async (e) => {
        e.preventDefault();
        const method = editingSaaS ? 'PATCH' : 'POST';
        const url = `/api/zones/${zone.id}/custom_hostnames${editingSaaS ? `?id=${editingSaaS.id}` : ''}`;

        // Prepare payload correctly
        const payload = {
            hostname: newSaaS.hostname,
            ssl: {
                method: newSaaS.ssl.method,
                type: newSaaS.ssl.type,
                settings: {
                    min_tls_version: newSaaS.ssl.settings.min_tls_version
                }
            }
        };

        if (newSaaS.custom_origin_server && newSaaS.custom_origin_server.trim()) {
            const origin = newSaaS.custom_origin_server.trim();
            payload.custom_origin_server = origin;
            // Usually we want SNI to match the origin server hostname when overriding
            payload.custom_origin_snihost = origin;
        } else if (editingSaaS) {
            // Explicitly clear when editing and choice is back to default
            payload.custom_origin_server = null;
            payload.custom_origin_snihost = null;
        }

        const res = await fetch(url, {
            method,
            headers: getHeaders(true),
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            setShowSaaSModal(false);
            setEditingSaaS(null);
            fetchHostnames();
            showToast(editingSaaS ? t('updateSuccess') : t('addSuccess'));
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.message || t('errorOccurred'), 'error');
        }
    };

    const deleteRecord = async (id) => {
        openConfirm(t('confirmTitle'), t('confirmDelete'), async () => {
            const res = await fetch(`/api/zones/${zone.id}/dns_records?id=${id}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            if (res.ok) {
                fetchDNS();
                showToast(t('deleteSuccess'));
            } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.message || t('errorOccurred'), 'error');
            }
        });
    };

    const deleteSaaS = async (id) => {
        openConfirm(t('confirmTitle'), t('confirmDeleteSaaS'), async () => {
            const res = await fetch(`/api/zones/${zone.id}/custom_hostnames?id=${id}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            if (res.ok) {
                fetchHostnames();
                showToast(t('deleteSuccess'));
            } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.message || t('errorOccurred'), 'error');
            }
        });
    };

    const toggleProxied = async (record) => {
        if (!['A', 'AAAA', 'CNAME'].includes(record.type)) return;

        // Optimistic update
        const originalStatus = record.proxied;
        setRecords(prev => prev.map(r =>
            r.id === record.id ? { ...r, proxied: !originalStatus } : r
        ));

        try {
            const res = await fetch(`/api/zones/${zone.id}/dns_records?id=${record.id}`, {
                method: 'PATCH',
                headers: getHeaders(true),
                body: JSON.stringify({ proxied: !originalStatus })
            });
            const data = await res.json();
            if (!res.ok) {
                // Revert on failure
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
                // fetchDNS(); // Don't refresh whole list, relied on optimistic update
                showToast(t('updateSuccess'));
            }
        } catch (e) {
            // Revert on error
            setRecords(prev => prev.map(r =>
                r.id === record.id ? { ...r, proxied: originalStatus } : r
            ));
        }
    };

    const startEdit = (record) => {
        setEditingRecord(record);
        setNewRecord({
            type: record.type,
            name: record.name,
            content: record.content,
            ttl: record.ttl,
            proxied: record.proxied,
            comment: record.comment || '',
            priority: record.priority || 10,
            data: record.data || {}
        });
        setShowDNSModal(true);
    };

    const handleExport = async () => {
        try {
            const headers = getHeaders();
            const res = await fetch(`/api/zones/${zone.id}/dns_export`, { headers });
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
            const res = await fetch(`/api/zones/${zone.id}/dns_import`, {
                method: 'POST',
                headers: getHeaders(), // Don't set Content-Type
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
        e.target.value = ''; // Reset input
    };

    const handleBatchDelete = async () => {
        const count = selectedRecords.size;
        if (count === 0) return;
        openConfirm(t('confirmTitle'), t('confirmBatchDelete').replace('{count}', count), async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/zones/${zone.id}/dns_batch`, {
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
            setLoading(false);
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

    const filteredRecords = records.filter(r =>
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredSaaS = hostnames.filter(h =>
        h.hostname.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="container">
            <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }} ref={zoneSelectorRef}>
                    <div style={{ padding: '0.25rem', background: '#fff7ed', borderRadius: '8px' }}>
                        <Globe size={24} color="var(--primary)" />
                    </div>

                    <div
                        onClick={() => setShowZoneSelector(!showZoneSelector)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none' }}
                        title={t('switchZone')}
                    >
                        <h1 style={{ cursor: 'pointer', fontSize: '1.5rem', margin: 0, lineHeight: 1 }}>{zone.name}</h1>
                        <ChevronDown size={24} color="var(--text-muted)" style={{ transform: showZoneSelector ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                    </div>

                    {onToggleZoneStorage && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleZoneStorage(zone); }}
                            disabled={zoneStorageLoading}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.25rem',
                                fontSize: '0.65rem', fontWeight: 600,
                                padding: '3px 8px', borderRadius: '6px', cursor: 'pointer',
                                border: '1px solid',
                                borderColor: zone._localKey ? 'var(--primary)' : 'var(--border)',
                                background: zone._localKey ? 'var(--select-active-bg)' : 'transparent',
                                color: zone._localKey ? 'var(--primary)' : 'var(--text-muted)',
                                transition: 'all 0.2s',
                            }}
                            title={zone._localKey ? t('uploadToServer') : t('switchToLocal')}
                        >
                            {zoneStorageLoading ? <RefreshCw className="spin" size={11} /> : zone._localKey ? <Upload size={11} /> : <Server size={11} />}
                            {zone._localKey ? t('localBadge') : t('storageServer')}
                        </button>
                    )}

                    {onAddAccount && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAddAccount(); }}
                            title={t('addNewToken')}
                            className="btn btn-outline"
                            style={{ padding: '4px 8px', height: 'auto', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}
                        >
                            <Plus size={14} />
                        </button>
                    )}

                    {showZoneSelector && (
                        <div className="glass-card fade-in" style={{
                            position: 'absolute',
                            top: '120%',
                            left: 0,
                            zIndex: 100,
                            maxHeight: '400px',
                            overflowY: 'auto',
                            minWidth: '280px',
                            padding: '0.5rem',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                        }}>
                            <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{t('yourDomains')}</span>
                                <button className="btn btn-outline" style={{ padding: '2px 6px', height: 'auto', fontSize: '0.7rem' }} onClick={(e) => { e.stopPropagation(); onRefreshZones(); }}>
                                    <RefreshCw size={10} className={zonesLoading ? 'spin' : ''} />
                                    {t('refresh')}
                                </button>
                            </div>
                            {zones.map(z => {
                                const isActive = z.id === zone.id && z._owner === zone._owner;
                                return (
                                    <div
                                        key={`${z._owner}_${z.id}`}
                                        onClick={() => {
                                            onSwitchZone(z);
                                            setShowZoneSelector(false);
                                        }}
                                        style={{
                                            padding: '0.5rem 0.75rem',
                                            cursor: 'pointer',
                                            borderRadius: '6px',
                                            background: isActive ? '#fff7ed' : 'transparent',
                                            color: isActive ? 'var(--primary)' : 'var(--text)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            marginBottom: '2px',
                                            transition: 'all 0.1s'
                                        }}
                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f9fafb'; }}
                                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: isActive ? 600 : 400, fontSize: '0.875rem' }}>{z.name}</span>
                                            <span className={`badge ${z.status === 'active' ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: '0.6rem', padding: '1px 4px' }}>
                                                {t('status' + z.status.charAt(0).toUpperCase() + z.status.slice(1))}
                                            </span>
                                            {z._localKey && <span className="badge badge-orange" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>{t('localBadge')}</span>}
                                        </div>
                                        {isActive && <CheckCircle size={14} />}
                                    </div>
                                );
                            })}
                            <div style={{ height: '1px', background: 'var(--border)', margin: '0.5rem 0' }}></div>
                            {onAddAccount && (
                                <div
                                    onClick={() => { setShowZoneSelector(false); onAddAccount(); }}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Plus size={14} />
                                    {t('addNewToken')}
                                </div>
                            )}
                            {onAddSession && (
                                <div
                                    onClick={() => { setShowZoneSelector(false); onAddSession(); }}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <User size={14} />
                                    {t('loginAnotherAccount')}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                <button
                    className="btn"
                    style={{
                        background: 'transparent',
                        color: tab === 'dns' ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: tab === 'dns' ? '2px solid var(--primary)' : 'none',
                        borderRadius: 0,
                        padding: '0.75rem 0',
                        fontWeight: tab === 'dns' ? '700' : '500'
                    }}
                    onClick={() => setTab('dns')}
                >
                    {t('dnsRecords')}
                </button>
                <button
                    className="btn"
                    style={{
                        background: 'transparent',
                        color: tab === 'saas' ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: tab === 'saas' ? '2px solid var(--primary)' : 'none',
                        borderRadius: 0,
                        padding: '0.75rem 0',
                        fontWeight: tab === 'saas' ? '700' : '500'
                    }}
                    onClick={() => setTab('saas')}
                >
                    {t('saasHostnames')}
                </button>
            </div>

            <div className="glass-card" style={{ padding: '1.25rem', overflow: 'hidden' }}>
                <div className="flex-stack header-stack" style={{ marginBottom: '1.0rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="header-top-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <h2 style={{ margin: 0, whiteSpace: 'nowrap' }}>{tab === 'dns' ? t('dnsRecords') : t('saasHostnames')}</h2>
                        <div className="header-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                            {tab === 'dns' && (
                                <>
                                    {selectedRecords.size > 0 && (
                                        <button className="btn" style={{ background: 'var(--error)', color: 'white', border: 'none' }} onClick={handleBatchDelete}>
                                            <Trash2 size={16} />
                                            <span className="btn-text">{t('batchDelete')} ({selectedRecords.size})</span>
                                        </button>
                                    )}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        onChange={handleImport}
                                        accept=".txt"
                                    />
                                    <button className="btn btn-outline" onClick={() => fileInputRef.current.click()} disabled={importLoading}>
                                        <Upload size={16} className={importLoading ? 'spin' : ''} />
                                        <span className="btn-text">{t('import')}</span>
                                    </button>
                                    <button className="btn btn-outline" onClick={handleExport}>
                                        <Download size={16} />
                                        <span className="btn-text">{t('export')}</span>
                                    </button>
                                    <button
                                        className="btn btn-outline"
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => { setShowHistory(true); fetchSnapshots(); }}
                                    >
                                        <RefreshCw size={16} />
                                        <span className="btn-text">{t('dnsHistory')}</span>
                                    </button>
                                </>
                            )}
                            <button
                                className="btn btn-outline"
                                onClick={() => tab === 'dns' ? fetchDNS() : fetchHostnames()}
                                disabled={loading}
                            >
                                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                                <span className="btn-text">{t('refresh')}</span>
                            </button>
                            {tab === 'dns' ? (
                                <button className="btn btn-primary" onClick={() => { setEditingRecord(null); setShowDNSModal(true); setNewRecord({ type: 'A', name: '', content: '', ttl: 1, proxied: true, comment: '', priority: 10, data: {} }); }}>
                                    <Plus size={16} /> <span className="btn-text">{t('addRecord')}</span>
                                </button>
                            ) : (
                                <button className="btn btn-primary" onClick={() => {
                                    setEditingSaaS(null);
                                    setNewSaaS(initialSaaS);
                                    setShowSaaSModal(true);
                                }}>
                                    <Plus size={16} /> <span className="btn-text">{t('addSaaS')}</span>
                                </button>
                            )}
                        </div>
                    </div>
                    <div style={{ position: 'relative', width: '100%', maxWidth: '100%' }} className="search-container">
                        <input
                            type="text"
                            placeholder={t('searchPlaceholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '32px', height: '36px', fontSize: '0.8125rem', width: '100%' }}
                        />
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
                    </div>
                </div>

                {showHistory && tab === 'dns' ? (
                    <div className="fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <RefreshCw size={18} color="var(--primary)" />
                                {t('dnsHistory')}
                            </h3>
                            <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                onClick={() => setShowHistory(false)}>
                                {t('cancel') || 'Back'}
                            </button>
                        </div>
                        {snapshotsLoading ? (
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <RefreshCw className="spin" size={20} color="var(--primary)" />
                            </div>
                        ) : snapshots.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '2rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {t('noSnapshots')}
                            </p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{t('snapshotTime')}</th>
                                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{t('snapshotUser')}</th>
                                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{t('snapshotAction')}</th>
                                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {snapshots.map((snap) => (
                                            <tr key={snap.key} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                                    {new Date(snap.timestamp).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '0.5rem 0.6rem', fontWeight: 500 }}>{snap.username}</td>
                                                <td style={{ padding: '0.5rem 0.6rem' }}>
                                                    <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>{snap.action}</span>
                                                </td>
                                                <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>
                                                    <button
                                                        className="btn btn-outline"
                                                        style={{ padding: '3px 8px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                        onClick={() => handleRollback(snap.key)}
                                                        disabled={rollbackLoading === snap.key}
                                                    >
                                                        {rollbackLoading === snap.key ? <RefreshCw className="spin" size={11} /> : <RefreshCw size={11} />}
                                                        {t('rollback')}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ) : (
                <div className="table-container">
                    {tab === 'dns' ? (
                        <>
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
                                    {filteredRecords.map(record => (
                                        <tr key={record.id}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRecords.has(record.id)}
                                                    onChange={() => toggleSelect(record.id)}
                                                    className="record-checkbox"
                                                />
                                            </td>
                                            <td><span className="badge badge-blue">{record.type}</span></td>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{record.name}</div>
                                                {record.comment && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{record.comment}</div>}
                                            </td>
                                            <td className="truncate-mobile" style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{record.content}</td>
                                            <td style={{ fontSize: '0.8125rem' }}>{record.ttl === 1 ? t('ttlAuto') : record.ttl}</td>
                                            <td>
                                                {['A', 'AAAA', 'CNAME'].includes(record.type) ? (
                                                    <label className="toggle-switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={record.proxied}
                                                            onChange={() => toggleProxied(record)}
                                                        />
                                                        <span className="slider"></span>
                                                    </label>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', opacity: 0.5 }}>—</span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => startEdit(record)}>
                                                        <Edit2 size={16} color="var(--primary)" />
                                                    </button>
                                                    <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => deleteRecord(record.id)}>
                                                        <Trash2 size={16} color="var(--error)" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="mobile-only">
                                {filteredRecords.map(record => (
                                    <div key={record.id} className="record-card">
                                        {/* 上部 0.5：记录类型 */}
                                        <div className="record-type-row">
                                            <span className="dns-type-label">{record.type}</span>
                                        </div>
                                        {/* 下部 1.0：主内容 */}
                                        <div className="record-header" onClick={() => toggleExpand(record.id)}>
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
                                                <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => startEdit(record)}>
                                                    <Edit2 size={16} color="var(--primary)" />
                                                </button>
                                                <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => deleteRecord(record.id)}>
                                                    <Trash2 size={16} color="var(--error)" />
                                                </button>
                                            </div>
                                        </div>
                                        {expandedRecords.has(record.id) && (
                                            <div className="record-details">
                                                <div className="detail-row" style={{ alignItems: 'stretch' }}>
                                                    <div className="record-content-cell" title={record.content} onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigator.clipboard.writeText(record.content);
                                                        showToast(t('copied'));
                                                    }}>
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
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.5rem', background: '#f8fafc' }}>
                                <div className="flex-stack">
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                                            <h3 style={{ fontSize: '0.875rem', margin: 0 }}>{t('fallbackOrigin')}</h3>
                                            <span className={`badge ${fallback.status === 'active' ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: '0.65rem' }}>
                                                {t(fallback.status) || 'N/A'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="text"
                                                value={fallback.value || ''}
                                                onChange={e => setFallback({ ...fallback, value: e.target.value })}
                                                placeholder={t('fallbackOriginPlaceholder')}
                                                style={{ height: '36px', fontSize: '0.8125rem', maxWidth: '300px' }}
                                            />
                                            <button
                                                className="btn btn-primary"
                                                onClick={handleUpdateFallback}
                                                disabled={fallbackLoading}
                                                style={{ height: '36px', padding: '0 1rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                                            >
                                                {fallbackLoading ? <RefreshCw className="spin" size={14} /> : t('updateFallback')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <table className="data-table desktop-only">
                                <thead>
                                    <tr>
                                        <th>{t('hostname')}</th>
                                        <th>{t('status')}</th>
                                        <th>{t('sslStatus')}</th>
                                        <th>{t('originServer')}</th>
                                        <th>{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSaaS.map(h => (
                                        <tr key={h.id} className="compact-row">
                                            <td style={{ fontWeight: 600 }}>{h.hostname}</td>
                                            <td>
                                                <span className={`badge ${h.status === 'active' ? 'badge-green' : 'badge-orange'}`}>
                                                    {t(h.status)}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span className={`badge ${h.ssl?.status === 'active' ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: '0.75rem' }}>
                                                        {t(h.ssl?.status) || 'N/A'}
                                                    </span>
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: '#f1f5f9', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                                        {h.ssl?.method}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Server size={12} />
                                                    <span>{h.custom_origin_server || h.custom_origin_snihost || h.custom_origin || t('defaultOrigin')}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                    <div style={{ width: '32px', display: 'flex', justifyContent: 'flex-start' }}>
                                                        {(h.ssl?.status !== 'active' || h.ownership_verification) && (
                                                            <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => { setVerifyingSaaS(h); setShowVerifyModal(true); }} title={t('verificationRecords')}>
                                                                <AlertCircle size={16} color="#f59e0b" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => startEditSaaS(h)}>
                                                        <Edit2 size={16} color="var(--primary)" />
                                                    </button>
                                                    <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => deleteSaaS(h.id)}>
                                                        <Trash2 size={16} color="var(--error)" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="mobile-only">
                                {filteredSaaS.map(h => (
                                    <div key={h.id} className="record-card" style={{ padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {/* Row 1: Hostname & Origin */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text)', wordBreak: 'break-all', flex: 1 }}>{h.hostname}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                                <Server size={10} />
                                                <span>{h.custom_origin_server || h.custom_origin_snihost || h.custom_origin || t('defaultOrigin')}</span>
                                            </div>
                                        </div>

                                        {/* Row 2: Statuses & Actions */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Host:</span>
                                                    <span className={`badge ${h.status === 'active' ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: '0.6rem', padding: '1px 4px' }}>{t(h.status)}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>SSL:</span>
                                                    <span className={`badge ${h.ssl?.status === 'active' ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: '0.6rem', padding: '1px 4px' }}>
                                                        {t(h.ssl?.status) || 'N/A'}
                                                    </span>
                                                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', opacity: 0.8 }}>{h.ssl?.method}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                                                {(h.ssl?.status !== 'active' || h.ownership_verification) && (
                                                    <button className="btn btn-outline" style={{ padding: '0.35rem', border: 'none' }} onClick={() => { setVerifyingSaaS(h); setShowVerifyModal(true); }}>
                                                        <AlertCircle size={15} color="#f59e0b" />
                                                    </button>
                                                )}
                                                <button className="btn btn-outline" style={{ padding: '0.35rem', border: 'none' }} onClick={() => startEditSaaS(h)}>
                                                    <Edit2 size={15} color="var(--primary)" />
                                                </button>
                                                <button className="btn btn-outline" style={{ padding: '0.35rem', border: 'none' }} onClick={() => deleteSaaS(h.id)}>
                                                    <Trash2 size={15} color="var(--error)" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
                )}
            </div>

            {/* DNS Modal */}
            {showDNSModal && (
                <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShowDNSModal(false); }}
                >
                    <div className="glass-card fade-in" style={{ padding: '2rem', maxWidth: '450px', width: '90%', position: 'relative' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>{editingRecord ? t('editRecord') : t('addModalTitle')}</h2>
                        <form onSubmit={handleDNSSubmit}>
                            <div className="input-row">
                                <label>{t('type')}</label>
                                <div style={{ flex: 1 }}>
                                    <CustomSelect
                                        value={newRecord.type}
                                        onChange={(e) => {
                                            const newType = e.target.value;
                                            const proxyableTypes = ['A', 'AAAA', 'CNAME'];
                                            setNewRecord({
                                                ...newRecord,
                                                type: newType,
                                                proxied: proxyableTypes.includes(newType) ? newRecord.proxied : false
                                            });
                                        }}
                                        options={['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'URI', 'CAA', 'DS', 'TLSA', 'CERT', 'DNSKEY', 'HTTPS', 'LOC', 'NAPTR', 'PTR', 'SMIMEA', 'SSHFP', 'SVCB'].map(t => ({ value: t, label: t }))}
                                    />
                                </div>
                            </div>
                            <div className="input-row">
                                <label>{t('name')}</label>
                                <input type="text" value={newRecord.name} onChange={e => setNewRecord({ ...newRecord, name: e.target.value })} placeholder={newRecord.type === 'SRV' ? '_sip._tcp' : '@'} required />
                            </div>

                            {!['SRV', 'CAA', 'URI', 'DS', 'TLSA', 'NAPTR', 'SSHFP', 'HTTPS', 'SVCB'].includes(newRecord.type) && (
                                <div className="input-row">
                                    <label>{t('content')}</label>
                                    <input type="text" value={newRecord.content} onChange={e => setNewRecord({ ...newRecord, content: e.target.value })} placeholder={newRecord.type === 'LOC' ? '33 40 31 N 106 28 29 W 10m' : 'Value'} required />
                                </div>
                            )}

                            {newRecord.type === 'SRV' && (
                                <>
                                    <div className="input-row">
                                        <label>{t('service')}</label>
                                        <input type="text" value={newRecord.data?.service || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, service: e.target.value } })} placeholder="_sip" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('protocol')}</label>
                                        <input type="text" value={newRecord.data?.proto || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, proto: e.target.value } })} placeholder="_tcp" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('priority')}</label>
                                        <input type="number" value={newRecord.data?.priority || 10} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, priority: parseInt(e.target.value) } })} min="0" max="65535" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('weight')}</label>
                                        <input type="number" value={newRecord.data?.weight || 5} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, weight: parseInt(e.target.value) } })} min="0" max="65535" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('port')}</label>
                                        <input type="number" value={newRecord.data?.port || 5060} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, port: parseInt(e.target.value) } })} min="0" max="65535" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('target')}</label>
                                        <input type="text" value={newRecord.data?.target || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, target: e.target.value } })} placeholder="sipserver.example.com" required />
                                    </div>
                                </>
                            )}

                            {newRecord.type === 'URI' && (
                                <>
                                    <div className="input-row">
                                        <label>{t('priority')}</label>
                                        <input type="number" value={newRecord.data?.priority || 10} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, priority: parseInt(e.target.value) } })} min="0" max="65535" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('weight')}</label>
                                        <input type="number" value={newRecord.data?.weight || 5} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, weight: parseInt(e.target.value) } })} min="0" max="65535" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('target')}</label>
                                        <input type="text" value={newRecord.data?.target || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, target: e.target.value } })} placeholder="https://example.com" required />
                                    </div>
                                </>
                            )}

                            {newRecord.type === 'CAA' && (
                                <>
                                    <div className="input-row">
                                        <label>{t('flags')}</label>
                                        <input type="number" value={newRecord.data?.flags || 0} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, flags: parseInt(e.target.value) } })} min="0" max="255" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('tag')}</label>
                                        <CustomSelect
                                            value={newRecord.data?.tag || 'issue'}
                                            onChange={(e) => setNewRecord({ ...newRecord, data: { ...newRecord.data, tag: e.target.value } })}
                                            options={[
                                                { value: 'issue', label: 'issue' },
                                                { value: 'issuewild', label: 'issuewild' },
                                                { value: 'iodef', label: 'iodef' }
                                            ]}
                                        />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('value')}</label>
                                        <input type="text" value={newRecord.data?.value || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, value: e.target.value } })} placeholder="comodoca.com" required />
                                    </div>
                                </>
                            )}

                            {newRecord.type === 'DS' && (
                                <>
                                    <div className="input-row">
                                        <label>{t('keyTag')}</label>
                                        <input type="number" value={newRecord.data?.key_tag || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, key_tag: parseInt(e.target.value) } })} min="0" max="65535" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('algorithm')}</label>
                                        <input type="number" value={newRecord.data?.algorithm || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, algorithm: parseInt(e.target.value) } })} min="0" max="255" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('digestType')}</label>
                                        <input type="number" value={newRecord.data?.digest_type || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, digest_type: parseInt(e.target.value) } })} min="0" max="255" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('digest')}</label>
                                        <input type="text" value={newRecord.data?.digest || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, digest: e.target.value } })} placeholder={t('digest')} required />
                                    </div>
                                </>
                            )}

                            {newRecord.type === 'TLSA' && (
                                <>
                                    <div className="input-row">
                                        <label>{t('usage')}</label>
                                        <input type="number" value={newRecord.data?.usage || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, usage: parseInt(e.target.value) } })} min="0" max="255" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('selector')}</label>
                                        <input type="number" value={newRecord.data?.selector || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, selector: parseInt(e.target.value) } })} min="0" max="255" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('matchingType')}</label>
                                        <input type="number" value={newRecord.data?.matching_type || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, matching_type: parseInt(e.target.value) } })} min="0" max="255" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('certificate')}</label>
                                        <input type="text" value={newRecord.data?.certificate || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, certificate: e.target.value } })} placeholder={t('certificate')} required />
                                    </div>
                                </>
                            )}

                            {newRecord.type === 'NAPTR' && (
                                <>
                                    <div className="input-row">
                                        <label>{t('order')}</label>
                                        <input type="number" value={newRecord.data?.order || 100} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, order: parseInt(e.target.value) } })} min="0" max="65535" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('preference')}</label>
                                        <input type="number" value={newRecord.data?.preference || 10} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, preference: parseInt(e.target.value) } })} min="0" max="65535" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('flags')}</label>
                                        <input type="text" value={newRecord.data?.flags || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, flags: e.target.value } })} placeholder="S" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('service')}</label>
                                        <input type="text" value={newRecord.data?.service || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, service: e.target.value } })} placeholder="http+E2U" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('regex')}</label>
                                        <input type="text" value={newRecord.data?.regex || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, regex: e.target.value } })} placeholder={t('regex')} />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('replacement')}</label>
                                        <input type="text" value={newRecord.data?.replacement || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, replacement: e.target.value } })} placeholder="." />
                                    </div>
                                </>
                            )}

                            {newRecord.type === 'SSHFP' && (
                                <>
                                    <div className="input-row">
                                        <label>{t('algorithm')}</label>
                                        <input type="number" value={newRecord.data?.algorithm || 4} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, algorithm: parseInt(e.target.value) } })} min="0" max="255" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('type')}</label>
                                        <input type="number" value={newRecord.data?.type || 2} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, type: parseInt(e.target.value) } })} min="0" max="255" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('fingerprint')}</label>
                                        <input type="text" value={newRecord.data?.fingerprint || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, fingerprint: e.target.value } })} placeholder={t('fingerprint')} required />
                                    </div>
                                </>
                            )}

                            {(newRecord.type === 'HTTPS' || newRecord.type === 'SVCB') && (
                                <>
                                    <div className="input-row">
                                        <label>{t('priority')}</label>
                                        <input type="number" value={newRecord.data?.priority || 1} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, priority: parseInt(e.target.value) } })} min="0" max="65535" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('target')}</label>
                                        <input type="text" value={newRecord.data?.target || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, target: e.target.value } })} placeholder="example.com" required />
                                    </div>
                                    <div className="input-row">
                                        <label>{t('value')}</label>
                                        <input type="text" value={newRecord.data?.value || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, value: e.target.value } })} placeholder="alpn=h3,h2" required />
                                    </div>
                                </>
                            )}
                            <div className="input-row">
                                <label>{t('ttl')}</label>
                                <div style={{ flex: 1 }}>
                                    <CustomSelect
                                        value={newRecord.ttl}
                                        onChange={(e) => setNewRecord({ ...newRecord, ttl: parseInt(e.target.value) })}
                                        options={[
                                            { value: 1, label: t('ttlAuto') },
                                            { value: 60, label: t('ttl1min') },
                                            { value: 120, label: t('ttl2min') },
                                            { value: 300, label: t('ttl5min') },
                                            { value: 600, label: t('ttl10min') },
                                            { value: 900, label: t('ttl15min') },
                                            { value: 1800, label: t('ttl30min') },
                                            { value: 3600, label: t('ttl1h') },
                                            { value: 7200, label: t('ttl2h') },
                                            { value: 18000, label: t('ttl5h') },
                                            { value: 43200, label: t('ttl12h') },
                                            { value: 86400, label: t('ttl1d') }
                                        ]}
                                    />
                                </div>
                            </div>
                            {['MX'].includes(newRecord.type) && (
                                <div className="input-row">
                                    <label>{t('priority')}</label>
                                    <input type="number" value={newRecord.priority} onChange={e => setNewRecord({ ...newRecord, priority: parseInt(e.target.value) })} min="0" max="65535" required />
                                </div>
                            )}
                            <div className="input-row">
                                <label>{t('comment')}</label>
                                <input
                                    type="text"
                                    value={newRecord.comment || ''}
                                    onChange={e => setNewRecord({ ...newRecord, comment: e.target.value })}
                                    placeholder={t('comment')}
                                />
                            </div>
                            {['A', 'AAAA', 'CNAME'].includes(newRecord.type) && (
                                <div className="input-row" style={{ alignItems: 'center' }}>
                                    <label>{t('proxied')}</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <label className="toggle-switch" style={{ margin: 0 }}>
                                            <input
                                                type="checkbox"
                                                checked={newRecord.proxied}
                                                onChange={(e) => setNewRecord({ ...newRecord, proxied: e.target.checked })}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('proxiedHint')}</span>
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDNSModal(false)}>{t('cancel')}</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{t('save')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* SaaS Modal */}
            {showSaaSModal && (
                <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowSaaSModal(false); setEditingSaaS(null); setNewSaaS(initialSaaS); } }}
                >
                    <div className="glass-card fade-in" style={{ padding: '2rem', maxWidth: '450px', width: '90%', position: 'relative' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>{editingSaaS ? t('editSaaS') : t('addSaaS')}</h2>
                        <form onSubmit={handleSaaSSubmit}>
                            <div className="input-row">
                                <label>{t('hostname')}</label>
                                <input
                                    type="text"
                                    value={newSaaS.hostname}
                                    onChange={e => setNewSaaS({ ...newSaaS, hostname: e.target.value })}
                                    placeholder={t('hostnamePlaceholder')}
                                    required
                                />
                            </div>

                            <div className="input-row">
                                <label>{t('minTlsVersion')}</label>
                                <div style={{ flex: 1 }}>
                                    <CustomSelect
                                        value={newSaaS.ssl.settings.min_tls_version}
                                        onChange={(e) => setNewSaaS({ ...newSaaS, ssl: { ...newSaaS.ssl, settings: { ...newSaaS.ssl.settings, min_tls_version: e.target.value } } })}
                                        options={[
                                            { value: '1.0', label: t('tlsDefault') },
                                            { value: '1.1', label: 'TLS 1.1' },
                                            { value: '1.2', label: 'TLS 1.2' },
                                            { value: '1.3', label: 'TLS 1.3' }
                                        ]}
                                    />
                                </div>
                            </div>

                            <div className="input-row">
                                <label>{t('verifyMethod')}</label>
                                <div style={{ flex: 1 }}>
                                    <CustomSelect
                                        value={newSaaS.ssl.method}
                                        onChange={(e) => setNewSaaS({ ...newSaaS, ssl: { ...newSaaS.ssl, method: e.target.value } })}
                                        options={[
                                            { value: 'txt', label: t('sslMethodTxt') + ` (${t('recommended')})` },
                                            { value: 'http', label: t('sslMethodHttp') }
                                        ]}
                                    />
                                </div>
                            </div>

                            <div className="input-row">
                                <label>{t('originServer')}</label>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <CustomSelect
                                        value={newSaaS.custom_origin_server ? 'custom' : 'default'}
                                        onChange={(e) => {
                                            if (e.target.value === 'default') {
                                                setNewSaaS({ ...newSaaS, custom_origin_server: '' });
                                            } else {
                                                setNewSaaS({ ...newSaaS, custom_origin_server: ' ' }); // space to trigger
                                            }
                                        }}
                                        options={[
                                            { value: 'default', label: t('defaultOrigin') },
                                            { value: 'custom', label: t('customOrigin') }
                                        ]}
                                    />
                                    {newSaaS.custom_origin_server !== '' && (
                                        <input
                                            type="text"
                                            value={newSaaS.custom_origin_server === ' ' ? '' : newSaaS.custom_origin_server}
                                            onChange={e => setNewSaaS({ ...newSaaS, custom_origin_server: e.target.value })}
                                            placeholder={t('originPlaceholder')}
                                            required
                                        />
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => {
                                    setShowSaaSModal(false);
                                    setEditingSaaS(null);
                                    setNewSaaS(initialSaaS);
                                }}>{t('cancel')}</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{t('save')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {confirmModal.show && (
                <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}
                    onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal({ ...confirmModal, show: false }); }}
                >
                    <div className="glass-card fade-in" style={{ padding: '2rem', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
                        <div style={{ width: '48px', height: '48px', background: '#fff5f5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                            <AlertCircle size={24} color="var(--error)" />
                        </div>
                        <h2 style={{ marginBottom: '0.75rem' }}>{confirmModal.title}</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '2rem', lineHeight: '1.6' }}>{confirmModal.message}<br />{t('confirmDeleteText')}</p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setConfirmModal({ ...confirmModal, show: false })}>{t('cancel')}</button>
                            <button className="btn btn-primary" style={{ flex: 1, background: 'var(--error)' }} onClick={() => {
                                confirmModal.onConfirm();
                                setConfirmModal({ ...confirmModal, show: false });
                            }}>{t('yes')}</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Verification Modal */}
            {showVerifyModal && verifyingSaaS && (
                <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShowVerifyModal(false); }}
                >
                    <div className="glass-card fade-in" style={{ padding: '2rem', maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>{t('verificationRecords')}</h2>
                            <button className="btn btn-outline" style={{ padding: '4px', border: 'none' }} onClick={() => setShowVerifyModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {verifyingSaaS.ownership_verification && (
                                <div>
                                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>{t('ownership')}</h4>
                                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div>
                                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyType')}</p>
                                            <code style={{ fontSize: '0.8125rem', background: '#fff', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px' }}>{verifyingSaaS.ownership_verification.type}</code>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyName')}</p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <code style={{ fontSize: '0.8125rem', background: '#fff', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{verifyingSaaS.ownership_verification.name}</code>
                                                <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => { navigator.clipboard.writeText(verifyingSaaS.ownership_verification.name); showToast(t('copied')); }}>
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyValue')}</p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <code style={{ fontSize: '0.8125rem', background: '#fff', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{verifyingSaaS.ownership_verification.value}</code>
                                                <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => { navigator.clipboard.writeText(verifyingSaaS.ownership_verification.value); showToast(t('copied')); }}>
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {(verifyingSaaS.ssl?.validation_records?.length > 0 || verifyingSaaS.ssl?.cname) && (
                                <div>
                                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>{t('sslValidation')}</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {verifyingSaaS.ssl.validation_records?.map((rec, idx) => (
                                            <div key={idx} style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <code style={{ fontSize: '0.8125rem', background: '#fff', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px' }}>TXT</code>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('verifyMethod')}</span>
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyName')}</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <code style={{ fontSize: '0.8125rem', background: '#fff', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{rec.txt_name}</code>
                                                        <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => { navigator.clipboard.writeText(rec.txt_name); showToast(t('copied')); }}>
                                                            <Copy size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyValue')}</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <code style={{ fontSize: '0.8125rem', background: '#fff', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{rec.txt_value}</code>
                                                        <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => { navigator.clipboard.writeText(rec.txt_value); showToast(t('copied')); }}>
                                                            <Copy size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {verifyingSaaS.ssl.cname && (
                                            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <code style={{ fontSize: '0.8125rem', background: '#fff', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px' }}>CNAME</code>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('verifyMethod')}</span>
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyName')}</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <code style={{ fontSize: '0.8125rem', background: '#fff', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{verifyingSaaS.hostname}</code>
                                                        <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => { navigator.clipboard.writeText(verifyingSaaS.hostname); showToast(t('copied')); }}>
                                                            <Copy size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyValue')}</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <code style={{ fontSize: '0.8125rem', background: '#fff', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{verifyingSaaS.ssl.cname_target}</code>
                                                        <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => { navigator.clipboard.writeText(verifyingSaaS.ssl.cname_target); showToast(t('copied')); }}>
                                                            <Copy size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            )}
        </div >
    );
};

export default ZoneDetail;
