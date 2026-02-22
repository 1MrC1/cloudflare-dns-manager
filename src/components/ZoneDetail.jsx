import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Globe, Server, Plus, Trash2, RefreshCw, Upload, Download, FileText, Search, Clock, Unlink, MoreVertical, Shield, Key, WifiOff, AlertCircle } from 'lucide-react';
import { getAuthHeaders } from '../utils/auth.ts';
import ConfirmModal from './ConfirmModal.jsx';
import DnsRecordModal from './DnsRecordModal.jsx';
import DnsImportModal from './DnsImportModal.jsx';
import DnsHistoryTab from './DnsHistoryTab.jsx';
import DnsRecordsTab from './DnsRecordsTab.jsx';
import SaasTab from './SaasTab.jsx';
import TabSkeleton from './TabSkeleton.jsx';

const ScheduledChangesModal = React.lazy(() => import('./ScheduledChangesModal.jsx'));
const CacheManagement = React.lazy(() => import('./CacheManagement.jsx'));
const SslManagement = React.lazy(() => import('./SslManagement.jsx'));
const SpeedOptimization = React.lazy(() => import('./SpeedOptimization.jsx'));
const PageRules = React.lazy(() => import('./PageRules.jsx'));
const SecuritySettings = React.lazy(() => import('./SecuritySettings.jsx'));
const NetworkSettings = React.lazy(() => import('./NetworkSettings.jsx'));
const ScrapeShield = React.lazy(() => import('./ScrapeShield.jsx'));
const WorkersRoutes = React.lazy(() => import('./WorkersRoutes.jsx'));
const RedirectRules = React.lazy(() => import('./RedirectRules.jsx'));
const Analytics = React.lazy(() => import('./Analytics.jsx'));
const DnsSettings = React.lazy(() => import('./DnsSettings.jsx'));
const TransformRules = React.lazy(() => import('./TransformRules.jsx'));
const OriginRules = React.lazy(() => import('./OriginRules.jsx'));
const EmailRouting = React.lazy(() => import('./EmailRouting.jsx'));
const CustomPages = React.lazy(() => import('./CustomPages.jsx'));
const DnsAnalytics = React.lazy(() => import('./DnsAnalytics.jsx'));

