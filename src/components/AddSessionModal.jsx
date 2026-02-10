import React, { useState, useEffect } from 'react';
import { User, Key, RefreshCw, LogOut, X } from 'lucide-react';
import { hashPassword } from '../utils/auth.ts';

const AddSessionModal = ({ show, onClose, auth, t, showToast, onSessionAdded }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
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
        if (!username.trim() || !password.trim()) return;
        setLoading(true);
        setError('');
        try {
            const hashedPwd = await hashPassword(password);
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim(), password: hashedPwd })
            });
            const data = await res.json();
            if (res.ok && data.token) {
                const newSession = { token: data.token, username: data.username, role: data.role, accounts: data.accounts || [] };
                const existing = (auth.sessions || []).findIndex(s => s.username === newSession.username);
                let newSessions;
                if (existing >= 0) {
                    newSessions = [...auth.sessions];
                    newSessions[existing] = newSession;
                } else {
                    newSessions = [...(auth.sessions || []), newSession];
                }
                onSessionAdded({ ...auth, sessions: newSessions });
                showToast(t('sessionAdded'), 'success');
                setUsername('');
                setPassword('');
                onClose();
            } else {
                setError(data.error || t('loginFailed'));
            }
        } catch (err) {
            setError(t('errorOccurred'));
        }
        setLoading(false);
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="glass-card fade-in" role="dialog" aria-label={t('addSessionTitle')} style={{ width: '100%', maxWidth: '380px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('addSessionTitle')}</h3>
                    <button onClick={handleClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }} aria-label="Close">
                        <X size={18} color="var(--text-muted)" />
                    </button>
                </div>
                <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('usernameLabel')}</label>
                    <div style={{ position: 'relative' }}>
                        <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input type="text" placeholder={t('usernamePlaceholder')} value={username}
                            onChange={(e) => setUsername(e.target.value)} style={{ paddingLeft: '38px', width: '100%' }} />
                    </div>
                </div>
                <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('passwordLabel')}</label>
                    <div style={{ position: 'relative' }}>
                        <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input type="password" placeholder={t('passwordPlaceholder')} value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                            style={{ paddingLeft: '38px', width: '100%' }} />
                    </div>
                </div>
                {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={handleClose}>{t('cancel')}</button>
                    <button className="btn btn-primary" onClick={handleAdd}
                        disabled={loading || !username.trim() || !password.trim()}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {loading ? <RefreshCw className="spin" size={14} /> : <LogOut size={14} style={{ transform: 'rotate(180deg)' }} />}
                        {t('loginBtn')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddSessionModal;
