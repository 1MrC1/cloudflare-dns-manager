import React, { useState, useEffect } from 'react';
import { Fingerprint, Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';

const PasskeyModal = ({ show, onClose, auth, t, showToast }) => {
    const [passkeys, setPasskeys] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (show && auth?.token) fetchPasskeys();
    }, [show]);

    useEffect(() => {
        if (!show) return;
        const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [show, onClose]);

    const fetchPasskeys = async () => {
        try {
            const res = await fetch('/api/passkey/credentials', {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            const data = await res.json();
            if (res.ok) setPasskeys(data.credentials || []);
        } catch (err) { console.error('Failed to fetch passkeys:', err); }
    };

    const handleRegister = async () => {
        if (!window.PublicKeyCredential) {
            setError(t('passkeyNoSupport'));
            return;
        }
        setLoading(true);
        setError('');
        try {
            const optRes = await fetch('/api/passkey/register-options', {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            const optData = await optRes.json();
            if (!optRes.ok) {
                setError(optData.error || t('passkeyError'));
                setLoading(false);
                return;
            }
            const regResp = await startRegistration({ optionsJSON: optData });
            regResp.credentialName = `Passkey ${passkeys.length + 1}`;
            const verifyRes = await fetch('/api/passkey/register-verify', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(regResp)
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
                showToast(t('passkeyRegistered'), 'success');
                fetchPasskeys();
            } else {
                setError(verifyData.error || t('passkeyError'));
            }
        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                setError(t('passkeyError'));
            }
        }
        setLoading(false);
    };

    const handleDelete = async (credId) => {
        try {
            const res = await fetch(`/api/passkey/credentials?id=${encodeURIComponent(credId)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                showToast(t('passkeyDeleted'), 'success');
                fetchPasskeys();
            }
        } catch (err) { console.error('Failed to delete passkey:', err); showToast(t('errorOccurred'), 'error'); }
    };

    if (!show) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="glass-card fade-in" role="dialog" aria-label={t('passkeyManage')} style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Fingerprint size={18} /> {t('passkeyManage')}
                    </h3>
                    <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }} aria-label="Close">
                        <X size={18} color="var(--text-muted)" />
                    </button>
                </div>

                {passkeys.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                        {t('passkeyNone')}
                    </p>
                ) : (
                    <div style={{ marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                        {passkeys.map((pk) => (
                            <div key={pk.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.6rem 0.75rem', borderRadius: '8px', marginBottom: '0.4rem',
                                background: 'var(--hover-bg)', border: '1px solid var(--border)'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Fingerprint size={14} style={{ color: '#9333ea' }} />
                                        {pk.name}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        {new Date(pk.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <button onClick={() => handleDelete(pk.id)}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', color: 'var(--error)' }}
                                    title="Delete"
                                    aria-label={`Delete passkey ${pk.name}`}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{error}</p>}

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={onClose}>{t('cancel')}</button>
                    <button className="btn btn-primary" onClick={handleRegister} disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {loading ? <RefreshCw className="spin" size={14} /> : <Plus size={14} />}
                        {t('passkeyRegister')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasskeyModal;