const ZoneDetail = forwardRef(({ zone, auth, tab, onBack, t, showToast, onToggleZoneStorage, zoneStorageLoading, onUnbindZone, onRefreshZones }, ref) => {
    const [records, setRecords] = useState([]);
    const [hostnames, setHostnames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState(null);
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

    // Zone actions (delete/unbind) state
    const [showZoneActions, setShowZoneActions] = useState(false);
    const zoneActionsRef = useRef(null);
    const [showDeleteZone, setShowDeleteZone] = useState(false);
    const [deleteZoneConfirm, setDeleteZoneConfirm] = useState('');
    const [deleteZoneLoading, setDeleteZoneLoading] = useState(false);
    const [showUnbindConfirm, setShowUnbindConfirm] = useState(false);

    // Expose openAddRecord to parent via ref
    useImperativeHandle(ref, () => ({
        openAddRecord: () => { setEditingRecord(null); setShowDNSModal(true); }
    }));

    const openConfirm = (title, message, onConfirm) => {
        setConfirmModal({ show: true, title, message, onConfirm });
    };

    useEffect(() => {
        function handleClickOutside(event) {
            if (zoneActionsRef.current && !zoneActionsRef.current.contains(event.target)) {
                setShowZoneActions(false);
            }
        }
        if (showZoneActions) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showZoneActions]);

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

    const parseApiError = (status, data, networkError) => {
        if (networkError) return { type: 'network', message: networkError.message || 'Network error' };
        if (status === 403) return { type: 'permission', message: data?.errors?.[0]?.message || 'Forbidden' };
        if (status === 401) return { type: 'auth', message: data?.errors?.[0]?.message || 'Unauthorized' };
        if (status === 400 && JSON.stringify(data).toLowerCase().includes('invalid api')) return { type: 'auth', message: data?.errors?.[0]?.message || 'Invalid API key' };
        return { type: 'unknown', message: data?.errors?.[0]?.message || data?.message || `HTTP ${status}` };
    };

    const handleDeleteZone = async () => {
        if (deleteZoneConfirm !== zone.name) return;
        setDeleteZoneLoading(true);
        try {
            const res = await fetch(`/api/zones/${zone.id}`, {
                method: 'DELETE',
                headers: getHeaders(true)
            });
            const data = await res.json();
            if (data.success) {
                showToast(t('zoneDeleted'), 'success');
                setShowDeleteZone(false);
                setDeleteZoneConfirm('');
                onRefreshZones();
            } else {
                showToast(data.errors?.[0]?.message || t('zoneDeleteFailed'), 'error');
            }
        } catch (err) {
            showToast(t('zoneDeleteFailed'), 'error');
        } finally {
            setDeleteZoneLoading(false);
        }
    };

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
        setError(null);
        try {
            const res = await fetch(`/api/zones/${zone.id}/dns_records`, { headers: getHeaders() });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(parseApiError(res.status, data));
                setLoading(false);
                return;
            }
            const data = await res.json();
            setRecords((data.result || []).sort((a, b) => new Date(b.modified_on) - new Date(a.modified_on)));
        } catch (e) {
            console.error('Failed to fetch DNS records:', e);
            setError(parseApiError(null, null, e));
        }
        setLoading(false);
    };

    const fetchHostnames = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/zones/${zone.id}/custom_hostnames`, { headers: getHeaders() });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(parseApiError(res.status, data));
                setLoading(false);
                return;
            }
            const data = await res.json();
            setHostnames(data.result || []);
        } catch (e) {
            console.error("Error fetching custom hostnames:", e);
            setError(parseApiError(null, null, e));
        }
        setLoading(false);
    };

    useEffect(() => {
        setShowHistory(false);
        setError(null);
        if (tab === 'dns') {
            fetchDNS();
            setSelectedRecords(new Set());
        }
        if (tab === 'saas') {
            fetchHostnames();
        }
        if (['cache', 'speed', 'ssl', 'pagerules', 'security', 'network', 'scrapeshield', 'workers', 'rules', 'analytics', 'dnsanalytics', 'dnssettings', 'transform', 'origin', 'email', 'custompages'].includes(tab)) {
            setLoading(false);
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
                <div className="zone-header-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative', flexWrap: 'wrap' }}>
                    <div className="zone-globe-icon" style={{ padding: '0.25rem', background: 'var(--select-active-bg)', borderRadius: '8px' }}>
                        <Globe size={24} color="var(--primary)" />
                    </div>

                    <h1 className="zone-name-title" style={{ fontSize: '1.5rem', margin: 0, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.name}</h1>
                    {zone._accountType === 'global_key'
                        ? <span className="badge zone-type-badge" style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'rgba(139, 92, 246, 0.12)', color: '#7c3aed', flexShrink: 0 }}>{t('globalKeyBadge')}</span>
                        : <span className="badge zone-type-badge" style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', flexShrink: 0 }}>{t('apiTokenBadge')}</span>
                    }

                    <div className="zone-action-btns" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, marginLeft: 'auto' }}>
                        {onToggleZoneStorage && (
                            <button
                                className="zone-action-btn"
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
                                <span className="zone-btn-label">{zone._localKey ? t('localBadge') : t('storageServer')}</span>
                            </button>
                        )}

                        {auth.mode === 'server' && (
                            <button
                                className="zone-action-btn"
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
                                <span className="zone-btn-label">{t('scheduledChanges')}</span>
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

                        <div style={{ position: 'relative' }} ref={zoneActionsRef}>
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowZoneActions(!showZoneActions); }}
                                title={t('zoneActions')}
                                style={{
                                    display: 'flex', alignItems: 'center',
                                    padding: '3px 6px', borderRadius: '6px', cursor: 'pointer',
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--text-muted)',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <MoreVertical size={14} />
                            </button>
                        {showZoneActions && (
                            <div className="glass-card fade-in" style={{
                                position: 'absolute', top: '120%', right: 0, zIndex: 100,
                                minWidth: '180px', padding: '0.25rem',
                            }}>
                                <button
                                    className="unstyled"
                                    onClick={() => { setShowZoneActions(false); setShowUnbindConfirm(true); }}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Unlink size={14} />
                                    {t('unbindZone')}
                                </button>
                                <button
                                    className="unstyled"
                                    onClick={() => { setShowZoneActions(false); setShowDeleteZone(true); setDeleteZoneConfirm(''); }}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)', width: '100%' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--error-bg)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Trash2 size={14} />
                                    {t('deleteZone')}
                                </button>
                            </div>
                        )}
                    </div>
                    </div>{/* end zone-action-btns */}
                </div>
            </div>

            {/* Loading skeleton */}
            {loading && !error && records.length === 0 && hostnames.length === 0 && (
                <div className="glass-card" style={{ padding: '1.25rem', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div className="skeleton" style={{ width: '120px', height: '24px' }} />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <div className="skeleton" style={{ width: '80px', height: '32px' }} />
                            <div className="skeleton" style={{ width: '80px', height: '32px' }} />
                        </div>
                    </div>
                    <div className="skeleton" style={{ width: '100%', height: '36px', marginBottom: '1rem' }} />
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="skeleton-row">
                            <div className="skeleton" style={{ width: '50px', height: '22px' }} />
                            <div className="skeleton" style={{ flex: 1, height: '16px' }} />
                            <div className="skeleton" style={{ width: '150px', height: '16px' }} />
                            <div className="skeleton" style={{ width: '60px', height: '22px' }} />
                        </div>
                    ))}
                </div>
            )}

            {/* Error state */}
            {error && !loading && (() => {
                const isSaasQuotaError = tab === 'saas' && error.message && (error.message.toLowerCase().includes('no quota') || error.message.toLowerCase().includes('authentication error'));
                return isSaasQuotaError ? (
                    <div className="glass-card error-state">
                        <div className="error-state-icon" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                            <AlertCircle size={28} color="#d97706" />
                        </div>
                        <h3>{t('saasNotEnabled')}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{t('saasNotEnabledDesc')}</p>
                        <div style={{ margin: '1rem 0', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', fontSize: '0.8rem', textAlign: 'left', lineHeight: 1.7 }}>
                            <div>{t('saasStep1')}</div>
                            <div>{t('saasStep2')}</div>
                            <div>{t('saasStep3')}</div>
                        </div>
                        <div className="error-state-actions">
                            <button className="btn btn-primary" onClick={() => fetchHostnames()}>
                                <RefreshCw size={14} /> {t('retry')}
                            </button>
                            <a href={`https://dash.cloudflare.com/${zone.account?.id || ''}/${zone.name}/ssl-tls/custom-hostnames`} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ textDecoration: 'none' }}>
                                {t('goToCfDashboard')}
                            </a>
                        </div>
                    </div>
                ) : (
                    <div className="glass-card error-state">
                        <div className="error-state-icon" style={{
                            background: error.type === 'permission' ? 'rgba(245, 158, 11, 0.1)' :
                                error.type === 'auth' ? 'var(--error-bg)' :
                                error.type === 'network' ? 'rgba(59, 130, 246, 0.1)' : 'var(--error-bg)'
                        }}>
                            {error.type === 'permission' ? <Shield size={28} color="#d97706" /> :
                             error.type === 'auth' ? <Key size={28} color="var(--error)" /> :
                             error.type === 'network' ? <WifiOff size={28} color="#2563eb" /> :
                             <AlertCircle size={28} color="var(--error)" />}
                        </div>
                        <h3>{error.type === 'permission' ? t('errPermission') :
                             error.type === 'auth' ? t('errAuth') :
                             error.type === 'network' ? t('errNetwork') : t('errUnknown')}</h3>
                        <p>{error.type === 'permission' ? (error.message && error.message !== 'Forbidden' ? error.message : t('errPermissionDesc')) :
                            error.type === 'auth' ? (error.message && error.message !== 'Unauthorized' ? error.message : t('errAuthDesc')) :
                            error.type === 'network' ? t('errNetworkDesc') : error.message}</p>
                        <div className="error-state-actions">
                            <button className="btn btn-primary" onClick={() => tab === 'dns' ? fetchDNS() : fetchHostnames()}>
                                <RefreshCw size={14} /> {t('retry')}
                            </button>
                            {(error.type === 'permission' || error.type === 'auth') && (
                                <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ textDecoration: 'none' }}>
                                    {t('goToCfDashboard')}
                                </a>
                            )}
                        </div>
                    </div>
                );
            })()}

            {tab === 'speed' ? (
                <React.Suspense fallback={<TabSkeleton variant="settings" />}>
                    <SpeedOptimization zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} />
                </React.Suspense>
            ) : tab === 'ssl' ? (
                <React.Suspense fallback={<TabSkeleton variant="settings" />}>
                    <SslManagement zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} />
                </React.Suspense>
            ) : tab === 'cache' ? (
                <React.Suspense fallback={<TabSkeleton variant="cache" />}>
                    <CacheManagement zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} openConfirm={openConfirm} />
                </React.Suspense>
            ) : tab === 'pagerules' ? (
                <React.Suspense fallback={<TabSkeleton variant="list" />}>
                    <PageRules zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} openConfirm={openConfirm} />
                </React.Suspense>
            ) : tab === 'security' ? (
                <React.Suspense fallback={<TabSkeleton variant="settings" />}>
                    <SecuritySettings zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} openConfirm={(msg, cb) => openConfirm('', msg, cb)} />
                </React.Suspense>
            ) : tab === 'network' ? (
                <React.Suspense fallback={<TabSkeleton variant="settings" />}>
                    <NetworkSettings zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} />
                </React.Suspense>
            ) : tab === 'scrapeshield' ? (
                <React.Suspense fallback={<TabSkeleton variant="settings" />}>
                    <ScrapeShield zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} />
                </React.Suspense>
            ) : tab === 'workers' ? (
                <React.Suspense fallback={<TabSkeleton variant="list" />}>
                    <WorkersRoutes zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} openConfirm={openConfirm} />
                </React.Suspense>
            ) : tab === 'rules' ? (
                <React.Suspense fallback={<TabSkeleton variant="list" />}>
                    <RedirectRules zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} openConfirm={openConfirm} />
                </React.Suspense>
            ) : tab === 'analytics' ? (
                <React.Suspense fallback={<TabSkeleton variant="analytics" />}>
                    <Analytics zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} />
                </React.Suspense>
            ) : tab === 'dnssettings' ? (
                <React.Suspense fallback={<TabSkeleton variant="settings" />}>
                    <DnsSettings zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} />
                </React.Suspense>
            ) : tab === 'transform' ? (
                <React.Suspense fallback={<TabSkeleton variant="list" />}>
                    <TransformRules zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} openConfirm={openConfirm} />
                </React.Suspense>
            ) : tab === 'origin' ? (
                <React.Suspense fallback={<TabSkeleton variant="list" />}>
                    <OriginRules zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} openConfirm={openConfirm} />
                </React.Suspense>
            ) : tab === 'email' ? (
                <React.Suspense fallback={<TabSkeleton variant="list" />}>
                    <EmailRouting zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} openConfirm={openConfirm} />
                </React.Suspense>
            ) : tab === 'custompages' ? (
                <React.Suspense fallback={<TabSkeleton variant="list" />}>
                    <CustomPages zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} />
                </React.Suspense>
            ) : tab === 'dnsanalytics' ? (
                <React.Suspense fallback={<TabSkeleton variant="analytics" />}>
                    <DnsAnalytics zone={zone} getHeaders={getHeaders} t={t} showToast={showToast} />
                </React.Suspense>
            ) : !error && !(loading && records.length === 0 && hostnames.length === 0) ? (
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
            ) : null}

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

            {/* Unbind Zone Confirmation Modal */}
            {showUnbindConfirm && (
                <div className="modal-overlay" style={{ zIndex: 2000 }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShowUnbindConfirm(false); }}>
                    <div className="glass-card fade-in modal-content" role="dialog" aria-label={t('unbindZone')} style={{ padding: '2rem', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
                        <div style={{ width: '48px', height: '48px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                            <Unlink size={24} color="#d97706" />
                        </div>
                        <h2 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>{t('unbindZone')}</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', lineHeight: '1.6' }}>
                            {t('unbindZoneDesc')}
                        </p>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1.25rem' }}>{zone.name}</p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowUnbindConfirm(false)}>{t('cancel')}</button>
                            <button
                                className="btn btn-primary"
                                style={{ flex: 1, background: '#d97706' }}
                                onClick={() => { setShowUnbindConfirm(false); onUnbindZone(zone.id); }}
                            >
                                {t('unbindZone')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Zone Confirmation Modal */}
            {showDeleteZone && (
                <div className="modal-overlay" style={{ zIndex: 2000 }}
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowDeleteZone(false); setDeleteZoneConfirm(''); } }}>
                    <div className="glass-card fade-in modal-content" role="dialog" aria-label={t('deleteZone')} style={{ padding: '2rem', maxWidth: '440px', width: '90%', textAlign: 'center' }}>
                        <div style={{ width: '48px', height: '48px', background: 'var(--error-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                            <Trash2 size={24} color="var(--error)" />
                        </div>
                        <h2 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>{t('deleteZone')}</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', lineHeight: '1.6' }}>
                            {t('deleteZoneWarning')}
                        </p>
                        <p style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
                            {t('deleteZoneTypeConfirm').replace('{zone}', zone.name)}
                        </p>
                        <input
                            type="text"
                            value={deleteZoneConfirm}
                            onChange={(e) => setDeleteZoneConfirm(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && deleteZoneConfirm === zone.name) handleDeleteZone(); }}
                            placeholder={zone.name}
                            style={{ width: '100%', marginBottom: '1.25rem', textAlign: 'center', fontWeight: 600 }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowDeleteZone(false); setDeleteZoneConfirm(''); }}>{t('cancel')}</button>
                            <button
                                className="btn btn-primary"
                                style={{ flex: 1, background: 'var(--error)', opacity: deleteZoneConfirm === zone.name ? 1 : 0.5 }}
                                disabled={deleteZoneConfirm !== zone.name || deleteZoneLoading}
                                onClick={handleDeleteZone}
                            >
                                {deleteZoneLoading ? <RefreshCw className="spin" size={14} /> : t('deleteZone')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
});

export default ZoneDetail;
