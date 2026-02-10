import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Server, Edit2, Trash2, RefreshCw, AlertCircle, X, Copy } from 'lucide-react';
import CustomSelect from './CustomSelect.jsx';

const SaasTab = forwardRef(({ zone, hostnames, filteredSaaS, loading, fetchHostnames, getHeaders, t, showToast, openConfirm }, ref) => {
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
    const [showVerifyModal, setShowVerifyModal] = useState(false);
    const [verifyingSaaS, setVerifyingSaaS] = useState(null);
    const [fallback, setFallback] = useState({ value: '', status: '' });
    const [fallbackLoading, setFallbackLoading] = useState(false);
    const [error, setError] = useState(null);

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

    // Fetch fallback on mount
    useEffect(() => {
        fetchFallback();
    }, [zone.id]);

    // Lock body scroll when SaaS modals are open
    useEffect(() => {
        const anyModalOpen = showSaaSModal || showVerifyModal;
        if (anyModalOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
        return () => {
            document.body.classList.remove('modal-open');
        };
    }, [showSaaSModal, showVerifyModal]);

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
                const data = await res.json().catch((err) => { console.error('Failed to parse response JSON:', err); return {}; });
                showToast(data.message || t('errorOccurred'), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setFallbackLoading(false);
    };

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

    const handleSaaSSubmit = async (e) => {
        e.preventDefault();
        const method = editingSaaS ? 'PATCH' : 'POST';
        const url = `/api/zones/${zone.id}/custom_hostnames${editingSaaS ? `?id=${editingSaaS.id}` : ''}`;

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
            payload.custom_origin_snihost = origin;
        } else if (editingSaaS) {
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
            const data = await res.json().catch((err) => { console.error('Failed to parse response JSON:', err); return {}; });
            showToast(data.message || t('errorOccurred'), 'error');
        }
    };

    const deleteSaaS = async (id) => {
        openConfirm(t('confirmTitle'), t('confirmDeleteSaaS'), async () => {
            const res = await fetch(`/api/zones/${zone.id}/custom_hostnames?id=${id}`, {
                method: 'DELETE',
                headers: getHeaders(true)
            });
            if (res.ok) {
                fetchHostnames();
                showToast(t('deleteSuccess'));
            } else {
                const data = await res.json().catch((err) => { console.error('Failed to parse response JSON:', err); return {}; });
                showToast(data.message || t('errorOccurred'), 'error');
            }
        });
    };

    const openAddSaaS = () => {
        setEditingSaaS(null);
        setNewSaaS(initialSaaS);
        setShowSaaSModal(true);
    };

    // Expose openAddSaaS to parent via ref
    useImperativeHandle(ref, () => ({
        openAddSaaS
    }));

    return (
        <>
            <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.5rem', background: 'var(--subtle-bg)' }}>
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
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--subtle-bg)', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase' }}>
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
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--subtle-bg)', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
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

            {/* SaaS Modal */}
            {showSaaSModal && (
                <div
                    className="modal-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowSaaSModal(false); setEditingSaaS(null); setNewSaaS(initialSaaS); } }}
                >
                    <div className="glass-card fade-in modal-content" role="dialog" aria-label={editingSaaS ? t('editSaaS') : t('addSaaS')} style={{ padding: '2rem', maxWidth: '450px', width: '90%', position: 'relative' }}>
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
                                                setNewSaaS({ ...newSaaS, custom_origin_server: ' ' });
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

            {/* Verification Modal */}
            {showVerifyModal && verifyingSaaS && (
                <div
                    className="modal-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowVerifyModal(false); }}
                >
                    <div className="glass-card fade-in modal-content" role="dialog" aria-label={t('verificationRecords')} style={{ padding: '2rem', maxWidth: '600px', width: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>{t('verificationRecords')}</h2>
                            <button className="btn btn-outline" style={{ padding: '4px', border: 'none' }} onClick={() => setShowVerifyModal(false)} aria-label="Close">
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {verifyingSaaS.ownership_verification && (
                                <div>
                                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>{t('ownership')}</h4>
                                    <div style={{ background: 'var(--subtle-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div>
                                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyType')}</p>
                                            <code style={{ fontSize: '0.8125rem', background: 'var(--code-bg)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px' }}>{verifyingSaaS.ownership_verification.type}</code>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyName')}</p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <code style={{ fontSize: '0.8125rem', background: 'var(--code-bg)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{verifyingSaaS.ownership_verification.name}</code>
                                                <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => { navigator.clipboard.writeText(verifyingSaaS.ownership_verification.name); showToast(t('copied')); }}>
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyValue')}</p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <code style={{ fontSize: '0.8125rem', background: 'var(--code-bg)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{verifyingSaaS.ownership_verification.value}</code>
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
                                            <div key={idx} style={{ background: 'var(--subtle-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <code style={{ fontSize: '0.8125rem', background: 'var(--code-bg)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px' }}>TXT</code>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('verifyMethod')}</span>
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyName')}</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <code style={{ fontSize: '0.8125rem', background: 'var(--code-bg)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{rec.txt_name}</code>
                                                        <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => { navigator.clipboard.writeText(rec.txt_name); showToast(t('copied')); }}>
                                                            <Copy size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyValue')}</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <code style={{ fontSize: '0.8125rem', background: 'var(--code-bg)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{rec.txt_value}</code>
                                                        <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => { navigator.clipboard.writeText(rec.txt_value); showToast(t('copied')); }}>
                                                            <Copy size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {verifyingSaaS.ssl.cname && (
                                            <div style={{ background: 'var(--subtle-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <code style={{ fontSize: '0.8125rem', background: 'var(--code-bg)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px' }}>CNAME</code>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('verifyMethod')}</span>
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyName')}</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <code style={{ fontSize: '0.8125rem', background: 'var(--code-bg)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{verifyingSaaS.hostname}</code>
                                                        <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => { navigator.clipboard.writeText(verifyingSaaS.hostname); showToast(t('copied')); }}>
                                                            <Copy size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('verifyValue')}</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <code style={{ fontSize: '0.8125rem', background: 'var(--code-bg)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', flex: 1 }}>{verifyingSaaS.ssl.cname_target}</code>
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
        </>
    );
});

export default SaasTab;
