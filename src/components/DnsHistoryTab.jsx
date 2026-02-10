import React, { useState, useEffect } from 'react';
import { RefreshCw, GitCompare, ArrowRight, X, Plus, Minus, ArrowLeftRight } from 'lucide-react';
import { getAuthHeaders } from '../utils/auth.ts';

const DnsHistoryTab = ({ zone, auth, onClose, onRollbackComplete, t, showToast, records }) => {
    const [snapshots, setSnapshots] = useState([]);
    const [snapshotsLoading, setSnapshotsLoading] = useState(false);
    const [rollbackLoading, setRollbackLoading] = useState(null);
    const [snapshotPage, setSnapshotPage] = useState(1);
    const [snapshotTotal, setSnapshotTotal] = useState(0);
    const [snapshotTotalPages, setSnapshotTotalPages] = useState(1);
    const snapshotPerPage = 10;

    // Diff state
    const [diffData, setDiffData] = useState(null);
    const [diffLoading, setDiffLoading] = useState(null);
    const [diffSnapshotKey, setDiffSnapshotKey] = useState(null);
    const [showDiffModal, setShowDiffModal] = useState(false);

    const fetchSnapshots = async (page = 1) => {
        setSnapshotsLoading(true);
        try {
            const res = await fetch(`/api/zones/${zone.id}/dns_history?page=${page}&per_page=${snapshotPerPage}`, {
                headers: getAuthHeaders(auth)
            });
            if (res.ok) {
                const data = await res.json();
                setSnapshots(data.snapshots || []);
                setSnapshotPage(data.page || 1);
                setSnapshotTotal(data.total || 0);
                setSnapshotTotalPages(data.total_pages || 1);
            }
        } catch (err) { console.error('Failed to fetch snapshots:', err); }
        setSnapshotsLoading(false);
    };

    useEffect(() => {
        fetchSnapshots(1);
    }, [zone.id]);

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
                onRollbackComplete();
                fetchSnapshots(snapshotPage);
                setShowDiffModal(false);
                setDiffData(null);
            } else {
                showToast(data.error || 'Rollback failed', 'error');
            }
        } catch (err) {
            showToast('Rollback failed', 'error');
        }
        setRollbackLoading(null);
    };

    const handleCompare = async (snapshotKey) => {
        setDiffLoading(snapshotKey);
        try {
            // Compare snapshot (from) against current live records (to)
            const res = await fetch(
                `/api/zones/${zone.id}/dns_history?action=diff&from=${encodeURIComponent(snapshotKey)}&to=live`,
                { headers: getAuthHeaders(auth) }
            );
            if (res.ok) {
                const data = await res.json();
                setDiffData(data.diff);
                setDiffSnapshotKey(snapshotKey);
                setShowDiffModal(true);
            } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || t('errorOccurred'), 'error');
            }
        } catch (err) {
            console.error('Failed to fetch diff:', err);
            showToast(t('errorOccurred'), 'error');
        }
        setDiffLoading(null);
    };

    const DiffModal = () => {
        if (!showDiffModal || !diffData) return null;

        const { added, removed, modified } = diffData;
        const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0;

        return (
            <div
                style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem'
                }}
                onClick={(e) => { if (e.target === e.currentTarget) { setShowDiffModal(false); setDiffData(null); } }}
            >
                <div className="glass-card fade-in" style={{
                    width: '100%', maxWidth: '720px', maxHeight: '80vh',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    padding: 0
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)'
                    }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <GitCompare size={18} color="var(--primary)" />
                            {t('diffTitle')}
                        </h3>
                        <button
                            className="btn btn-outline"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => { setShowDiffModal(false); setDiffData(null); }}
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Body */}
                    <div style={{ overflowY: 'auto', padding: '1rem 1.25rem', flex: 1 }}>
                        {!hasChanges ? (
                            <p style={{ textAlign: 'center', padding: '2rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {t('diffNoChanges')}
                            </p>
                        ) : (
                            <>
                                {/* Summary */}
                                <div style={{
                                    display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap',
                                    fontSize: '0.75rem'
                                }}>
                                    {added.length > 0 && (
                                        <span style={{
                                            background: '#dcfce7', color: '#166534', padding: '3px 10px',
                                            borderRadius: '12px', fontWeight: 600
                                        }}>
                                            +{added.length} {t('diffAdded')}
                                        </span>
                                    )}
                                    {removed.length > 0 && (
                                        <span style={{
                                            background: '#fee2e2', color: '#991b1b', padding: '3px 10px',
                                            borderRadius: '12px', fontWeight: 600
                                        }}>
                                            -{removed.length} {t('diffRemoved')}
                                        </span>
                                    )}
                                    {modified.length > 0 && (
                                        <span style={{
                                            background: '#fef9c3', color: '#854d0e', padding: '3px 10px',
                                            borderRadius: '12px', fontWeight: 600
                                        }}>
                                            ~{modified.length} {t('diffModified')}
                                        </span>
                                    )}
                                </div>

                                {/* Added section */}
                                {added.length > 0 && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <h4 style={{
                                            fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.5rem 0',
                                            display: 'flex', alignItems: 'center', gap: '6px', color: '#166534'
                                        }}>
                                            <Plus size={14} />
                                            {t('diffAddedSection')}
                                        </h4>
                                        {added.map((rec, i) => (
                                            <div key={`added-${i}`} style={{
                                                background: '#f0fdf4', border: '1px solid #bbf7d0',
                                                borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '0.4rem',
                                                fontSize: '0.75rem'
                                            }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>{rec.type}</span>
                                                    <span style={{ fontWeight: 600 }}>{rec.name}</span>
                                                    <ArrowRight size={12} color="var(--text-muted)" />
                                                    <span style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>{rec.content}</span>
                                                    {rec.ttl && <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>TTL: {rec.ttl === 1 ? 'Auto' : rec.ttl}</span>}
                                                    {rec.proxied !== undefined && <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{rec.proxied ? 'Proxied' : 'DNS only'}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Removed section */}
                                {removed.length > 0 && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <h4 style={{
                                            fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.5rem 0',
                                            display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b'
                                        }}>
                                            <Minus size={14} />
                                            {t('diffRemovedSection')}
                                        </h4>
                                        {removed.map((rec, i) => (
                                            <div key={`removed-${i}`} style={{
                                                background: '#fef2f2', border: '1px solid #fecaca',
                                                borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '0.4rem',
                                                fontSize: '0.75rem'
                                            }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>{rec.type}</span>
                                                    <span style={{ fontWeight: 600 }}>{rec.name}</span>
                                                    <ArrowRight size={12} color="var(--text-muted)" />
                                                    <span style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>{rec.content}</span>
                                                    {rec.ttl && <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>TTL: {rec.ttl === 1 ? 'Auto' : rec.ttl}</span>}
                                                    {rec.proxied !== undefined && <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{rec.proxied ? 'Proxied' : 'DNS only'}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Modified section */}
                                {modified.length > 0 && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <h4 style={{
                                            fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.5rem 0',
                                            display: 'flex', alignItems: 'center', gap: '6px', color: '#854d0e'
                                        }}>
                                            <ArrowLeftRight size={14} />
                                            {t('diffModifiedSection')}
                                        </h4>
                                        {modified.map((item, i) => (
                                            <div key={`mod-${i}`} style={{
                                                background: '#fefce8', border: '1px solid #fde68a',
                                                borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '0.4rem',
                                                fontSize: '0.75rem'
                                            }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
                                                    <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>{item.before.type}</span>
                                                    <span style={{ fontWeight: 600 }}>{item.before.name}</span>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '0.5rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                        <span style={{ color: '#991b1b', fontWeight: 500, fontSize: '0.7rem' }}>{t('diffBefore')}:</span>
                                                        <span style={{ color: '#991b1b', wordBreak: 'break-all' }}>{item.before.content}</span>
                                                        {item.before.ttl !== item.after.ttl && <span style={{ color: '#991b1b', fontSize: '0.65rem' }}>TTL: {item.before.ttl === 1 ? 'Auto' : item.before.ttl}</span>}
                                                        {item.before.proxied !== item.after.proxied && <span style={{ color: '#991b1b', fontSize: '0.65rem' }}>{item.before.proxied ? 'Proxied' : 'DNS only'}</span>}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                        <span style={{ color: '#166534', fontWeight: 500, fontSize: '0.7rem' }}>{t('diffAfter')}:</span>
                                                        <span style={{ color: '#166534', wordBreak: 'break-all' }}>{item.after.content}</span>
                                                        {item.before.ttl !== item.after.ttl && <span style={{ color: '#166534', fontSize: '0.65rem' }}>TTL: {item.after.ttl === 1 ? 'Auto' : item.after.ttl}</span>}
                                                        {item.before.proxied !== item.after.proxied && <span style={{ color: '#166534', fontSize: '0.65rem' }}>{item.after.proxied ? 'Proxied' : 'DNS only'}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{
                        display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
                        padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)'
                    }}>
                        <button
                            className="btn btn-outline"
                            style={{ padding: '6px 14px', fontSize: '0.75rem' }}
                            onClick={() => { setShowDiffModal(false); setDiffData(null); }}
                        >
                            {t('cancel') || 'Close'}
                        </button>
                        {hasChanges && diffSnapshotKey && (
                            <button
                                className="btn btn-primary"
                                style={{ padding: '6px 14px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => handleRollback(diffSnapshotKey)}
                                disabled={rollbackLoading === diffSnapshotKey}
                            >
                                {rollbackLoading === diffSnapshotKey ? <RefreshCw className="spin" size={13} /> : <RefreshCw size={13} />}
                                {t('rollback')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={18} color="var(--primary)" />
                    {t('dnsHistory')}
                </h3>
                <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    onClick={onClose}>
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
                                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button
                                            className="btn btn-outline"
                                            style={{ padding: '3px 8px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}
                                            onClick={() => handleCompare(snap.key)}
                                            disabled={diffLoading === snap.key}
                                        >
                                            {diffLoading === snap.key ? <RefreshCw className="spin" size={11} /> : <GitCompare size={11} />}
                                            {t('compare')}
                                        </button>
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
                    {snapshotTotalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '0.75rem 0', fontSize: '0.8rem' }}>
                            <button
                                className="btn btn-outline"
                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                disabled={snapshotPage <= 1 || snapshotsLoading}
                                onClick={() => { const p = snapshotPage - 1; setSnapshotPage(p); fetchSnapshots(p); }}
                            >
                                {t('prev') || 'Prev'}
                            </button>
                            <span style={{ color: 'var(--text-muted)' }}>
                                {snapshotPage} / {snapshotTotalPages}
                            </span>
                            <button
                                className="btn btn-outline"
                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                disabled={snapshotPage >= snapshotTotalPages || snapshotsLoading}
                                onClick={() => { const p = snapshotPage + 1; setSnapshotPage(p); fetchSnapshots(p); }}
                            >
                                {t('next') || 'Next'}
                            </button>
                        </div>
                    )}
                </div>
            )}
            <DiffModal />
        </div>
    );
};

export default DnsHistoryTab;
