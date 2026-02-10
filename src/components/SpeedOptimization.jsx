import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Zap, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const SETTINGS_META = [
    {
        key: 'rocket_loader',
        type: 'toggle',
        descKey: 'speedRocketLoaderDesc',
        warningKey: 'speedRocketLoaderWarning',
    },
    {
        key: 'minify',
        type: 'minify',
        descKey: 'speedMinifyDesc',
    },
    {
        key: 'brotli',
        type: 'toggle',
        descKey: 'speedBrotliDesc',
    },
    {
        key: 'early_hints',
        type: 'toggle',
        descKey: 'speedEarlyHintsDesc',
    },
    {
        key: 'h2_prioritization',
        type: 'toggle',
        descKey: 'speedH2Desc',
    },
    {
        key: '0rtt',
        type: 'toggle',
        descKey: 'speed0rttDesc',
    },
];

const SpeedOptimization = ({ zone, getHeaders, t, showToast }) => {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResults, setBulkResults] = useState(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [savingSettings, setSavingSettings] = useState({});

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(`/api/zones/${zone.id}/speed`, { headers: getHeaders() });
            const data = await res.json();
            if (data.success) {
                setSettings(data.settings);
            } else {
                const msg = data.errors?.[0]?.message || data.error || t('errorOccurred');
                setFetchError(msg);
            }
        } catch (e) {
            console.error('Failed to fetch speed settings:', e);
            setFetchError(t('errorOccurred'));
        }
        setLoading(false);
    }, [zone.id]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handleBulkAction = async (action) => {
        setBulkLoading(true);
        setBulkResults(null);
        try {
            const res = await fetch(`/api/zones/${zone.id}/speed`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            if (data.success) {
                setBulkResults({ results: data.results, errors: data.errors });
                // Refresh settings from results
                if (data.results) {
                    setSettings(prev => ({ ...prev, ...data.results }));
                }
                showToast(action === 'enable_all' ? t('speedEnableAllSuccess') : t('speedDisableAllSuccess'));
            } else {
                showToast(data.errors?.[0]?.message || t('errorOccurred'), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setBulkLoading(false);
    };

    const handleToggle = async (settingKey, newValue) => {
        setSavingSettings(prev => ({ ...prev, [settingKey]: true }));
        try {
            const res = await fetch(`/api/zones/${zone.id}/speed`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({ action: 'update', setting: settingKey, value: newValue })
            });
            const data = await res.json();
            if (data.success) {
                setSettings(prev => ({ ...prev, [settingKey]: data.result }));
                showToast(t('updateSuccess'));
            } else {
                showToast(data.errors?.[0]?.message || t('errorOccurred'), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setSavingSettings(prev => ({ ...prev, [settingKey]: false }));
    };

    const handleMinifyToggle = async (field) => {
        const current = settings?.minify || { js: false, css: false, html: false };
        const newValue = { ...current, [field]: !current[field] };
        handleToggle('minify', newValue);
    };

    const isOn = (key) => {
        if (key === 'minify') {
            const v = settings?.minify;
            return v && (v.js || v.css || v.html);
        }
        return settings?.[key] === 'on';
    };

    const statusDot = (on) => (
        <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: on ? '#22c55e' : '#9ca3af',
            marginRight: '6px',
            flexShrink: 0
        }} />
    );

    const ToggleSwitch = ({ checked, onChange, disabled }) => (
        <button
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            disabled={disabled}
            style={{
                width: '40px',
                height: '22px',
                borderRadius: '11px',
                border: 'none',
                background: checked ? 'var(--primary)' : 'var(--border)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
                opacity: disabled ? 0.6 : 1
            }}
        >
            <span style={{
                position: 'absolute',
                top: '2px',
                left: checked ? '20px' : '2px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
        </button>
    );

    if (loading && !settings && !fetchError) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <RefreshCw size={20} className="spin" />
            </div>
        );
    }

    if (fetchError && !settings) {
        return (
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
                    onClick={fetchSettings}
                    style={{ alignSelf: 'flex-start', padding: '4px 12px', fontSize: '0.75rem', marginTop: '4px' }}
                >
                    <RefreshCw size={12} /> {t('refresh') || 'Retry'}
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Enable All / Disable All Section */}
            <div className="glass-card" style={{ padding: '1.5rem', background: 'var(--subtle-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                    <Zap size={20} color="var(--primary)" />
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('speedQuickActions')}</h3>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                    {t('speedQuickActionsDesc')}
                </p>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        className="btn"
                        onClick={() => handleBulkAction('enable_all')}
                        disabled={bulkLoading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: 'var(--primary)', color: 'white', border: 'none',
                            padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600,
                            borderRadius: '8px'
                        }}
                    >
                        {bulkLoading ? <RefreshCw size={16} className="spin" /> : <Zap size={16} />}
                        {t('speedEnableAll')}
                    </button>
                    <button
                        className="btn btn-outline"
                        onClick={() => handleBulkAction('disable_all')}
                        disabled={bulkLoading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '0.625rem 1.25rem', fontSize: '0.875rem',
                            borderRadius: '8px'
                        }}
                    >
                        {bulkLoading ? <RefreshCw size={16} className="spin" /> : null}
                        {t('speedDisableAll')}
                    </button>
                    <button
                        className="btn btn-outline"
                        onClick={fetchSettings}
                        disabled={loading}
                        style={{ padding: '0.625rem', borderRadius: '8px' }}
                        title={t('refresh')}
                    >
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    </button>
                </div>

                {/* Bulk results */}
                {bulkResults && (() => {
                    const hasAuthError = bulkResults.errors?.some(e => /auth|unauthorized/i.test(e.message));
                    return (
                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {SETTINGS_META.map(({ key }) => {
                                const val = bulkResults.results?.[key];
                                const err = bulkResults.errors?.find(e => e.setting === key);
                                const success = val !== null && val !== undefined && !err;
                                return (
                                    <div key={key} style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        fontSize: '0.75rem', color: success ? '#22c55e' : 'var(--error)'
                                    }}>
                                        {success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                        <span>{t(`speed_${key}`)}</span>
                                        {err && <span style={{ color: 'var(--text-muted)' }}>- {err.message}</span>}
                                    </div>
                                );
                            })}
                            {hasAuthError && (
                                <div style={{
                                    marginTop: '8px', padding: '0.5rem 0.75rem', borderRadius: '6px',
                                    background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
                                    fontSize: '0.75rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px'
                                }}>
                                    <AlertTriangle size={14} />
                                    <span>{t('tokenPermissionHint')}</span>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* Advanced / Customize Toggle */}
            <button
                className="unstyled"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
                    color: 'var(--primary)', padding: '0.25rem 0',
                    background: 'transparent', border: 'none'
                }}
            >
                {showAdvanced ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {t('speedAdvanced')}
            </button>

            {/* Individual Settings */}
            {showAdvanced && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {SETTINGS_META.map(({ key, type, descKey, warningKey }) => {
                        const isSaving = savingSettings[key];

                        if (type === 'minify') {
                            const minifyVal = settings?.minify || { js: false, css: false, html: false };
                            const anyOn = minifyVal.js || minifyVal.css || minifyVal.html;

                            return (
                                <div key={key} className="glass-card" style={{ padding: '1rem', background: 'var(--subtle-bg)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {statusDot(anyOn)}
                                            <h4 style={{ fontSize: '0.875rem', margin: 0 }}>{t('speed_minify')}</h4>
                                            {isSaving && <RefreshCw size={12} className="spin" style={{ color: 'var(--text-muted)' }} />}
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                                        {t(descKey)}
                                    </p>
                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                        {['js', 'css', 'html'].map(field => (
                                            <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <ToggleSwitch
                                                    checked={minifyVal[field]}
                                                    onChange={() => handleMinifyToggle(field)}
                                                    disabled={isSaving}
                                                />
                                                <span style={{ fontSize: '0.8125rem', fontWeight: 500, textTransform: 'uppercase' }}>{field}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        }

                        // Toggle type (on/off)
                        const currentValue = settings?.[key];
                        const on = currentValue === 'on';

                        return (
                            <div key={key} className="glass-card" style={{ padding: '1rem', background: 'var(--subtle-bg)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {statusDot(on)}
                                        <h4 style={{ fontSize: '0.875rem', margin: 0 }}>{t(`speed_${key}`)}</h4>
                                        {isSaving && <RefreshCw size={12} className="spin" style={{ color: 'var(--text-muted)' }} />}
                                    </div>
                                    <ToggleSwitch
                                        checked={on}
                                        onChange={() => handleToggle(key, on ? 'off' : 'on')}
                                        disabled={isSaving}
                                    />
                                </div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: warningKey ? '0.5rem' : 0, lineHeight: 1.5 }}>
                                    {t(descKey)}
                                </p>
                                {warningKey && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '0.4rem 0.75rem', borderRadius: '6px',
                                        background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
                                        fontSize: '0.7rem', color: '#f59e0b'
                                    }}>
                                        <AlertTriangle size={13} />
                                        <span>{t(warningKey)}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default SpeedOptimization;
