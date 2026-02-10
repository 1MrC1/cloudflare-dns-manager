import React, { useState, useEffect } from 'react';
import { Shield, Plus, RefreshCw, X } from 'lucide-react';

const AddAccountModal = ({ show, onClose, auth, t, showToast, onAccountAdded }) => {
    const [newAccountToken, setNewAccountToken] = useState('');
    const [newAccountName, setNewAccountName] = useState('');
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
        if (!newAccountToken.trim()) return;
        setLoading(true);
        setError('');
        try {
            const maxId = (auth.accounts || []).reduce((max, a) => Math.max(max, a.id), -1);
            const nextIndex = maxId + 1;
            const adminHeaders = { 'Authorization': `Bearer ${auth.token}` };
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { ...adminHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: newAccountToken, accountIndex: nextIndex, name: newAccountName || undefined })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(t('accountAdded'), 'success');
                setNewAccountToken('');
                setNewAccountName('');
                // Refresh accounts list
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

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="glass-card fade-in" role="dialog" aria-label={t('addAccountTitle')} style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('addAccountTitle')}</h3>
                    <button onClick={handleClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }} aria-label="Close">
                        <X size={18} color="var(--text-muted)" />
                    </button>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('accountName')}</label>
                    <input type="text" placeholder={t('accountNamePlaceholder')} value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)} style={{ width: '100%' }} />
                </div>
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
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    {t('noZonesGetToken')}{' '}
                    <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                        dash.cloudflare.com/profile/api-tokens
                    </a>
                </p>
                {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={handleClose}>{t('cancel')}</button>
                    <button className="btn btn-primary" onClick={handleAdd} disabled={loading || !newAccountToken.trim()}
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
