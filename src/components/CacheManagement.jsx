import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ToggleLeft, ToggleRight, Trash2, Link, AlertTriangle } from 'lucide-react';

const CacheManagement = ({ zone, getHeaders, t, showToast, openConfirm }) => {
    const [devMode, setDevMode] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [toggling, setToggling] = useState(false);
    const [purgingAll, setPurgingAll] = useState(false);
    const [purgingUrls, setPurgingUrls] = useState(false);
    const [urlText, setUrlText] = useState('');
    const countdownRef = useRef(null);
    const [countdown, setCountdown] = useState(0);

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(`/api/zones/${zone.id}/cache`, { headers: getHeaders() });
            const data = await res.json();
            if (data.success) {
                if (data.development_mode) {
                    setDevMode(data.development_mode);
                    setCountdown(data.development_mode.time_remaining || 0);
                }
            } else {
                const msg = data.errors?.[0]?.message || data.error || t('errorOccurred');
                setFetchError(msg);
            }
        } catch (e) {
            console.error('Failed to fetch cache status:', e);
            setFetchError(t('errorOccurred'));
        }
        setLoading(false);
    }, [zone.id]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    // Countdown timer for development mode
    useEffect(() => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
        if (devMode?.value === 'on' && countdown > 0) {
            countdownRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(countdownRef.current);
                        countdownRef.current = null;
                        // Auto-refresh status when countdown ends
                        fetchStatus();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [devMode?.value, countdown, fetchStatus]);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const handleToggleDevMode = async () => {
        const newValue = devMode?.value === 'on' ? 'off' : 'on';
        setToggling(true);
        try {
            const res = await fetch(`/api/zones/${zone.id}/cache`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({ action: 'toggle_dev_mode', value: newValue })
            });
            const data = await res.json();
            if (data.success) {
                setDevMode(data.development_mode);
                setCountdown(data.development_mode?.time_remaining || 0);
                showToast(t(newValue === 'on' ? 'devModeEnabled' : 'devModeDisabled'));
            } else {
                showToast(data.errors?.[0]?.message || t('errorOccurred'), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setToggling(false);
    };

    const handlePurgeAll = () => {
        openConfirm(t('confirmTitle'), t('cachePurgeAllConfirm'), async () => {
            setPurgingAll(true);
            try {
                const res = await fetch(`/api/zones/${zone.id}/cache`, {
                    method: 'POST',
                    headers: getHeaders(true),
                    body: JSON.stringify({ action: 'purge_all' })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(t('cachePurgeAllSuccess'));
                } else {
                    showToast(data.errors?.[0]?.message || t('errorOccurred'), 'error');
                }
            } catch (e) {
                showToast(t('errorOccurred'), 'error');
            }
            setPurgingAll(false);
        });
    };

    const handlePurgeUrls = async () => {
        const urls = urlText.split('\n').map(u => u.trim()).filter(u => u.length > 0);
        if (urls.length === 0) {
            showToast(t('cacheUrlsEmpty'), 'error');
            return;
        }
        if (urls.length > 30) {
            showToast(t('cacheUrlsLimit'), 'error');
            return;
        }
        setPurgingUrls(true);
        try {
            const res = await fetch(`/api/zones/${zone.id}/cache`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({ action: 'purge_urls', urls })
            });
            const data = await res.json();
            if (data.success) {
                showToast(t('cachePurgeUrlsSuccess').replace('{count}', data.purged_count || urls.length));
                setUrlText('');
            } else {
                showToast(data.errors?.[0]?.message || t('errorOccurred'), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setPurgingUrls(false);
    };

    const urlCount = urlText.split('\n').map(u => u.trim()).filter(u => u.length > 0).length;
    const isDevModeOn = devMode?.value === 'on';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {fetchError && (
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: '6px',
                    padding: '0.75rem 1rem', borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)',
                    fontSize: '0.8125rem', color: 'var(--error, #ef4444)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={16} />
                        <span>{t('loadSettingsError').replace('{error}', fetchError)}</span>
                    </div>
                    {/auth/i.test(fetchError) && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {t('tokenPermissionHint')}
                        </span>
                    )}
                    <button
                        className="btn btn-outline"
                        onClick={fetchStatus}
                        style={{ alignSelf: 'flex-start', padding: '4px 12px', fontSize: '0.75rem', marginTop: '4px' }}
                    >
                        <RefreshCw size={12} /> {t('refresh') || 'Retry'}
                    </button>
                </div>
            )}
            {/* Development Mode */}
            <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--subtle-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontSize: '0.875rem', margin: 0 }}>{t('cacheDevMode')}</h3>
                        {!loading && (
                            <span className={`badge ${isDevModeOn ? 'badge-orange' : 'badge-green'}`} style={{ fontSize: '0.65rem' }}>
                                {isDevModeOn ? 'ON' : 'OFF'}
                            </span>
                        )}
                    </div>
                    <button
                        className="btn btn-outline"
                        onClick={fetchStatus}
                        disabled={loading}
                        style={{ padding: '4px 8px', height: 'auto', fontSize: '0.75rem' }}
                    >
                        <RefreshCw size={12} className={loading ? 'spin' : ''} />
                    </button>
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                    {t('cacheDevModeDesc')}
                </p>

                {isDevModeOn && countdown > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '0.5rem 0.75rem', borderRadius: '6px',
                        background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
                        marginBottom: '0.75rem', fontSize: '0.75rem', color: '#f59e0b'
                    }}>
                        <AlertTriangle size={14} />
                        <span>{t('cacheDevModeExpires').replace('{time}', formatTime(countdown))}</span>
                    </div>
                )}

                <button
                    className="btn"
                    onClick={handleToggleDevMode}
                    disabled={toggling || loading}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: isDevModeOn ? 'var(--error)' : 'var(--primary)',
                        color: 'white', border: 'none',
                        padding: '0.5rem 1rem', fontSize: '0.8125rem'
                    }}
                >
                    {toggling ? (
                        <RefreshCw size={14} className="spin" />
                    ) : isDevModeOn ? (
                        <ToggleRight size={14} />
                    ) : (
                        <ToggleLeft size={14} />
                    )}
                    {isDevModeOn ? t('cacheDevModeOff') : t('cacheDevModeOn')}
                </button>
            </div>

            {/* Purge All Cache */}
            <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--subtle-bg)' }}>
                <h3 style={{ fontSize: '0.875rem', margin: '0 0 0.5rem 0' }}>{t('cachePurgeAll')}</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                    {t('cachePurgeAllDesc')}
                </p>
                <button
                    className="btn"
                    onClick={handlePurgeAll}
                    disabled={purgingAll}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'var(--error)', color: 'white', border: 'none',
                        padding: '0.5rem 1rem', fontSize: '0.8125rem'
                    }}
                >
                    {purgingAll ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                    {t('cachePurgeAllBtn')}
                </button>
            </div>

            {/* Purge by URL */}
            <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--subtle-bg)' }}>
                <h3 style={{ fontSize: '0.875rem', margin: '0 0 0.5rem 0' }}>{t('cachePurgeUrls')}</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                    {t('cachePurgeUrlsDesc')}
                </p>
                <textarea
                    value={urlText}
                    onChange={(e) => setUrlText(e.target.value)}
                    placeholder={t('cachePurgeUrlsPlaceholder')}
                    rows={5}
                    style={{
                        width: '100%', resize: 'vertical', fontFamily: 'monospace',
                        fontSize: '0.8125rem', padding: '0.5rem 0.75rem',
                        borderRadius: '6px', border: '1px solid var(--border)',
                        background: 'var(--input-bg, white)', color: 'var(--text)',
                        marginBottom: '0.5rem', boxSizing: 'border-box'
                    }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{
                        fontSize: '0.7rem',
                        color: urlCount > 30 ? 'var(--error)' : 'var(--text-muted)'
                    }}>
                        {urlCount} / 30 URLs
                    </span>
                    {urlCount > 30 && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--error)' }}>
                            {t('cacheUrlsLimit')}
                        </span>
                    )}
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handlePurgeUrls}
                    disabled={purgingUrls || urlCount === 0 || urlCount > 30}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '0.5rem 1rem', fontSize: '0.8125rem'
                    }}
                >
                    {purgingUrls ? <RefreshCw size={14} className="spin" /> : <Link size={14} />}
                    {t('cachePurgeUrlsBtn')}
                </button>
            </div>
        </div>
    );
};

export default CacheManagement;
