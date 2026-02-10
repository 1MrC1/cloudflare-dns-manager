import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Trash2, RefreshCw, X, AlertCircle, Plus, CheckCircle, HelpCircle } from 'lucide-react';
import { ApiClient, ApiError } from '../utils/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'];

const StatusBadge = ({ status }) => {
    const colors = {
        ok: { bg: 'var(--success)', text: '#fff', label: 'OK' },
        fail: { bg: 'var(--error)', text: '#fff', label: 'FAIL' },
        unknown: { bg: 'var(--text-muted)', text: '#fff', label: '?' }
    };
    const c = colors[status] || colors.unknown;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.6rem', fontWeight: 700, padding: '2px 8px',
            borderRadius: '10px', background: c.bg, color: c.text,
            lineHeight: 1.4, letterSpacing: '0.03em', minWidth: '36px', textAlign: 'center'
        }}>
            {c.label}
        </span>
    );
};

const MonitorsModal = ({ show, onClose, zones }) => {
    const { auth } = useAuth();
    const { showToast } = useToast();
    const { t } = useTheme();
    const [monitors, setMonitors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);

    // Form state
    const [formZoneId, setFormZoneId] = useState('');
    const [formRecordType, setFormRecordType] = useState('A');
    const [formRecordName, setFormRecordName] = useState('');
    const [formExpectedContent, setFormExpectedContent] = useState('');
    const [formSubmitting, setFormSubmitting] = useState(false);

    const authRef = useRef(auth);
    authRef.current = auth;

    const apiRef = useRef(null);
    if (!apiRef.current) {
        apiRef.current = new ApiClient(() => authRef.current);
    }

    const fetchMonitors = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiRef.current.get('/api/monitors');
            setMonitors(data.monitors || []);
        } catch (err) {
            if (err instanceof ApiError) {
                console.error(`Failed to fetch monitors (${err.status}):`, err.message);
            } else {
                console.error('Failed to fetch monitors:', err);
            }
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (show) {
            fetchMonitors();
        }
    }, [show, fetchMonitors]);

    // Auto-refresh every 60 seconds when modal is open
    useEffect(() => {
        if (!show) return;
        const interval = setInterval(() => {
            fetchMonitors();
        }, 60000);
        return () => clearInterval(interval);
    }, [show, fetchMonitors]);

    const handleDelete = async (id) => {
        try {
            await apiRef.current.del(`/api/monitors?id=${id}`);
            showToast(t('monitorDeleted'));
            setMonitors(prev => prev.filter(m => m.id !== id));
        } catch (err) {
            if (err instanceof ApiError) {
                showToast(err.message || t('errorOccurred'), 'error');
            } else {
                showToast(t('errorOccurred'), 'error');
            }
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!formZoneId || !formRecordType || !formRecordName || !formExpectedContent) return;

        const selectedZone = (zones || []).find(z => z.id === formZoneId);
        setFormSubmitting(true);
        try {
            const data = await apiRef.current.post('/api/monitors', {
                zoneId: formZoneId,
                zoneName: selectedZone?.name || '',
                recordType: formRecordType,
                recordName: formRecordName,
                expectedContent: formExpectedContent
            });
            showToast(t('monitorAdded'));
            setMonitors(prev => [...prev, data.monitor]);
            setShowForm(false);
            setFormZoneId('');
            setFormRecordType('A');
            setFormRecordName('');
            setFormExpectedContent('');
        } catch (err) {
            if (err instanceof ApiError) {
                showToast(err.message || t('errorOccurred'), 'error');
            } else {
                showToast(t('errorOccurred'), 'error');
            }
        }
        setFormSubmitting(false);
    };

    const formatDate = (iso) => {
        if (!iso) return '-';
        try {
            const d = new Date(iso);
            return d.toLocaleString();
        } catch {
            return iso;
        }
    };

    const failedCount = monitors.filter(m => m.lastStatus === 'fail').length;

    if (!show) return null;

    return (
        <div
            className="modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="glass-card fade-in modal-content" role="dialog" aria-label={t('monitors')} style={{ padding: '2rem', maxWidth: '620px', width: '90%', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                        <Activity size={20} />
                        {t('monitors')}
                        {failedCount > 0 && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px',
                                borderRadius: '10px', background: 'var(--error)', color: '#fff',
                                marginLeft: '4px'
                            }}>
                                {failedCount}
                            </span>
                        )}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            onClick={() => setShowForm(!showForm)}
                            style={{
                                border: 'none', background: 'var(--primary)', color: '#fff',
                                cursor: 'pointer', padding: '5px 10px', display: 'flex',
                                alignItems: 'center', gap: '4px', borderRadius: '6px',
                                fontSize: '0.75rem', fontWeight: 600, transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                            <Plus size={14} />
                            {t('monitorAdd')}
                        </button>
                        <button
                            onClick={onClose}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}
                            aria-label="Close"
                        >
                            <X size={18} color="var(--text-muted)" />
                        </button>
                    </div>
                </div>

                {/* Add Monitor Form */}
                {showForm && (
                    <form onSubmit={handleAdd} style={{
                        padding: '1rem', borderRadius: '8px', background: 'var(--hover-bg)',
                        marginBottom: '1rem', border: '1px solid var(--border)'
                    }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                                    {t('monitorZone')}
                                </label>
                                <select
                                    value={formZoneId}
                                    onChange={e => setFormZoneId(e.target.value)}
                                    style={{ width: '100%', fontSize: '0.8rem', padding: '6px 8px' }}
                                    required
                                >
                                    <option value="">{t('monitorSelectZone')}</option>
                                    {(zones || []).map(z => (
                                        <option key={z.id} value={z.id}>{z.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                                    {t('type')}
                                </label>
                                <select
                                    value={formRecordType}
                                    onChange={e => setFormRecordType(e.target.value)}
                                    style={{ width: '100%', fontSize: '0.8rem', padding: '6px 8px' }}
                                    required
                                >
                                    {RECORD_TYPES.map(rt => (
                                        <option key={rt} value={rt}>{rt}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                                    {t('monitorRecordName')}
                                </label>
                                <input
                                    type="text"
                                    value={formRecordName}
                                    onChange={e => setFormRecordName(e.target.value)}
                                    placeholder="www.example.com"
                                    style={{ width: '100%', fontSize: '0.8rem', padding: '6px 8px' }}
                                    required
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                                    {t('monitorExpectedContent')}
                                </label>
                                <input
                                    type="text"
                                    value={formExpectedContent}
                                    onChange={e => setFormExpectedContent(e.target.value)}
                                    placeholder="1.2.3.4"
                                    style={{ width: '100%', fontSize: '0.8rem', padding: '6px 8px' }}
                                    required
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} style={{ fontSize: '0.75rem', padding: '5px 12px' }}>
                                {t('cancel')}
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={formSubmitting || !formZoneId || !formRecordName || !formExpectedContent}
                                style={{ fontSize: '0.75rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                {formSubmitting ? <RefreshCw className="spin" size={13} /> : <Plus size={13} />}
                                {t('monitorAdd')}
                            </button>
                        </div>
                    </form>
                )}

                {/* Monitors List */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <RefreshCw className="spin" size={24} style={{ color: 'var(--primary)' }} />
                    </div>
                ) : monitors.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        <HelpCircle size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                        <p style={{ fontSize: '0.875rem' }}>{t('monitorNone')}</p>
                        <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{t('monitorNoneHint')}</p>
                    </div>
                ) : (
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {monitors.map(monitor => (
                            <div key={monitor.id} style={{
                                padding: '0.75rem',
                                borderRadius: '8px',
                                background: 'var(--hover-bg)',
                                marginBottom: '0.5rem',
                                border: `1px solid ${monitor.lastStatus === 'fail' ? 'var(--error)' : 'var(--border)'}`,
                                opacity: monitor.enabled ? 1 : 0.6
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            <StatusBadge status={monitor.lastStatus} />
                                            <span className="badge badge-blue" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                                                {monitor.recordType}
                                            </span>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>
                                                {monitor.recordName}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                                            {monitor.zoneName || monitor.zoneId} &mdash; {t('monitorExpected')}: <code style={{ fontSize: '0.7rem' }}>{monitor.expectedContent}</code>
                                        </div>
                                        {monitor.lastCheck && (
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {monitor.lastStatus === 'ok' ? (
                                                    <CheckCircle size={10} color="var(--success)" />
                                                ) : monitor.lastStatus === 'fail' ? (
                                                    <AlertCircle size={10} color="var(--error)" />
                                                ) : null}
                                                {t('monitorLastCheck')}: {formatDate(monitor.lastCheck)}
                                            </div>
                                        )}
                                        {monitor.lastStatus === 'fail' && monitor.lastError && (
                                            <div style={{
                                                fontSize: '0.65rem', color: 'var(--error)',
                                                marginTop: '3px', padding: '3px 6px',
                                                background: 'var(--error-bg)', borderRadius: '4px'
                                            }}>
                                                {monitor.lastError}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleDelete(monitor.id)}
                                        style={{
                                            border: 'none', background: 'transparent', cursor: 'pointer',
                                            padding: '4px', display: 'flex', flexShrink: 0,
                                            color: 'var(--text-muted)', transition: 'color 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                        title={t('monitorDelete')}
                                        aria-label={t('monitorDelete')}
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {t('monitorAutoRefresh')}
                    </span>
                    <button className="btn btn-outline" onClick={onClose} style={{ fontSize: '0.75rem' }}>{t('cancel')}</button>
                </div>
            </div>
        </div>
    );
};

export default MonitorsModal;
