import React from 'react';
import { AlertCircle } from 'lucide-react';

const ConfirmModal = ({ confirmModal, setConfirmModal, t }) => {
    if (!confirmModal.show) return null;

    return (
        <div
            className="modal-overlay"
            style={{ zIndex: 2000 }}
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal({ ...confirmModal, show: false }); }}
        >
            <div className="glass-card fade-in modal-content" role="dialog" aria-label={confirmModal.title} style={{ padding: '2rem', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', background: 'var(--error-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                    <AlertCircle size={24} color="var(--error)" />
                </div>
                <h2 style={{ marginBottom: '0.75rem' }}>{confirmModal.title}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '2rem', lineHeight: '1.6' }}>{confirmModal.message}<br />{t('confirmDeleteText')}</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setConfirmModal({ ...confirmModal, show: false })}>{t('cancel')}</button>
                    <button className="btn btn-primary" style={{ flex: 1, background: 'var(--error)' }} onClick={() => {
                        confirmModal.onConfirm();
                        setConfirmModal({ ...confirmModal, show: false });
                    }}>{t('yes')}</button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
