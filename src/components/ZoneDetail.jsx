import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Globe, Server, User, Plus, Trash2, RefreshCw, CheckCircle, ChevronDown, Upload, Download, FileText, Search, Clock, Database, Shield, Zap } from 'lucide-react';
import { getAuthHeaders } from '../utils/auth.ts';
import ConfirmModal from './ConfirmModal.jsx';
import DnsRecordModal from './DnsRecordModal.jsx';
import DnsImportModal from './DnsImportModal.jsx';
import DnsHistoryTab from './DnsHistoryTab.jsx';
import DnsRecordsTab from './DnsRecordsTab.jsx';
import SaasTab from './SaasTab.jsx';

const ScheduledChangesModal = React.lazy(() => import('./ScheduledChangesModal.jsx'));
const CacheManagement = React.lazy(() => import('./CacheManagement.jsx'));
const SslManagement = React.lazy(() => import('./SslManagement.jsx'));
const SpeedOptimization = React.lazy(() => import('./SpeedOptimization.jsx'));

const ZoneDetail = forwardRef(({ zone, zones, onSwitchZone, onRefreshZones, zonesLoading, auth, onBack, t, showToast, onAddAccount, onAddSession, onToggleZoneStorage, zoneStorageLoading }, ref) => {
    const [tab, setTab] = useState('dns');
    const [records, setRecords] = useState([]);
    const [hostnames, setHostnames] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null });
    const [showHistory, setShowHistory] = useState(false);
    const [selectedRecords, setSelectedRecords] = useState(new Set());

    // DNS Record Modal state
    const [showDNSModal, setShowDNSModal] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);

    // Bulk import modal state
    const [showBulkImportModal, setShowBulkImportModal] = useState(false);

    // Scheduled changes state
    const [showScheduledModal, setShowScheduledModal] = useState(false);
    const [scheduledCount, setScheduledCount] = useState(0);

    // Import loading (for .txt file import in action bar)
    const [importLoading, setImportLoading] = useState(false);
    const fileInputRef = useRef(null);

    // SaaS tab ref for triggering add
    const saasTabRef = useRef(null);

    // Zone Selector State
    const [showZoneSelector, setShowZoneSelector] = useState(false);
    const zoneSelectorRef = useRef(null);

    // Expose openAddRecord to parent via ref
    useImperativeHandle(ref, () => ({
        openAddRecord: () => { setEditingRecord(null); setShowDNSModal(true); }
    }));

    const openConfirm = (title, message, onConfirm) => {
        setConfirmModal({ show: true, title, message, onConfirm });
    };

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

    // Lock body scroll when any modal is open
    useEffect(() => {
        const anyModalOpen = showDNSModal || showBulkImportModal || confirmModal.show || showScheduledModal;
        if (anyModalOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
        return () => {
            document.body.classList.remove('modal-open');
        };
    }, [showDNSModal, showBulkImportModal, confirmModal.show, showScheduledModal]);

    const getHeaders = (withType = false) => getAuthHeaders(auth, withType);

    const fetchScheduledCount = async () => {
        if (auth.mode !== 'server') return;
        try {
            const res = await fetch('/api/scheduled-changes', { headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                setScheduledCount((data.changes || []).length);
            }
        } catch (err) {
            console.error('Failed to fetch scheduled count:', err);
        }
    };

    const handleSchedule = async (record, editingRec, scheduledAt) => {
        const action = editingRec ? 'update' : 'create';
        const payload = { ...record };
        const structuredTypes = ['SRV', 'CAA', 'URI', 'DS', 'TLSA', 'NAPTR', 'SSHFP', 'HTTPS', 'SVCB'];
        if (!structuredTypes.includes(payload.type)) {
            delete payload.data;
        } else {
            delete payload.content;
            if (payload.type === 'SRV' || payload.type === 'URI') {
                delete payload.priority;
                if (payload.type === 'SRV' && payload.name) {
                    payload.data = { ...payload.data, name: payload.name };
                }
            }
        }

        try {
            const res = await fetch('/api/scheduled-changes', {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({
                    zoneId: zone.id,
                    zoneName: zone.name,
                    action,
                    record: payload,
                    recordId: editingRec ? editingRec.id : undefined,
                    scheduledAt,
                    accountIndex: auth.currentAccountIndex || 0
                })
            });
            if (res.ok) {
                showToast(t('scheduleCreated'));
                setShowDNSModal(false);
                setEditingRecord(null);
                fetchScheduledCount();
            } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || t('errorOccurred'), 'error');
            }
        } catch (err) {
            showToast(t('errorOccurred'), 'error');
        }
    };

    const fetchDNS = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/zones/${zone.id}/dns_records`, { headers: getHeaders() });
            const data = await res.json();
            setRecords((data.result || []).sort((a, b) => new Date(b.modified_on) - new Date(a.modified_on)));
        } catch (e) { console.error('Failed to fetch DNS records:', e); }
        setLoading(false);
    };

    const fetchHostnames = async () => {
        setLoading(true);
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
        }
        setLoading(false);
    };

    useEffect(() => {
        setShowHistory(false);
        if (tab === 'dns') {
            fetchDNS();
            setSelectedRecords(new Set());
        }
        if (tab === 'saas') {
            fetchHostnames();
        }
        fetchScheduledCount();
    }, [tab, zone.id]);

    const handleDNSSubmit = async (e, newRecord, editingRec) => {
        e.preventDefault();
        const method = editingRec ? 'PATCH' : 'POST';
        const url = `/api/zones/${zone.id}/dns_records${editingRec ? `?id=${editingRec.id}` : ''}`;

        const payload = { ...newRecord };
        const structuredTypes = ['SRV', 'CAA', 'URI', 'DS', 'TLSA', 'NAPTR', 'SSHFP', 'HTTPS', 'SVCB'];
        if (!structuredTypes.includes(payload.type)) {
            delete payload.data;
        } else {
            delete payload.content;
            if (payload.type === 'SRV' || payload.type === 'URI') {
                delete payload.priority;
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
            showToast(editingRec ? t('updateSuccess') : t('addSuccess'));
        } else {
            const data = await res.json().catch((err) => { console.error('Failed to parse response JSON:', err); return {}; });
            const isFallbackError = data.errors?.some(e => e.code === 1040);
            showToast(isFallbackError ? t('fallbackError') : (data.errors?.[0]?.message || data.message || t('errorOccurred')), 'error');
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

    const startEdit = (record) => {
        setEditingRecord(record);
        setShowDNSModal(true);
    };

    const handleUpdatePriority = async (updatedRecords) => {
        // Optimistically update local state
        const updatedMap = new Map(updatedRecords.map(r => [r.id, r]));
        setRecords(prev => prev.map(r => updatedMap.has(r.id) ? { ...r, priority: updatedMap.get(r.id).priority } : r));

        // Persist each priority change via API
        try {
            const results = await Promise.all(
                updatedRecords.map(record =>
                    fetch(`/api/zones/${zone.id}/dns_records?id=${record.id}`, {
                        method: 'PATCH',
                        headers: getHeaders(true),
                        body: JSON.stringify({ priority: record.priority })
                    })
                )
            );
            const allOk = results.every(r => r.ok);
            if (allOk) {
                showToast(t('priorityUpdated'));
                fetchDNS();
            } else {
                showToast(t('priorityUpdateFailed'), 'error');
                fetchDNS();
            }
        } catch (e) {
            showToast(t('priorityUpdateFailed'), 'error');
            fetchDNS();
        }
    };

    const filteredRecords = records.filter(r => {
        const term = searchTerm.toLowerCase();
        return r.name.toLowerCase().includes(term) ||
            r.content.toLowerCase().includes(term) ||
            r.type.toLowerCase().includes(term) ||
            (r.comment && r.comment.toLowerCase().includes(term)) ||
            (r.tags && r.tags.some(tag => tag.toLowerCase().includes(term)));
    });

    const filteredSaaS = hostnames.filter(h =>
        h.hostname.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="container">
            <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }} ref={zoneSelectorRef}>
                    <div style={{ padding: '0.25rem', background: 'var(--select-active-bg)', borderRadius: '8px' }}>
                        <Globe size={24} color="var(--primary)" />
                    </div>

                    <button
                        className="unstyled"
                        onClick={() => setShowZoneSelector(!showZoneSelector)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none' }}
                        title={t('switchZone')}
                        aria-label={t('switchZone')}
                        aria-expanded={showZoneSelector}
                        aria-haspopup="true"
                    >
                        <h1 style={{ cursor: 'pointer', fontSize: '1.5rem', margin: 0, lineHeight: 1 }}>{zone.name}</h1>
                        <ChevronDown size={24} color="var(--text-muted)" style={{ transform: showZoneSelector ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                    </button>

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

                    {auth.mode === 'server' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowScheduledModal(true); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                fontSize: '0.65rem', fontWeight: 600,
                                padding: '3px 8px', borderRadius: '6px', cursor: 'pointer',
                                border: '1px solid',
                                borderColor: scheduledCount > 0 ? 'var(--primary)' : 'var(--border)',
                                background: scheduledCount > 0 ? 'var(--select-active-bg)' : 'transparent',
                                color: scheduledCount > 0 ? 'var(--primary)' : 'var(--text-muted)',
                                transition: 'all 0.2s',
                            }}
                            title={t('scheduledChanges')}
                        >
                            <Clock size={12} />
                            {t('scheduledChanges')}
                            {scheduledCount > 0 && (
                                <span style={{
                                    background: 'var(--primary)', color: '#fff',
                                    borderRadius: '50%', width: '16px', height: '16px',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.6rem', fontWeight: 700
                                }}>
                                    {scheduledCount}
                                </span>
                            )}
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
                                        role="option"
                                        tabIndex={0}
                                        aria-selected={isActive}
                                        onClick={() => {
                                            onSwitchZone(z);
                                            setShowZoneSelector(false);
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSwitchZone(z); setShowZoneSelector(false); } }}
                                        style={{
                                            padding: '0.5rem 0.75rem',
                                            cursor: 'pointer',
                                            borderRadius: '6px',
                                            background: isActive ? 'var(--select-active-bg)' : 'transparent',
                                            color: isActive ? 'var(--primary)' : 'var(--text)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            marginBottom: '2px',
                                            transition: 'all 0.1s'
                                        }}
                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--hover-bg)'; }}
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
                                <button
                                    className="unstyled"
                                    onClick={() => { setShowZoneSelector(false); onAddAccount(); }}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', width: '100%' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--select-active-bg)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Plus size={14} />
                                    {t('addNewToken')}
                                </button>
                            )}
                            {onAddSession && (
                                <button
                                    className="unstyled"
                                    onClick={() => { setShowZoneSelector(false); onAddSession(); }}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', width: '100%' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <User size={14} />
                                    {t('loginAnotherAccount')}
                                </button>
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
                <button
                    className="btn"
                    style={{
                        background: 'transparent',
                        color: tab === 'cache' ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: tab === 'cache' ? '2px solid var(--primary)' : 'none',
                        borderRadius: 0,
                        padding: '0.75rem 0',
                        fontWeight: tab === 'cache' ? '700' : '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                    onClick={() => setTab('cache')}
                >
                    <Database size={14} />
                    {t('cacheTab')}
                </button>
                <button
                    className="btn"
                    style={{
                        background: 'transparent',
                        color: tab === 'speed' ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: tab === 'speed' ? '2px solid var(--primary)' : 'none',
                        borderRadius: 0,
                        padding: '0.75rem 0',
                        fontWeight: tab === 'speed' ? '700' : '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                    onClick={() => setTab('speed')}
                >
                    <Zap size={14} />
                    {t('speedTab')}
                </button>
                <button
                    className="btn"
                    style={{
                        background: 'transparent',
                        color: tab === 'ssl' ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: tab === 'ssl' ? '2px solid var(--primary)' : 'none',
                        borderRadius: 0,
                        padding: '0.75rem 0',
                        fontWeight: tab === 'ssl' ? '700' : '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                    onClick={() => setTab('ssl')}
                >
                    <Shield size={14} />
                    {t('sslTab')}
                </button>
            </div>

            {tab === 'speed' ? (
                <React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}><RefreshCw size={20} className="spin" /></div>}>
                    <SpeedOptimization
                        zone={zone}
                        getHeaders={getHeaders}
                        t={t}
                        showToast={showToast}
                    />
                </React.Suspense>
            ) : tab === 'ssl' ? (
                <React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}><RefreshCw size={20} className="spin" /></div>}>
                    <SslManagement
                        zone={zone}
                        getHeaders={getHeaders}
                        t={t}
                        showToast={showToast}
                    />
                </React.Suspense>
            ) : tab === 'cache' ? (
                <React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}><RefreshCw size={20} className="spin" /></div>}>
                    <CacheManagement
                        zone={zone}
                        getHeaders={getHeaders}
                        t={t}
                        showToast={showToast}
                        openConfirm={openConfirm}
                    />
                </React.Suspense>
            ) : (
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
                                    <button className="btn btn-outline" onClick={() => { setShowBulkImportModal(true); }}>
                                        <FileText size={16} />
                                        <span className="btn-text">{t('bulkImport')}</span>
                                    </button>
                                    <button className="btn btn-outline" onClick={handleExport}>
                                        <Download size={16} />
                                        <span className="btn-text">{t('export')}</span>
                                    </button>
                                    <button
                                        className="btn btn-outline"
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => { setShowHistory(true); }}
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
                                <button className="btn btn-primary" onClick={() => { setEditingRecord(null); setShowDNSModal(true); }}>
                                    <Plus size={16} /> <span className="btn-text">{t('addRecord')}</span>
                                </button>
                            ) : (
                                <button className="btn btn-primary" onClick={() => {
                                    if (saasTabRef.current && saasTabRef.current.openAddSaaS) {
                                        saasTabRef.current.openAddSaaS();
                                    }
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
                    <DnsHistoryTab
                        zone={zone}
                        auth={auth}
                        onClose={() => setShowHistory(false)}
                        onRollbackComplete={() => fetchDNS()}
                        t={t}
                        showToast={showToast}
                        records={records}
                    />
                ) : (
                <div className="table-container">
                    {tab === 'dns' ? (
                        <DnsRecordsTab
                            zone={zone}
                            records={records}
                            setRecords={setRecords}
                            filteredRecords={filteredRecords}
                            loading={loading}
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            selectedRecords={selectedRecords}
                            setSelectedRecords={setSelectedRecords}
                            fetchDNS={fetchDNS}
                            onOpenAddRecord={() => { setEditingRecord(null); setShowDNSModal(true); }}
                            onOpenEditRecord={startEdit}
                            onOpenBulkImport={() => setShowBulkImportModal(true)}
                            onShowHistory={() => setShowHistory(true)}
                            onUpdatePriority={handleUpdatePriority}
                            getHeaders={getHeaders}
                            t={t}
                            showToast={showToast}
                            openConfirm={openConfirm}
                        />
                    ) : (
                        <SaasTab
                            ref={saasTabRef}
                            zone={zone}
                            hostnames={hostnames}
                            filteredSaaS={filteredSaaS}
                            loading={loading}
                            fetchHostnames={fetchHostnames}
                            getHeaders={getHeaders}
                            t={t}
                            showToast={showToast}
                            openConfirm={openConfirm}
                        />
                    )}
                </div>
                )}
            </div>
            )}

            {/* DNS Record Modal */}
            <DnsRecordModal
                zone={zone}
                show={showDNSModal}
                editingRecord={editingRecord}
                onClose={() => { setShowDNSModal(false); setEditingRecord(null); }}
                onSubmit={handleDNSSubmit}
                onSchedule={auth.mode === 'server' ? handleSchedule : undefined}
                t={t}
                showToast={showToast}
            />

            {/* Bulk Import Modal */}
            <DnsImportModal
                zone={zone}
                show={showBulkImportModal}
                onClose={() => setShowBulkImportModal(false)}
                onImportComplete={() => fetchDNS()}
                auth={auth}
                getHeaders={getHeaders}
                t={t}
                showToast={showToast}
            />

            {/* Confirm Modal */}
            <ConfirmModal
                confirmModal={confirmModal}
                setConfirmModal={setConfirmModal}
                t={t}
            />

            {/* Scheduled Changes Modal */}
            {showScheduledModal && (
                <React.Suspense fallback={null}>
                    <ScheduledChangesModal
                        show={showScheduledModal}
                        onClose={() => { setShowScheduledModal(false); fetchScheduledCount(); }}
                    />
                </React.Suspense>
            )}
        </div >
    );
});

export default ZoneDetail;
