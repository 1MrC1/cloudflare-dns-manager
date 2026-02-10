import React, { useState } from 'react';
import { Layers, Globe, CheckCircle, AlertCircle, RefreshCw, X } from 'lucide-react';
import { getAuthHeaders } from '../utils/auth.ts';

const BulkOperationsModal = ({ show, onClose, auth, t, showToast, zones }) => {
    const [operation, setOperation] = useState('create');
    const [zoneMode, setZoneMode] = useState('all');
    const [selectedZones, setSelectedZones] = useState([]);
    const [recordType, setRecordType] = useState('TXT');
    const [recordName, setRecordName] = useState('');
    const [recordContent, setRecordContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);

    if (!show) return null;

    const handleClose = () => {
        setResults(null);
        onClose();
    };

    const handleExecute = async () => {
        if (operation === 'create' && (!recordType || !recordName || !recordContent)) return;
        if (operation === 'delete_matching' && !recordType && !recordName && !recordContent) return;
        setLoading(true);
        setResults(null);
        try {
            const record = {};
            if (recordType) record.type = recordType;
            if (recordName) record.name = recordName;
            if (recordContent) record.content = recordContent;

            const body = {
                operation,
                zones: zoneMode === 'all' ? 'all' : selectedZones,
                record
            };

            const res = await fetch('/api/dns_bulk', {
                method: 'POST',
                headers: getAuthHeaders(auth, true),
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (res.ok) {
                setResults(data.results || []);
                showToast(t('bulkSuccess'), 'success');
            } else {
                showToast(data.error || 'Bulk operation failed', 'error');
            }
        } catch (_e) {
            showToast('Bulk operation failed', 'error');
        }
        setLoading(false);
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '560px', padding: '1.5rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Layers size={18} color="var(--primary)" /> {t('bulkOperations')}
                    </h3>
                    <button onClick={handleClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                        <X size={18} color="var(--text-muted)" />
                    </button>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>{t('bulkDesc')}</p>

                {results ? (
                    <div className="fade-in" style={{ overflowY: 'auto', flex: 1 }}>
                        <h4 style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>{t('bulkResults')}</h4>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Zone</th>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>Count</th>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Errors</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((r, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.4rem 0.5rem', fontWeight: 500 }}>{r.zoneName}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                                                {r.success ? <CheckCircle size={14} color="var(--success)" /> : <AlertCircle size={14} color="var(--error)" />}
                                            </td>
                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>{r.count}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.7rem', color: 'var(--error)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {r.errors?.join(', ')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button className="btn btn-outline" onClick={() => setResults(null)}>{t('cancel')}</button>
                        </div>
                    </div>
                ) : (
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <button className={`btn ${operation === 'create' ? 'btn-primary' : 'btn-outline'}`}
                                style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
                                onClick={() => setOperation('create')}>
                                {t('bulkCreate')}
                            </button>
                            <button className={`btn ${operation === 'delete_matching' ? 'btn-primary' : 'btn-outline'}`}
                                style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
                                onClick={() => setOperation('delete_matching')}>
                                {t('bulkDelete')}
                            </button>
                        </div>

                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('bulkSelectZones')}</label>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <button className={`btn ${zoneMode === 'all' ? 'btn-primary' : 'btn-outline'}`}
                                    style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                                    onClick={() => setZoneMode('all')}>
                                    {t('bulkAllZones')}
                                </button>
                                <button className={`btn ${zoneMode === 'selected' ? 'btn-primary' : 'btn-outline'}`}
                                    style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                                    onClick={() => setZoneMode('selected')}>
                                    {t('bulkSelectedZones')}
                                </button>
                            </div>
                            {zoneMode === 'selected' && (
                                <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.25rem' }}>
                                    {zones.map(z => (
                                        <label key={z.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', borderRadius: '4px' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <input type="checkbox" checked={selectedZones.includes(z.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedZones([...selectedZones, z.id]);
                                                    else setSelectedZones(selectedZones.filter(id => id !== z.id));
                                                }}
                                                style={{ width: '14px', height: '14px' }} />
                                            <Globe size={12} color="var(--primary)" />
                                            {z.name}
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('bulkRecordType')}</label>
                                <select value={recordType} onChange={e => setRecordType(e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                                    {['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA'].map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </div>
                            <div style={{ flex: 2 }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('bulkRecordName')}</label>
                                <input type="text" value={recordName} onChange={e => setRecordName(e.target.value)}
                                    placeholder={operation === 'create' ? '_dmarc' : `(${t('bulkRecordName')})`}
                                    style={{ width: '100%', fontSize: '0.85rem' }} />
                            </div>
                        </div>

                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('bulkRecordContent')}</label>
                            <input type="text" value={recordContent} onChange={e => setRecordContent(e.target.value)}
                                placeholder={operation === 'create' ? 'v=DMARC1; p=reject' : `(${t('bulkRecordContent')})`}
                                style={{ width: '100%', fontSize: '0.85rem' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={handleClose}>{t('cancel')}</button>
                            <button className="btn btn-primary" onClick={handleExecute}
                                disabled={loading || (zoneMode === 'selected' && selectedZones.length === 0)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {loading ? <RefreshCw className="spin" size={14} /> : <Layers size={14} />}
                                {loading ? t('bulkExecuting') : t('bulkExecute')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BulkOperationsModal;
