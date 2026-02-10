import React, { useState } from 'react';
import { Key, RefreshCw, Save, X } from 'lucide-react';
import { hashPassword } from '../utils/auth.ts';

const ChangePasswordModal = ({ show, onClose, auth, t, showToast }) => {
    const [current, setCurrent] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!show) return null;

    const handleClose = () => {
        setError('');
        onClose();
    };

    const handleChange = async () => {
        if (!current || !newPwd || !confirm) return;
        if (newPwd !== confirm) { setError(t('passwordMismatch')); return; }
        if (newPwd.length < 8 || !/[a-zA-Z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
            setError(t('passwordTooWeak')); return;
        }
        setLoading(true);
        setError('');
        try {
            const currentHashed = await hashPassword(current);
            const newHashed = await hashPassword(newPwd);
            const res = await fetch('/api/account/password', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: currentHashed, newPassword: newHashed })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(t('passwordChanged'), 'success');
                setCurrent(''); setNewPwd(''); setConfirm('');
                onClose();
            } else {
                setError(data.error || t('passwordChangeError'));
            }
        } catch (err) {
            setError(t('errorOccurred'));
        }
        setLoading(false);
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '380px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('changePassword')}</h3>
                    <button onClick={handleClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                        <X size={18} color="var(--text-muted)" />
                    </button>
                </div>
                <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('currentPassword')}</label>
                    <div style={{ position: 'relative' }}>
                        <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input type="password" placeholder={t('currentPasswordPlaceholder')} value={current}
                            onChange={(e) => { setCurrent(e.target.value); setError(''); }} style={{ paddingLeft: '38px', width: '100%' }} />
                    </div>
                </div>
                <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('newPassword')}</label>
                    <div style={{ position: 'relative' }}>
                        <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input type="password" placeholder={t('newPasswordPlaceholder2')} value={newPwd}
                            onChange={(e) => { setNewPwd(e.target.value); setError(''); }} style={{ paddingLeft: '38px', width: '100%' }} />
                    </div>
                </div>
                <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('confirmNewPassword')}</label>
                    <div style={{ position: 'relative' }}>
                        <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input type="password" placeholder={t('confirmNewPasswordPlaceholder')} value={confirm}
                            onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleChange(); }}
                            style={{ paddingLeft: '38px', width: '100%' }} />
                    </div>
                </div>
                {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={handleClose}>{t('cancel')}</button>
                    <button className="btn btn-primary" onClick={handleChange}
                        disabled={loading || !current || !newPwd || !confirm}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {loading ? <RefreshCw className="spin" size={14} /> : <Save size={14} />}
                        {t('save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
