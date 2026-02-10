import React, { useState, useEffect } from 'react';
import { Clock, Trash2, RefreshCw, X, AlertCircle } from 'lucide-react';
import { getAuthHeaders } from '../utils/auth.ts';

const ScheduledChangesModal = ({ show, onClose, auth, t, showToast }) => {
    const [changes, setChanges] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchChanges = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scheduled-changes', {
                headers: getAuthHeaders(auth)
            });
            if (res.ok) {
                const data = await res.json();
                setChanges(data.changes || []);
            }
        } catch (err) {
            console.error('Failed to fetch scheduled changes:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (show) {
            fetchChanges();
        }
    }, [show]);

    const handleCancel = async (id) => {
        try {
            const res = await fetch(`/api/scheduled-changes?id=${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(auth, true),
                body: JSON.stringify({})
            });
            if (res.ok) {
                showToast(t('scheduleCancelled'));
                setChanges(prev => prev.filter(c => c.id !== id));
            } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || t('errorOccurred'), 'error');
            }
        } catch (err) {
            showToast(t('errorOccurred'), 'error');
        }
    };

    const formatDate = (iso) => {
        try {
            const d = new Date(iso);
            return d.toLocaleString();
        } catch {
            return iso;
        }
    };

    const actionLabel = (action) => {
        switch (action) {
            case 'create': return t('scheduleActionCreate');
            case 'update': return t('scheduleActionUpdate');
            case 'delete': return t('scheduleActionDelete');
            default: return action;
        }
    };

    if (!show) return null;

    return (
        <div
            className="modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="glass-card fade-in modal-content" role="dialog" aria-label={t('scheduledChanges')} style={{ padding: '2rem', maxWidth: '560px', width: '90%', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={20} />
                        {t('scheduledChanges')}
                    </h2>
                    <button
                        onClick={onClose}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}
                        aria-label="Close"
                    >
                        <X size={18} color="var(--text-muted)" />
                    </button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <RefreshCw className="spin" size={24} style={{ color: 'var(--primary)' }} />
                    </div>
                ) : changes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        <AlertCircle size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                        <p style={{ fontSize: '0.875rem' }}>{t('noScheduledChanges')}</p>
                    </div>
                ) : (
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {changes.map(change => (
                            <div key={change.id} style={{
                                padding: '0.75rem',
                                borderRadius: '8px',
                                background: 'var(--hover-bg)',
                                marginBottom: '0.5rem',
                                border: '1px solid var(--border)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            <span className={`badge ${change.action === 'create' ? 'badge-green' : change.action === 'delete' ? 'badge-orange' : 'badge-blue'}`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                                                {actionLabel(change.action)}
                                            </span>
                                            {change.record && change.record.type && (
                                                <span className="badge badge-blue" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                                                    {change.record.type}
                                                </span>
                                            )}
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)' }}>
                                                {change.zoneName || change.zoneId}
                                            </span>
                                        </div>
                                        {change.record && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                                {change.record.name}{change.record.content ? ` \u2192 ${change.record.content}` : ''}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            <Clock size={11} />
                                            {t('scheduledFor')}: {formatDate(change.scheduledAt)}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleCancel(change.id)}
                                        style={{
                                            border: 'none', background: 'transparent', cursor: 'pointer',
                                            padding: '4px', display: 'flex', flexShrink: 0,
                                            color: 'var(--text-muted)', transition: 'color 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                        title={t('cancelSchedule')}
                                        aria-label={t('cancelSchedule')}
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={onClose}>{t('cancel')}</button>
                </div>
            </div>
        </div>
    );
};

export default ScheduledChangesModal;
