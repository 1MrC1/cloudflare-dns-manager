import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, ChevronDown, Clock } from 'lucide-react';
import CustomSelect from './CustomSelect.jsx';

const DnsRecordModal = ({ zone, show, editingRecord, onClose, onSubmit, onSchedule, t, showToast }) => {
    const defaultRecord = { type: 'A', name: '', content: '', ttl: 1, proxied: true, comment: '', tags: [], priority: 10, data: {} };

    const [newRecord, setNewRecord] = useState(defaultRecord);
    const [showTemplates, setShowTemplates] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const [showSchedulePicker, setShowSchedulePicker] = useState(false);
    const [scheduledAt, setScheduledAt] = useState('');
    const templateRef = useRef(null);

    // Initialize form when opening or when editingRecord changes
    useEffect(() => {
        if (show) {
            if (editingRecord) {
                setNewRecord({
                    type: editingRecord.type,
                    name: editingRecord.name,
                    content: editingRecord.content,
                    ttl: editingRecord.ttl,
                    proxied: editingRecord.proxied,
                    comment: editingRecord.comment || '',
                    tags: editingRecord.tags || [],
                    priority: editingRecord.priority || 10,
                    data: editingRecord.data || {}
                });
            } else {
                setNewRecord(defaultRecord);
            }
            setTagInput('');
            setShowTemplates(false);
            setShowSchedulePicker(false);
            setScheduledAt('');
        }
    }, [show, editingRecord]);

    // Close templates dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event) {
            if (templateRef.current && !templateRef.current.contains(event.target)) {
                setShowTemplates(false);
            }
        }
        if (showTemplates) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showTemplates]);

    // DNS Record Templates
    const dnsTemplates = [
        {
            key: 'spf',
            label: t('templateSpf'),
            record: { type: 'TXT', name: '@', content: 'v=spf1 mx ~all', ttl: 1, proxied: false, comment: '', tags: [], priority: 10, data: {} }
        },
        {
            key: 'dmarc',
            label: t('templateDmarc'),
            record: { type: 'TXT', name: '_dmarc', content: `v=DMARC1; p=none; rua=mailto:dmarc@${zone.name}`, ttl: 1, proxied: false, comment: '', tags: [], priority: 10, data: {} }
        },
        {
            key: 'google_mx',
            label: t('templateGoogleMx'),
            record: { type: 'MX', name: '@', content: 'aspmx.l.google.com', ttl: 1, proxied: false, comment: 'Google Workspace MX (1 of 5)', tags: [], priority: 1, data: {} }
        },
        {
            key: 'www_cname',
            label: t('templateWwwCname'),
            record: { type: 'CNAME', name: 'www', content: zone.name, ttl: 1, proxied: true, comment: '', tags: [], priority: 10, data: {} }
        },
        {
            key: 'mail_mx',
            label: t('templateMailMx'),
            record: { type: 'MX', name: '@', content: `mail.${zone.name}`, ttl: 1, proxied: false, comment: '', tags: [], priority: 10, data: {} }
        },
        {
            key: 'google_verify',
            label: t('templateGoogleVerify'),
            record: { type: 'TXT', name: '@', content: 'google-site-verification=PASTE_CODE_HERE', ttl: 1, proxied: false, comment: '', tags: [], priority: 10, data: {} }
        }
    ];

    const applyTemplate = (template) => {
        setNewRecord({ ...template.record });
        setShowTemplates(false);
        showToast(t('templateApplied'));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(e, newRecord, editingRecord);
    };

    const handleScheduleSubmit = () => {
        if (!scheduledAt) return;
        const scheduledDate = new Date(scheduledAt);
        if (scheduledDate.getTime() <= Date.now()) {
            showToast(t('scheduleMustBeFuture'), 'error');
            return;
        }
        if (onSchedule) {
            onSchedule(newRecord, editingRecord, scheduledDate.toISOString());
            setShowSchedulePicker(false);
            setScheduledAt('');
        }
    };

    // Compute a default datetime-local value (1 hour from now)
    const getMinDatetime = () => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    };

    if (!show) return null;

    return (
        <div
            className="modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="glass-card fade-in modal-content" role="dialog" aria-label={editingRecord ? t('editRecord') : t('addModalTitle')} style={{ padding: '2rem', maxWidth: '450px', width: '90%', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0 }}>{editingRecord ? t('editRecord') : t('addModalTitle')}</h2>
                    {!editingRecord && (
                        <div ref={templateRef} style={{ position: 'relative' }}>
                            <button
                                type="button"
                                className="btn btn-outline"
                                style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => setShowTemplates(!showTemplates)}
                            >
                                <BookOpen size={14} />
                                {t('templates')}
                                <ChevronDown size={12} style={{ transform: showTemplates ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                            </button>
                            {showTemplates && (
                                <div className="glass-card fade-in" style={{
                                    position: 'absolute',
                                    top: '110%',
                                    right: 0,
                                    zIndex: 100,
                                    minWidth: '260px',
                                    padding: '0.25rem',
                                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                                    maxHeight: '300px',
                                    overflowY: 'auto'
                                }}>
                                    {dnsTemplates.map(tmpl => (
                                        <div
                                            key={tmpl.key}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => applyTemplate(tmpl)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyTemplate(tmpl); } }}
                                            style={{
                                                padding: '0.5rem 0.75rem',
                                                cursor: 'pointer',
                                                borderRadius: '6px',
                                                fontSize: '0.8125rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                transition: 'background 0.1s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg, #f9fafb)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 4px', flexShrink: 0 }}>{tmpl.record.type}</span>
                                            <span>{tmpl.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="input-row">
                        <label>{t('type')}</label>
                        <div style={{ flex: 1 }}>
                            <CustomSelect
                                value={newRecord.type}
                                onChange={(e) => {
                                    const newType = e.target.value;
                                    const proxyableTypes = ['A', 'AAAA', 'CNAME'];
                                    setNewRecord({
                                        ...newRecord,
                                        type: newType,
                                        proxied: proxyableTypes.includes(newType) ? newRecord.proxied : false
                                    });
                                }}
                                options={['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'URI', 'CAA', 'DS', 'TLSA', 'CERT', 'DNSKEY', 'HTTPS', 'LOC', 'NAPTR', 'PTR', 'SMIMEA', 'SSHFP', 'SVCB'].map(t => ({ value: t, label: t }))}
                            />
                        </div>
                    </div>
                    <div className="input-row">
                        <label>{t('name')}</label>
                        <input type="text" value={newRecord.name} onChange={e => setNewRecord({ ...newRecord, name: e.target.value })} placeholder={newRecord.type === 'SRV' ? '_sip._tcp' : '@'} required />
                    </div>

                    {!['SRV', 'CAA', 'URI', 'DS', 'TLSA', 'NAPTR', 'SSHFP', 'HTTPS', 'SVCB'].includes(newRecord.type) && (
                        <div className="input-row">
                            <label>{t('content')}</label>
                            <input type="text" value={newRecord.content} onChange={e => setNewRecord({ ...newRecord, content: e.target.value })} placeholder={newRecord.type === 'LOC' ? '33 40 31 N 106 28 29 W 10m' : 'Value'} required />
                        </div>
                    )}

                    {newRecord.type === 'SRV' && (
                        <>
                            <div className="input-row">
                                <label>{t('service')}</label>
                                <input type="text" value={newRecord.data?.service || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, service: e.target.value } })} placeholder="_sip" required />
                            </div>
                            <div className="input-row">
                                <label>{t('protocol')}</label>
                                <input type="text" value={newRecord.data?.proto || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, proto: e.target.value } })} placeholder="_tcp" required />
                            </div>
                            <div className="input-row">
                                <label>{t('priority')}</label>
                                <input type="number" value={newRecord.data?.priority || 10} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, priority: parseInt(e.target.value) } })} min="0" max="65535" required />
                            </div>
                            <div className="input-row">
                                <label>{t('weight')}</label>
                                <input type="number" value={newRecord.data?.weight || 5} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, weight: parseInt(e.target.value) } })} min="0" max="65535" required />
                            </div>
                            <div className="input-row">
                                <label>{t('port')}</label>
                                <input type="number" value={newRecord.data?.port || 5060} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, port: parseInt(e.target.value) } })} min="0" max="65535" required />
                            </div>
                            <div className="input-row">
                                <label>{t('target')}</label>
                                <input type="text" value={newRecord.data?.target || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, target: e.target.value } })} placeholder="sipserver.example.com" required />
                            </div>
                        </>
                    )}

                    {newRecord.type === 'URI' && (
                        <>
                            <div className="input-row">
                                <label>{t('priority')}</label>
                                <input type="number" value={newRecord.data?.priority || 10} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, priority: parseInt(e.target.value) } })} min="0" max="65535" required />
                            </div>
                            <div className="input-row">
                                <label>{t('weight')}</label>
                                <input type="number" value={newRecord.data?.weight || 5} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, weight: parseInt(e.target.value) } })} min="0" max="65535" required />
                            </div>
                            <div className="input-row">
                                <label>{t('target')}</label>
                                <input type="text" value={newRecord.data?.target || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, target: e.target.value } })} placeholder="https://example.com" required />
                            </div>
                        </>
                    )}

                    {newRecord.type === 'CAA' && (
                        <>
                            <div className="input-row">
                                <label>{t('flags')}</label>
                                <input type="number" value={newRecord.data?.flags || 0} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, flags: parseInt(e.target.value) } })} min="0" max="255" required />
                            </div>
                            <div className="input-row">
                                <label>{t('tag')}</label>
                                <CustomSelect
                                    value={newRecord.data?.tag || 'issue'}
                                    onChange={(e) => setNewRecord({ ...newRecord, data: { ...newRecord.data, tag: e.target.value } })}
                                    options={[
                                        { value: 'issue', label: 'issue' },
                                        { value: 'issuewild', label: 'issuewild' },
                                        { value: 'iodef', label: 'iodef' }
                                    ]}
                                />
                            </div>
                            <div className="input-row">
                                <label>{t('value')}</label>
                                <input type="text" value={newRecord.data?.value || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, value: e.target.value } })} placeholder="comodoca.com" required />
                            </div>
                        </>
                    )}

                    {newRecord.type === 'DS' && (
                        <>
                            <div className="input-row">
                                <label>{t('keyTag')}</label>
                                <input type="number" value={newRecord.data?.key_tag || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, key_tag: parseInt(e.target.value) } })} min="0" max="65535" required />
                            </div>
                            <div className="input-row">
                                <label>{t('algorithm')}</label>
                                <input type="number" value={newRecord.data?.algorithm || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, algorithm: parseInt(e.target.value) } })} min="0" max="255" required />
                            </div>
                            <div className="input-row">
                                <label>{t('digestType')}</label>
                                <input type="number" value={newRecord.data?.digest_type || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, digest_type: parseInt(e.target.value) } })} min="0" max="255" required />
                            </div>
                            <div className="input-row">
                                <label>{t('digest')}</label>
                                <input type="text" value={newRecord.data?.digest || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, digest: e.target.value } })} placeholder={t('digest')} required />
                            </div>
                        </>
                    )}

                    {newRecord.type === 'TLSA' && (
                        <>
                            <div className="input-row">
                                <label>{t('usage')}</label>
                                <input type="number" value={newRecord.data?.usage || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, usage: parseInt(e.target.value) } })} min="0" max="255" required />
                            </div>
                            <div className="input-row">
                                <label>{t('selector')}</label>
                                <input type="number" value={newRecord.data?.selector || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, selector: parseInt(e.target.value) } })} min="0" max="255" required />
                            </div>
                            <div className="input-row">
                                <label>{t('matchingType')}</label>
                                <input type="number" value={newRecord.data?.matching_type || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, matching_type: parseInt(e.target.value) } })} min="0" max="255" required />
                            </div>
                            <div className="input-row">
                                <label>{t('certificate')}</label>
                                <input type="text" value={newRecord.data?.certificate || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, certificate: e.target.value } })} placeholder={t('certificate')} required />
                            </div>
                        </>
                    )}

                    {newRecord.type === 'NAPTR' && (
                        <>
                            <div className="input-row">
                                <label>{t('order')}</label>
                                <input type="number" value={newRecord.data?.order || 100} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, order: parseInt(e.target.value) } })} min="0" max="65535" required />
                            </div>
                            <div className="input-row">
                                <label>{t('preference')}</label>
                                <input type="number" value={newRecord.data?.preference || 10} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, preference: parseInt(e.target.value) } })} min="0" max="65535" required />
                            </div>
                            <div className="input-row">
                                <label>{t('flags')}</label>
                                <input type="text" value={newRecord.data?.flags || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, flags: e.target.value } })} placeholder="S" required />
                            </div>
                            <div className="input-row">
                                <label>{t('service')}</label>
                                <input type="text" value={newRecord.data?.service || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, service: e.target.value } })} placeholder="http+E2U" required />
                            </div>
                            <div className="input-row">
                                <label>{t('regex')}</label>
                                <input type="text" value={newRecord.data?.regex || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, regex: e.target.value } })} placeholder={t('regex')} />
                            </div>
                            <div className="input-row">
                                <label>{t('replacement')}</label>
                                <input type="text" value={newRecord.data?.replacement || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, replacement: e.target.value } })} placeholder="." />
                            </div>
                        </>
                    )}

                    {newRecord.type === 'SSHFP' && (
                        <>
                            <div className="input-row">
                                <label>{t('algorithm')}</label>
                                <input type="number" value={newRecord.data?.algorithm || 4} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, algorithm: parseInt(e.target.value) } })} min="0" max="255" required />
                            </div>
                            <div className="input-row">
                                <label>{t('type')}</label>
                                <input type="number" value={newRecord.data?.type || 2} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, type: parseInt(e.target.value) } })} min="0" max="255" required />
                            </div>
                            <div className="input-row">
                                <label>{t('fingerprint')}</label>
                                <input type="text" value={newRecord.data?.fingerprint || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, fingerprint: e.target.value } })} placeholder={t('fingerprint')} required />
                            </div>
                        </>
                    )}

                    {(newRecord.type === 'HTTPS' || newRecord.type === 'SVCB') && (
                        <>
                            <div className="input-row">
                                <label>{t('priority')}</label>
                                <input type="number" value={newRecord.data?.priority || 1} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, priority: parseInt(e.target.value) } })} min="0" max="65535" required />
                            </div>
                            <div className="input-row">
                                <label>{t('target')}</label>
                                <input type="text" value={newRecord.data?.target || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, target: e.target.value } })} placeholder="example.com" required />
                            </div>
                            <div className="input-row">
                                <label>{t('value')}</label>
                                <input type="text" value={newRecord.data?.value || ''} onChange={e => setNewRecord({ ...newRecord, data: { ...newRecord.data, value: e.target.value } })} placeholder="alpn=h3,h2" required />
                            </div>
                        </>
                    )}
                    <div className="input-row">
                        <label>{t('ttl')}</label>
                        <div style={{ flex: 1 }}>
                            <CustomSelect
                                value={newRecord.ttl}
                                onChange={(e) => setNewRecord({ ...newRecord, ttl: parseInt(e.target.value) })}
                                options={[
                                    { value: 1, label: t('ttlAuto') },
                                    { value: 60, label: t('ttl1min') },
                                    { value: 120, label: t('ttl2min') },
                                    { value: 300, label: t('ttl5min') },
                                    { value: 600, label: t('ttl10min') },
                                    { value: 900, label: t('ttl15min') },
                                    { value: 1800, label: t('ttl30min') },
                                    { value: 3600, label: t('ttl1h') },
                                    { value: 7200, label: t('ttl2h') },
                                    { value: 18000, label: t('ttl5h') },
                                    { value: 43200, label: t('ttl12h') },
                                    { value: 86400, label: t('ttl1d') }
                                ]}
                            />
                        </div>
                    </div>
                    {['MX'].includes(newRecord.type) && (
                        <div className="input-row">
                            <label>{t('priority')}</label>
                            <input type="number" value={newRecord.priority} onChange={e => setNewRecord({ ...newRecord, priority: parseInt(e.target.value) })} min="0" max="65535" required />
                        </div>
                    )}
                    <div className="input-row">
                        <label>{t('comment')}</label>
                        <input
                            type="text"
                            value={newRecord.comment || ''}
                            onChange={e => setNewRecord({ ...newRecord, comment: e.target.value })}
                            placeholder={t('commentPlaceholder')}
                        />
                    </div>
                    <div className="input-row" style={{ alignItems: 'flex-start' }}>
                        <label style={{ paddingTop: '8px' }}>{t('tags')}</label>
                        <div style={{ flex: 1 }}>
                            {(newRecord.tags || []).length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                    {(newRecord.tags || []).map((tag, idx) => (
                                        <span key={idx} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            background: 'var(--select-active-bg, #eef2ff)', color: 'var(--primary)',
                                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500
                                        }}>
                                            {tag}
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setNewRecord({ ...newRecord, tags: newRecord.tags.filter((_, i) => i !== idx) })}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNewRecord({ ...newRecord, tags: newRecord.tags.filter((_, i) => i !== idx) }); } }}
                                                style={{ cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1, opacity: 0.7 }}
                                            >&times;</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <input
                                type="text"
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => {
                                    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                                        e.preventDefault();
                                        const newTag = tagInput.trim().replace(/,/g, '');
                                        if (newTag && !(newRecord.tags || []).includes(newTag)) {
                                            setNewRecord({ ...newRecord, tags: [...(newRecord.tags || []), newTag] });
                                        }
                                        setTagInput('');
                                    }
                                }}
                                placeholder={t('tagsPlaceholder')}
                            />
                        </div>
                    </div>
                    {['A', 'AAAA', 'CNAME'].includes(newRecord.type) && (
                        <div className="input-row" style={{ alignItems: 'center' }}>
                            <label>{t('proxied')}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label className="toggle-switch" style={{ margin: 0 }}>
                                    <input
                                        type="checkbox"
                                        checked={newRecord.proxied}
                                        onChange={(e) => setNewRecord({ ...newRecord, proxied: e.target.checked })}
                                    />
                                    <span className="slider"></span>
                                </label>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('proxiedHint')}</span>
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-outline" style={{ flex: 1, minWidth: '80px' }} onClick={onClose}>{t('cancel')}</button>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1, minWidth: '80px' }}>{t('save')}</button>
                        {onSchedule && (
                            <button
                                type="button"
                                className="btn btn-outline"
                                style={{ flex: 1, minWidth: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '0.8rem' }}
                                onClick={() => setShowSchedulePicker(!showSchedulePicker)}
                            >
                                <Clock size={14} />
                                {t('scheduleForLater')}
                            </button>
                        )}
                    </div>
                    {showSchedulePicker && onSchedule && (
                        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--hover-bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                                {t('scheduleDateTime')}
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                    type="datetime-local"
                                    value={scheduledAt}
                                    onChange={e => setScheduledAt(e.target.value)}
                                    min={getMinDatetime()}
                                    style={{ flex: 1, fontSize: '0.8rem' }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                    onClick={handleScheduleSubmit}
                                    disabled={!scheduledAt}
                                >
                                    {t('scheduleConfirm')}
                                </button>
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default DnsRecordModal;
