import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle, RefreshCw, Copy, X } from 'lucide-react';

const TotpModal = ({ show, onClose, auth, t, showToast }) => {
    const [setupStep, setSetupStep] = useState(null);
    const [secret, setSecret] = useState('');
    const [uri, setUri] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        if (!show) return;
        const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [show, onClose]);

    if (!show) return null;

    const handleSetup = async () => {
        setSetupStep('loading');
        setError('');
        setCode('');
        try {
            const res = await fetch('/api/account/totp-setup', {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            const data = await res.json();
            if (res.ok && data.secret) {
                setSecret(data.secret);
                setUri(data.uri);
                setSetupStep('qr');
            } else {
                setError(data.error || 'Failed to generate TOTP secret');
                setSetupStep(null);
            }
        } catch (e) {
            console.error('Failed to start TOTP setup:', e);
            setError('Failed to start TOTP setup');
            setSetupStep(null);
        }
    };

    const handleVerify = async () => {
        if (!code || code.length !== 6) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/account/totp-setup', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setEnabled(true);
                setSetupStep(null);
                setCode('');
                showToast(t('totpVerified'), 'success');
            } else {
                setError(data.error || t('totpInvalid'));
            }
        } catch (e) {
            console.error('Failed to verify TOTP:', e);
            setError(t('errorOccurred'));
        }
        setLoading(false);
    };

    const handleDisable = async () => {
        if (!code || code.length !== 6) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/account/totp-setup', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setEnabled(false);
                setSetupStep(null);
                setCode('');
                showToast(t('totpDisabled'), 'success');
            } else {
                setError(data.error || t('totpInvalid'));
            }
        } catch (e) {
            console.error('Failed to disable TOTP:', e);
            setError(t('errorOccurred'));
        }
        setLoading(false);
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 200 }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="glass-card fade-in modal-content" role="dialog" aria-label={t('totpManage')} style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield size={18} color="#9333ea" /> {t('totpManage')}
                    </h3>
                    <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }} aria-label="Close">
                        <X size={18} color="var(--text-muted)" />
                    </button>
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    {t('totpSetupDesc')}
                </p>

                {setupStep === 'qr' ? (
                    <div className="fade-in">
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                            {t('totpScanQR')}
                        </p>
                        <div style={{ padding: '0.75rem', background: 'var(--hover-bg)', borderRadius: '8px', marginBottom: '0.75rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{t('totpSecretKey')}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <code style={{ fontSize: '0.8rem', fontWeight: 600, wordBreak: 'break-all', color: 'var(--text)' }}>{secret}</code>
                                <button onClick={() => { navigator.clipboard.writeText(secret); showToast(t('copied'), 'success'); }}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', display: 'flex', color: 'var(--text-muted)', flexShrink: 0 }}
                                    aria-label="Copy secret key">
                                    <Copy size={14} />
                                </button>
                            </div>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{t('totpEnterCode')}</p>
                        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                                placeholder={t('totpCodePlaceholder')} value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) handleVerify(); }}
                                style={{ width: '100%', textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.3em' }}
                                autoFocus />
                        </div>
                        {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{error}</p>}
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={() => { setSetupStep(null); setCode(''); setError(''); }}>{t('cancel')}</button>
                            <button className="btn btn-primary" onClick={handleVerify} disabled={loading || code.length !== 6}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {loading ? <RefreshCw className="spin" size={14} /> : <CheckCircle size={14} />}
                                {t('totpVerify')}
                            </button>
                        </div>
                    </div>
                ) : setupStep === 'disabling' ? (
                    <div className="fade-in">
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                            {t('totpDisableDesc')}
                        </p>
                        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                                placeholder={t('totpCodePlaceholder')} value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) handleDisable(); }}
                                style={{ width: '100%', textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.3em' }}
                                autoFocus />
                        </div>
                        {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{error}</p>}
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={() => { setSetupStep(null); setCode(''); setError(''); }}>{t('cancel')}</button>
                            <button className="btn btn-primary" onClick={handleDisable} disabled={loading || code.length !== 6}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--error)', borderColor: 'var(--error)' }}>
                                {loading ? <RefreshCw className="spin" size={14} /> : <X size={14} />}
                                {t('totpDisable')}
                            </button>
                        </div>
                    </div>
                ) : setupStep === 'loading' ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <RefreshCw className="spin" size={20} color="var(--primary)" />
                    </div>
                ) : (
                    <div>
                        <div style={{
                            padding: '0.75rem 1rem', background: enabled ? 'var(--success-bg)' : 'var(--hover-bg)',
                            borderRadius: '8px', marginBottom: '1rem',
                            border: enabled ? '1px solid var(--success-border)' : '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', gap: '0.75rem'
                        }}>
                            <Shield size={20} color={enabled ? 'var(--success)' : 'var(--text-muted)'} />
                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: enabled ? 'var(--success)' : 'var(--text)' }}>
                                    {enabled ? t('totpEnabled') : t('totpNotEnabled')}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={onClose}>{t('cancel')}</button>
                            {enabled ? (
                                <button className="btn btn-outline" onClick={() => { setSetupStep('disabling'); setCode(''); setError(''); }}
                                    style={{ color: 'var(--error)', borderColor: 'var(--error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <X size={14} />
                                    {t('totpDisable')}
                                </button>
                            ) : (
                                <button className="btn btn-primary" onClick={handleSetup}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Shield size={14} />
                                    {t('totpEnable')}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TotpModal;
