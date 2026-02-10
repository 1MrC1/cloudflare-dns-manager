import React, { useState, useEffect } from 'react';
import { Shield, Plus, RefreshCw, X, Key, User, AlertTriangle } from 'lucide-react';

const AddAccountModal = ({ show, onClose, auth, t, showToast, onAccountAdded }) => {
    const [newAccountToken, setNewAccountToken] = useState('');
    const [newAccountName, setNewAccountName] = useState('');
    const [tokenType, setTokenType] = useState('api_token'); // 'api_token' | 'global_key'
    const [globalEmail, setGlobalEmail] = useState('');
    const [globalKey, setGlobalKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!show) return;
        const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [show, onClose]);

    if (!show) return null;

    const handleClose = () => {
        setError('');
        onClose();
    };

    const handleAdd = async () => {
        const isGlobal = tokenType === 'global_key';
        if (isGlobal ? (!globalEmail.trim() || !globalKey.trim()) : !newAccountToken.trim()) return;

        setLoading(true);
        setError('');
        try {
            const maxId = (auth.accounts || []).reduce((max, a) => Math.max(max, a.id), -1);
            const nextIndex = maxId + 1;
            const adminHeaders = { 'Authorization': `Bearer ${auth.token}` };

            const body = isGlobal
                ? { type: 'global_key', email: globalEmail.trim(), key: globalKey.trim(), accountIndex: nextIndex, name: newAccountName || undefined }
                : { token: newAccountToken, accountIndex: nextIndex, name: newAccountName || undefined };

            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { ...adminHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(t('accountAdded'), 'success');
                setNewAccountToken('');
                setNewAccountName('');
                setGlobalEmail('');
                setGlobalKey('');
                const accRes = await fetch('/api/admin/settings', { headers: adminHeaders });
                const accData = await accRes.json();
                if (accRes.ok) {
                    const updatedAccounts = accData.accounts || [];
                    const si = auth.activeSessionIndex || 0;
                    const newSessions = [...(auth.sessions || [])];
                    if (newSessions[si]) newSessions[si] = { ...newSessions[si], accounts: updatedAccounts };
                    onAccountAdded({ ...auth, accounts: updatedAccounts, sessions: newSessions, currentAccountIndex: data.id });
                }
                onClose();
            } else {
                setError(data.error || t('tokenSaveFailed'));
            }
        } catch (err) {
            setError(t('tokenSaveFailed'));
        } finally {
            setLoading(false);
        }
    };

    const isGlobal = tokenType === 'global_key';
    const canSubmit = isGlobal ? (globalEmail.trim() && globalKey.trim()) : newAccountToken.trim();

    return (
        <div className="modal-overlay" style={{ zIndex: 200 }}
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="glass-card fade-in modal-content" role="dialog" aria-label={t('addAccountTitle')} style={{ width: '100%', maxWidth: '440px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('addAccountTitle')}</h3>
                    <button onClick={handleClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }} aria-label="Close">
                        <X size={18} color="var(--text-muted)" />
                    </button>
                </div>

                {/* Token type tabs */}
                <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <button type="button"
                        onClick={() => { setTokenType('api_token'); setError(''); }}
                        style={{
                            flex: 1, padding: '0.4rem 0.5rem', fontSize: '0.75rem', fontWeight: 600,
                            border: 'none', cursor: 'pointer',
                            background: tokenType === 'api_token' ? 'var(--primary)' : 'transparent',
                            color: tokenType === 'api_token' ? 'white' : 'var(--text-muted)',
                        }}>
                        {t('apiTokenTab')}
                    </button>
                    <button type="button"
                        onClick={() => { setTokenType('global_key'); setError(''); }}
                        style={{
                            flex: 1, padding: '0.4rem 0.5rem', fontSize: '0.75rem', fontWeight: 600,
                            border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer',
                            background: tokenType === 'global_key' ? 'var(--primary)' : 'transparent',
                            color: tokenType === 'global_key' ? 'white' : 'var(--text-muted)',
                        }}>
                        {t('globalKeyTab')}
                    </button>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('accountName')}</label>
                    <input type="text" placeholder={t('accountNamePlaceholder')} value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)} style={{ width: '100%' }} />
                </div>

                {isGlobal ? (
                    <>
                        <div style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', marginBottom: '0.75rem', fontSize: '0.7rem', color: '#b45309', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>{t('globalKeyWarning')}</span>
                        </div>
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('globalKeyEmailLabel')}</label>
                            <div style={{ position: 'relative' }}>
                                <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="email" placeholder={t('globalKeyEmailPlaceholder')} value={globalEmail}
                                    onChange={(e) => { setGlobalEmail(e.target.value); setError(''); }}
                                    style={{ paddingLeft: '38px', width: '100%' }} />
                            </div>
                        </div>
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('globalKeyLabel')}</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="password" placeholder={t('globalKeyPlaceholder')} value={globalKey}
                                    onChange={(e) => { setGlobalKey(e.target.value); setError(''); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                                    style={{ paddingLeft: '38px', width: '100%' }} />
                            </div>
                        </div>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                            {t('globalKeyHint')}{' '}
                            <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                                dash.cloudflare.com/profile/api-tokens
                            </a>
                        </p>
                    </>
                ) : (
                    <>
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('tokenLabel')}</label>
                            <div style={{ position: 'relative' }}>
                                <Shield size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="password" placeholder={t('tokenPlaceholder')} value={newAccountToken}
                                    onChange={(e) => { setNewAccountToken(e.target.value); setError(''); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                                    style={{ paddingLeft: '38px', width: '100%' }} />
                            </div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                            <p style={{ margin: '0 0 4px 0' }}>
                                {t('noZonesGetToken')}{' '}
                                <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                                    dash.cloudflare.com/profile/api-tokens
                                </a>
                            </p>
                            <p style={{ margin: 0, fontStyle: 'italic' }}>{t('tokenRequiredPermissions')}</p>
                        </div>
                    </>
                )}

                {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={handleClose}>{t('cancel')}</button>
                    <button className="btn btn-primary" onClick={handleAdd} disabled={loading || !canSubmit}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {loading ? <RefreshCw className="spin" size={14} /> : <Plus size={14} />}
                        {t('addAccount')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddAccountModal;
