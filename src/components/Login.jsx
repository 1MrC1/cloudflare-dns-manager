import React, { useState, useEffect } from 'react';
import { Globe, Server, User, Shield, Key, RefreshCw, Fingerprint, Languages, Zap } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { hashPassword, isPasswordStrong } from '../utils/auth.ts';
import SecurityBadges from './SecurityBadges.jsx';

const Login = ({ onLogin, t, lang, onLangChange }) => {
    const [username, setUsername] = useState('admin');
    const [password, setPassword] = useState('');
    const [token, setToken] = useState('');
    const [loginTab, setLoginTab] = useState('server'); // 'server' | 'client' | 'setup' | 'register'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const [remember, setRemember] = useState(false);
    const [openRegistration, setOpenRegistration] = useState(false);

    // TOTP 2FA state
    const [totpStep, setTotpStep] = useState(false);
    const [totpCode, setTotpCode] = useState('');
    const [totpUsername, setTotpUsername] = useState('');
    const [totpPassword, setTotpPassword] = useState('');

    // Setup account fields
    const [setupUsername, setSetupUsername] = useState('');
    const [setupToken, setSetupToken] = useState('');
    const [setupPassword, setSetupPassword] = useState('');
    const [setupConfirm, setSetupConfirm] = useState('');

    // Register fields
    const [regUsername, setRegUsername] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regConfirm, setRegConfirm] = useState('');

    // Fetch public settings on mount
    useEffect(() => {
        fetch('/api/public-settings').then(r => r.json()).then(data => {
            setOpenRegistration(!!data.openRegistration);
        }).catch((err) => { console.error('Failed to fetch public settings:', err); });
    }, []);

    const supportsPasskey = typeof window !== 'undefined' && !!window.PublicKeyCredential;

    const handlePasskeyLogin = async () => {
        const passkeyUsername = username.trim().toLowerCase();
        if (!passkeyUsername) {
            setError(t('passkeyUsernameRequired'));
            return;
        }
        setLoading(true);
        setError('');
        try {
            const optRes = await fetch('/api/passkey/login-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: passkeyUsername })
            });
            const optData = await optRes.json();
            if (!optRes.ok) {
                setError(optData.error || t('passkeyError'));
                setLoading(false);
                return;
            }
            const authResp = await startAuthentication({ optionsJSON: optData });
            const verifyRes = await fetch('/api/passkey/login-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(authResp)
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.token) {
                onLogin({
                    mode: 'server',
                    token: verifyData.token,
                    remember,
                    accounts: verifyData.accounts || [],
                    currentAccountIndex: verifyData.accounts?.[0]?.id || 0,
                    role: verifyData.role || 'user',
                    username: verifyData.username || passkeyUsername
                });
            } else {
                setError(verifyData.error || t('passkeyError'));
            }
        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                setError(t('passkeyError'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (window.location.protocol === 'http:' && !isLocalhost) {
            setError(t('httpWarning'));
            return;
        }

        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            if (loginTab === 'server') {
                const hashedPassword = await hashPassword(password);
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username.trim() || 'admin', password: hashedPassword })
                });
                const data = await res.json();
                if (res.ok) {
                    if (data.requiresTOTP) {
                        setTotpStep(true);
                        setTotpUsername(data.username);
                        setTotpPassword(hashedPassword);
                        setLoading(false);
                        return;
                    }
                    onLogin({
                        mode: 'server',
                        token: data.token,
                        refreshToken: data.refreshToken,
                        remember,
                        accounts: data.accounts || [],
                        currentAccountIndex: data.accounts?.[0]?.id || 0,
                        role: data.role || 'user',
                        username: data.username || 'admin'
                    });
                } else {
                    let errMsg = data.error || t('loginFailed');
                    if (errMsg.includes('Invalid username or password')) errMsg = t('invalidPassword');
                    if (errMsg.includes('Server is not configured')) errMsg = t('serverNotConfigured');
                    if (data.lockedUntil || errMsg.includes('temporarily locked')) errMsg = t('accountLocked');
                    if (data.needsSetup) {
                        errMsg = t('needsSetup');
                        setLoginTab('setup');
                        setSetupUsername(username.trim());
                    }
                    setError(errMsg);
                }
            } else if (loginTab === 'client') {
                const res = await fetch('/api/verify-token', {
                    headers: { 'X-Cloudflare-Token': token }
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    onLogin({ mode: 'client', token: token, remember });
                } else {
                    let errMsg = data.message || t('loginFailed');
                    if (errMsg === 'Invalid token') errMsg = t('invalidToken');
                    if (errMsg === 'No token provided') errMsg = t('tokenRequired');
                    if (errMsg === 'Failed to verify token') errMsg = t('verifyFailed');
                    setError(errMsg);
                }
            }
        } catch (err) {
            setError(t('errorOccurred'));
        } finally {
            setLoading(false);
        }
    };

    const handleSetupAccount = async (e) => {
        e.preventDefault();
        if (!setupUsername.trim() || !setupToken.trim() || !setupPassword.trim()) return;

        if (setupPassword !== setupConfirm) {
            setError(t('passwordMismatch'));
            return;
        }
        if (!isPasswordStrong(setupPassword)) {
            setError(t('passwordTooWeak'));
            return;
        }

        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            const hashedPwd = await hashPassword(setupPassword);
            const res = await fetch('/api/setup-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: setupUsername.trim().toLowerCase(), setupToken: setupToken.trim(), password: hashedPwd })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setSuccessMsg(t('setupSuccess'));
                setSetupUsername('');
                setSetupToken('');
                setSetupPassword('');
                setSetupConfirm('');
                setTimeout(() => { setLoginTab('server'); setSuccessMsg(''); }, 2000);
            } else {
                setError(data.error || t('setupFailed'));
            }
        } catch (err) {
            setError(t('errorOccurred'));
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!regUsername.trim() || !regPassword.trim()) return;

        if (regPassword !== regConfirm) {
            setError(t('passwordMismatch'));
            return;
        }
        if (!isPasswordStrong(regPassword)) {
            setError(t('passwordTooWeak'));
            return;
        }

        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            const hashedPwd = await hashPassword(regPassword);
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: regUsername.trim().toLowerCase(), password: hashedPwd })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setSuccessMsg(t('registerSuccess'));
                setRegUsername('');
                setRegPassword('');
                setRegConfirm('');
                setTimeout(() => { setLoginTab('server'); setSuccessMsg(''); }, 2000);
            } else {
                setError(data.error || t('registerFailed'));
            }
        } catch (err) {
            setError(t('errorOccurred'));
        } finally {
            setLoading(false);
        }
    };

    const handleTOTPVerify = async (e) => {
        e.preventDefault();
        if (!totpCode.trim()) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/verify-totp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: totpUsername, password: totpPassword, code: totpCode.trim() })
            });
            const data = await res.json();
            if (res.ok && data.token) {
                onLogin({
                    mode: 'server',
                    token: data.token,
                    refreshToken: data.refreshToken,
                    remember,
                    accounts: data.accounts || [],
                    currentAccountIndex: data.accounts?.[0]?.id || 0,
                    role: data.role || 'user',
                    username: data.username || totpUsername
                });
            } else {
                setError(data.error || t('totpInvalid'));
            }
        } catch (err) {
            setError(t('errorOccurred'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem' }}>
            <div className="glass-card login-card fade-in">
                <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10 }}>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            onLangChange(lang === 'zh' ? 'en' : 'zh');
                        }}
                        style={{ border: 'none', background: 'transparent', padding: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)', borderRadius: '8px', transition: 'background 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        title={lang === 'zh' ? 'English' : '中文'}
                        aria-label={lang === 'zh' ? 'Switch to English' : '切换到中文'}
                    >
                        <Languages size={20} />
                    </button>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'inline-flex', padding: '0.75rem', background: 'rgba(243, 128, 32, 0.1)', borderRadius: '12px', marginBottom: '1rem' }}>
                        <Zap size={32} color="var(--primary)" />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{t('title')}</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('subtitle')}</p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', padding: '4px', background: '#f3f4f6', borderRadius: '8px' }}>
                    <button
                        className={`btn ${loginTab === 'server' ? 'btn-primary' : 'btn-outline'}`}
                        style={{ flex: 1, padding: '0.4rem', border: 'none', fontSize: '0.8rem' }}
                        onClick={() => { setLoginTab('server'); setError(''); setSuccessMsg(''); setTotpStep(false); setTotpCode(''); }}
                    >
                        {t('serverMode')}
                    </button>
                    <button
                        className={`btn ${loginTab === 'client' ? 'btn-primary' : 'btn-outline'}`}
                        style={{ flex: 1, padding: '0.4rem', border: 'none', fontSize: '0.8rem' }}
                        onClick={() => { setLoginTab('client'); setError(''); setSuccessMsg(''); setTotpStep(false); setTotpCode(''); }}
                    >
                        {t('clientMode')}
                    </button>
                    {openRegistration ? (
                        <button
                            className={`btn ${loginTab === 'register' ? 'btn-primary' : 'btn-outline'}`}
                            style={{ flex: 1, padding: '0.4rem', border: 'none', fontSize: '0.8rem' }}
                            onClick={() => { setLoginTab('register'); setError(''); setSuccessMsg(''); setTotpStep(false); setTotpCode(''); }}
                        >
                            {t('register')}
                        </button>
                    ) : (
                        <button
                            className={`btn ${loginTab === 'setup' ? 'btn-primary' : 'btn-outline'}`}
                            style={{ flex: 1, padding: '0.4rem', border: 'none', fontSize: '0.8rem' }}
                            onClick={() => { setLoginTab('setup'); setError(''); setSuccessMsg(''); setTotpStep(false); setTotpCode(''); }}
                        >
                            {t('setupAccount')}
                        </button>
                    )}
                </div>

                {totpStep ? (
                    <form onSubmit={handleTOTPVerify}>
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'inline-flex', padding: '0.75rem', background: 'rgba(147, 51, 234, 0.1)', borderRadius: '12px', marginBottom: '0.75rem' }}>
                                <Shield size={28} color="#9333ea" />
                            </div>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>{t('totpStep')}</h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('totpRequired')}</p>
                        </div>
                        <div className="input-group">
                            <div style={{ position: 'relative' }}>
                                <Shield size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    placeholder={t('totpCodePlaceholder')}
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    style={{ paddingLeft: '38px', textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.3em' }}
                                    autoFocus
                                    required
                                />
                            </div>
                        </div>
                        {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading || totpCode.length !== 6}>
                            {loading ? <RefreshCw className="spin" size={18} /> : t('totpVerify')}
                        </button>
                        <button type="button" className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
                            onClick={() => { setTotpStep(false); setTotpCode(''); setError(''); }}>
                            {t('cancel') || 'Back'}
                        </button>
                    </form>
                ) : loginTab === 'register' ? (
                    <form onSubmit={handleRegister}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', textAlign: 'center' }}>
                            {t('registerDesc')}
                        </p>
                        <div className="input-group">
                            <label>{t('usernameLabel')}</label>
                            <div style={{ position: 'relative' }}>
                                <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                <input type="text" placeholder={t('usernamePlaceholder')} value={regUsername}
                                    onChange={(e) => setRegUsername(e.target.value)} style={{ paddingLeft: '38px' }} required />
                            </div>
                        </div>
                        <div className="input-group">
                            <label>{t('newPassword')}</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                <input type="password" placeholder={t('newPasswordPlaceholder2')} value={regPassword}
                                    onChange={(e) => setRegPassword(e.target.value)} style={{ paddingLeft: '38px' }} required />
                            </div>
                        </div>
                        <div className="input-group">
                            <label>{t('confirmNewPassword')}</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                <input type="password" placeholder={t('confirmNewPasswordPlaceholder')} value={regConfirm}
                                    onChange={(e) => setRegConfirm(e.target.value)} style={{ paddingLeft: '38px' }} required />
                            </div>
                        </div>

                        {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
                        {successMsg && <p style={{ color: 'var(--success)', fontSize: '0.75rem', marginBottom: '1rem', textAlign: 'center' }}>{successMsg}</p>}

                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                            {loading ? <RefreshCw className="spin" size={18} /> : t('register')}
                        </button>
                    </form>
                ) : loginTab === 'setup' ? (
                    <form onSubmit={handleSetupAccount}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', textAlign: 'center' }}>
                            {t('setupAccountDesc')}
                        </p>
                        <div className="input-group">
                            <label>{t('usernameLabel')}</label>
                            <div style={{ position: 'relative' }}>
                                <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                <input type="text" placeholder={t('usernamePlaceholder')} value={setupUsername}
                                    onChange={(e) => setSetupUsername(e.target.value)} style={{ paddingLeft: '38px' }} required />
                            </div>
                        </div>
                        <div className="input-group">
                            <label>{t('setupTokenLabel')}</label>
                            <div style={{ position: 'relative' }}>
                                <Shield size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                <input type="text" placeholder={t('setupTokenPlaceholder')} value={setupToken}
                                    onChange={(e) => setSetupToken(e.target.value)} style={{ paddingLeft: '38px', fontFamily: 'monospace', fontSize: '0.8rem' }} required />
                            </div>
                        </div>
                        <div className="input-group">
                            <label>{t('newPassword')}</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                <input type="password" placeholder={t('newPasswordPlaceholder2')} value={setupPassword}
                                    onChange={(e) => setSetupPassword(e.target.value)} style={{ paddingLeft: '38px' }} required />
                            </div>
                        </div>
                        <div className="input-group">
                            <label>{t('confirmNewPassword')}</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                <input type="password" placeholder={t('confirmNewPasswordPlaceholder')} value={setupConfirm}
                                    onChange={(e) => setSetupConfirm(e.target.value)} style={{ paddingLeft: '38px' }} required />
                            </div>
                        </div>

                        {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
                        {successMsg && <p style={{ color: 'var(--success)', fontSize: '0.75rem', marginBottom: '1rem', textAlign: 'center' }}>{successMsg}</p>}

                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                            {loading ? <RefreshCw className="spin" size={18} /> : t('setupAccount')}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleLogin}>
                        {loginTab === 'server' ? (
                            <>
                            <div className="input-group">
                                <label>{t('usernameLabel')}</label>
                                <div style={{ position: 'relative' }}>
                                    <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder={t('usernamePlaceholder')}
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        style={{ paddingLeft: '38px' }}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="input-group">
                                <label>{t('passwordLabel')}</label>
                                <div style={{ position: 'relative' }}>
                                    <Key size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                    <input
                                        type="password"
                                        placeholder={t('passwordPlaceholder')}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        style={{ paddingLeft: '38px' }}
                                        required
                                    />
                                </div>
                                <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                                    {t('serverHint')}
                                </p>
                            </div>
                            </>
                        ) : (
                            <div className="input-group">
                                <label>{t('tokenLabel')}</label>
                                <div style={{ position: 'relative' }}>
                                    <Shield size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                    <input
                                        type="password"
                                        placeholder={t('tokenPlaceholder')}
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                        style={{ paddingLeft: '38px' }}
                                        required
                                    />
                                </div>
                                <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                                    {t('tokenHint')}
                                </p>
                            </div>
                        )}

                        {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                            <input
                                type="checkbox"
                                id="remember"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <label htmlFor="remember" style={{ fontSize: '0.875rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                                {loginTab === 'server' ? t('rememberMe') : t('rememberToken')}
                            </label>
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                            {loading ? <RefreshCw className="spin" size={18} /> : t('loginBtn')}
                        </button>

                        {loginTab === 'server' && supportsPasskey && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
                                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
                                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '8px' }}
                                    disabled={loading}
                                    onClick={handlePasskeyLogin}
                                >
                                    <Fingerprint size={18} />
                                    {t('passkeyLoginBtn')}
                                </button>
                            </>
                        )}
                    </form>
                )}

                {/* Security Badges */}
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                    <SecurityBadges t={t} />
                </div>
            </div>
        </div>
    );
};

export default Login;
