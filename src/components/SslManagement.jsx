import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Shield, ShieldCheck, ShieldAlert, ShieldOff, ToggleLeft, ToggleRight, ChevronDown, AlertTriangle, CheckCircle } from 'lucide-react';

const SslManagement = ({ zone, getHeaders, t, showToast }) => {
    const [sslMode, setSslMode] = useState(null);
    const [alwaysHttps, setAlwaysHttps] = useState(null);
    const [minTls, setMinTls] = useState(null);
    const [autoRewrites, setAutoRewrites] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updatingSsl, setUpdatingSsl] = useState(false);
    const [updatingHttps, setUpdatingHttps] = useState(false);
    const [updatingTls, setUpdatingTls] = useState(false);
    const [updatingRewrites, setUpdatingRewrites] = useState(false);

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/zones/${zone.id}/ssl`, { headers: getHeaders() });
            const data = await res.json();
            if (data.success) {
                setSslMode(data.ssl?.value || 'off');
                setAlwaysHttps(data.always_use_https?.value || 'off');
                setMinTls(data.min_tls_version?.value || '1.0');
                setAutoRewrites(data.automatic_https_rewrites?.value || 'off');
            }
        } catch (e) {
            console.error('Failed to fetch SSL settings:', e);
        }
        setLoading(false);
    }, [zone.id]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const updateSetting = async (setting, value, setUpdating) => {
        setUpdating(true);
        try {
            const res = await fetch(`/api/zones/${zone.id}/ssl`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({ setting, value })
            });
            const data = await res.json();
            if (data.success) {
                showToast(t('sslUpdateSuccess'));
                return true;
            } else {
                showToast(data.errors?.[0]?.message || t('errorOccurred'), 'error');
                return false;
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
            return false;
        } finally {
            setUpdating(false);
        }
    };

    const handleSslModeChange = async (mode) => {
        const prev = sslMode;
        setSslMode(mode);
        const success = await updateSetting('ssl_mode', mode, setUpdatingSsl);
        if (!success) setSslMode(prev);
    };

    const handleAlwaysHttpsToggle = async () => {
        const newValue = alwaysHttps === 'on' ? 'off' : 'on';
        const prev = alwaysHttps;
        setAlwaysHttps(newValue);
        const success = await updateSetting('always_use_https', newValue, setUpdatingHttps);
        if (!success) setAlwaysHttps(prev);
    };

    const handleMinTlsChange = async (version) => {
        const prev = minTls;
        setMinTls(version);
        const success = await updateSetting('min_tls_version', version, setUpdatingTls);
        if (!success) setMinTls(prev);
    };

    const handleAutoRewritesToggle = async () => {
        const newValue = autoRewrites === 'on' ? 'off' : 'on';
        const prev = autoRewrites;
        setAutoRewrites(newValue);
        const success = await updateSetting('automatic_https_rewrites', newValue, setUpdatingRewrites);
        if (!success) setAutoRewrites(prev);
    };

    const sslModes = [
        {
            value: 'off',
            label: t('sslModeOff'),
            description: t('sslModeOffDesc'),
            color: '#ef4444',
            bgColor: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            icon: <ShieldOff size={20} color="#ef4444" />,
            badge: null,
        },
        {
            value: 'flexible',
            label: t('sslModeFlexible'),
            description: t('sslModeFlexibleDesc'),
            color: '#f59e0b',
            bgColor: 'rgba(245, 158, 11, 0.08)',
            borderColor: 'rgba(245, 158, 11, 0.3)',
            icon: <ShieldAlert size={20} color="#f59e0b" />,
            badge: null,
        },
        {
            value: 'full',
            label: t('sslModeFull'),
            description: t('sslModeFullDesc'),
            color: '#3b82f6',
            bgColor: 'rgba(59, 130, 246, 0.08)',
            borderColor: 'rgba(59, 130, 246, 0.3)',
            icon: <Shield size={20} color="#3b82f6" />,
            badge: null,
        },
        {
            value: 'strict',
            label: t('sslModeStrict'),
            description: t('sslModeStrictDesc'),
            color: '#22c55e',
            bgColor: 'rgba(34, 197, 94, 0.08)',
            borderColor: 'rgba(34, 197, 94, 0.3)',
            icon: <ShieldCheck size={20} color="#22c55e" />,
            badge: t('recommended'),
        },
    ];

    const tlsVersions = [
        { value: '1.0', label: 'TLS 1.0' },
        { value: '1.1', label: 'TLS 1.1' },
        { value: '1.2', label: 'TLS 1.2', recommended: true },
        { value: '1.3', label: 'TLS 1.3' },
    ];

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem' }}>
                <RefreshCw size={24} className="spin" style={{ color: 'var(--primary)' }} />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* SSL/TLS Mode Selector */}
            <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--subtle-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield size={16} color="var(--primary)" />
                        <h3 style={{ fontSize: '0.875rem', margin: 0 }}>{t('sslModeTitle')}</h3>
                        {updatingSsl && <RefreshCw size={12} className="spin" style={{ color: 'var(--primary)' }} />}
                    </div>
                    <button
                        className="btn btn-outline"
                        onClick={fetchSettings}
                        disabled={loading}
                        style={{ padding: '4px 8px', height: 'auto', fontSize: '0.75rem' }}
                    >
                        <RefreshCw size={12} className={loading ? 'spin' : ''} />
                    </button>
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                    {t('sslModeDescription')}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    {sslModes.map((mode) => {
                        const isActive = sslMode === mode.value;
                        return (
                            <button
                                key={mode.value}
                                onClick={() => !updatingSsl && handleSslModeChange(mode.value)}
                                disabled={updatingSsl}
                                className="unstyled"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem',
                                    padding: '1rem',
                                    borderRadius: '10px',
                                    border: `2px solid ${isActive ? mode.color : 'var(--border)'}`,
                                    background: isActive ? mode.bgColor : 'transparent',
                                    cursor: updatingSsl ? 'wait' : 'pointer',
                                    transition: 'all 0.2s',
                                    textAlign: 'left',
                                    width: '100%',
                                    position: 'relative',
                                    opacity: updatingSsl && !isActive ? 0.6 : 1,
                                }}
                            >
                                {isActive && (
                                    <div style={{
                                        position: 'absolute', top: '8px', right: '8px',
                                    }}>
                                        <CheckCircle size={16} color={mode.color} />
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {mode.icon}
                                    <span style={{
                                        fontWeight: 600, fontSize: '0.8125rem',
                                        color: isActive ? mode.color : 'var(--text)',
                                    }}>
                                        {mode.label}
                                    </span>
                                    {mode.badge && (
                                        <span className="badge badge-green" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>
                                            {mode.badge}
                                        </span>
                                    )}
                                </div>
                                <span style={{
                                    fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5,
                                }}>
                                    {mode.description}
                                </span>
                                {/* Visual diagram */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    fontSize: '0.6rem', color: 'var(--text-muted)',
                                    padding: '0.35rem 0.5rem',
                                    background: 'var(--subtle-bg)',
                                    borderRadius: '6px',
                                    marginTop: '0.25rem',
                                }}>
                                    <span style={{ fontWeight: 600 }}>{t('sslDiagramBrowser')}</span>
                                    <span style={{ color: mode.value === 'off' ? '#ef4444' : '#22c55e' }}>
                                        {mode.value === 'off' ? '---' : '==='}
                                    </span>
                                    <span style={{ fontWeight: 600 }}>CF</span>
                                    <span style={{
                                        color: mode.value === 'off' || mode.value === 'flexible' ? '#ef4444' : '#22c55e'
                                    }}>
                                        {mode.value === 'off' || mode.value === 'flexible' ? '---' : '==='}
                                    </span>
                                    <span style={{ fontWeight: 600 }}>{t('sslDiagramOrigin')}</span>
                                    {mode.value === 'strict' && (
                                        <CheckCircle size={10} color="#22c55e" style={{ marginLeft: '2px' }} />
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {sslMode === 'off' && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '0.5rem 0.75rem', borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                        marginTop: '0.75rem', fontSize: '0.75rem', color: '#ef4444'
                    }}>
                        <AlertTriangle size={14} />
                        <span>{t('sslOffWarning')}</span>
                    </div>
                )}
            </div>

            {/* Always Use HTTPS */}
            <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--subtle-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '0.875rem', margin: 0 }}>{t('sslAlwaysHttps')}</h3>
                            {updatingHttps && <RefreshCw size={12} className="spin" style={{ color: 'var(--primary)' }} />}
                            <span className={`badge ${alwaysHttps === 'on' ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: '0.65rem' }}>
                                {alwaysHttps === 'on' ? 'ON' : 'OFF'}
                            </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                            {t('sslAlwaysHttpsDesc')}
                        </p>
                    </div>
                    <button
                        className="btn"
                        onClick={handleAlwaysHttpsToggle}
                        disabled={updatingHttps}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: alwaysHttps === 'on' ? 'var(--primary)' : 'var(--subtle-bg)',
                            color: alwaysHttps === 'on' ? 'white' : 'var(--text)',
                            border: alwaysHttps === 'on' ? 'none' : '1px solid var(--border)',
                            padding: '0.5rem 1rem', fontSize: '0.8125rem',
                            minWidth: '80px', justifyContent: 'center',
                        }}
                    >
                        {updatingHttps ? (
                            <RefreshCw size={14} className="spin" />
                        ) : alwaysHttps === 'on' ? (
                            <ToggleRight size={18} />
                        ) : (
                            <ToggleLeft size={18} />
                        )}
                    </button>
                </div>
            </div>

            {/* Minimum TLS Version */}
            <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--subtle-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.875rem', margin: 0 }}>{t('sslMinTls')}</h3>
                    {updatingTls && <RefreshCw size={12} className="spin" style={{ color: 'var(--primary)' }} />}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                    {t('sslMinTlsDesc')}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {tlsVersions.map((ver) => {
                        const isActive = minTls === ver.value;
                        return (
                            <button
                                key={ver.value}
                                onClick={() => !updatingTls && handleMinTlsChange(ver.value)}
                                disabled={updatingTls}
                                className="btn"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '0.5rem 1rem',
                                    fontSize: '0.8125rem',
                                    fontWeight: isActive ? 600 : 400,
                                    background: isActive ? 'var(--primary)' : 'transparent',
                                    color: isActive ? 'white' : 'var(--text)',
                                    border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    borderRadius: '8px',
                                    cursor: updatingTls ? 'wait' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: updatingTls && !isActive ? 0.6 : 1,
                                }}
                            >
                                {ver.label}
                                {ver.recommended && (
                                    <span className="badge badge-green" style={{
                                        fontSize: '0.55rem', padding: '1px 4px',
                                        background: isActive ? 'rgba(255,255,255,0.25)' : undefined,
                                        color: isActive ? 'white' : undefined,
                                    }}>
                                        {t('recommended')}
                                    </span>
                                )}
                                {isActive && <CheckCircle size={14} />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Automatic HTTPS Rewrites */}
            <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--subtle-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '0.875rem', margin: 0 }}>{t('sslAutoRewrites')}</h3>
                            {updatingRewrites && <RefreshCw size={12} className="spin" style={{ color: 'var(--primary)' }} />}
                            <span className={`badge ${autoRewrites === 'on' ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: '0.65rem' }}>
                                {autoRewrites === 'on' ? 'ON' : 'OFF'}
                            </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                            {t('sslAutoRewritesDesc')}
                        </p>
                    </div>
                    <button
                        className="btn"
                        onClick={handleAutoRewritesToggle}
                        disabled={updatingRewrites}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: autoRewrites === 'on' ? 'var(--primary)' : 'var(--subtle-bg)',
                            color: autoRewrites === 'on' ? 'white' : 'var(--text)',
                            border: autoRewrites === 'on' ? 'none' : '1px solid var(--border)',
                            padding: '0.5rem 1rem', fontSize: '0.8125rem',
                            minWidth: '80px', justifyContent: 'center',
                        }}
                    >
                        {updatingRewrites ? (
                            <RefreshCw size={14} className="spin" />
                        ) : autoRewrites === 'on' ? (
                            <ToggleRight size={18} />
                        ) : (
                            <ToggleLeft size={18} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SslManagement;
