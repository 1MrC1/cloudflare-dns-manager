import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Server, AlertTriangle, ExternalLink, Plus, Edit2, Trash2, X } from 'lucide-react';
import TabSkeleton from './TabSkeleton';

const OriginRules = ({ zone, getHeaders, t, showToast, openConfirm }) => {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [togglingRule, setTogglingRule] = useState({});
    const [showModal, setShowModal] = useState(false);
    const [editRuleIndex, setEditRuleIndex] = useState(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [description, setDescription] = useState('');
    const [expression, setExpression] = useState('');
    const [originHost, setOriginHost] = useState('');
    const [originPort, setOriginPort] = useState('');
    const [hostHeader, setHostHeader] = useState('');
    const [ruleEnabled, setRuleEnabled] = useState(true);

    const fetchRules = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(`/api/zones/${zone.id}/origin-rules`, { headers: getHeaders() });
            const data = await res.json();
            if (data.success) {
                setRules(data.rules || []);
            } else {
                setFetchError(data.errors?.[0]?.message || data.error || t('errorOccurred'));
            }
        } catch (e) {
            setFetchError(t('errorOccurred'));
        }
        setLoading(false);
    }, [zone.id]);

    useEffect(() => { fetchRules(); }, [fetchRules]);

    const handleToggleRule = async (ruleIdx, enabled) => {
        setTogglingRule(prev => ({ ...prev, [ruleIdx]: true }));
        try {
            const res = await fetch(`/api/zones/${zone.id}/origin-rules`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({ action: 'toggle_rule', ruleIndex: ruleIdx, enabled })
            });
            const data = await res.json();
            if (data.success) {
                setRules(prev => prev.map((r, i) => i === ruleIdx ? { ...r, enabled } : r));
                showToast(t('updateSuccess'));
            } else {
                showToast(data.errors?.[0]?.message || t('errorOccurred'), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setTogglingRule(prev => ({ ...prev, [ruleIdx]: false }));
    };

    const openAdd = () => {
        setEditRuleIndex(null);
        setDescription('');
        setExpression('');
        setOriginHost('');
        setOriginPort('');
        setHostHeader('');
        setRuleEnabled(true);
        setShowModal(true);
    };

    const openEdit = (rule, idx) => {
        setEditRuleIndex(idx);
        setDescription(rule.description || '');
        setExpression(rule.expression || '');
        setOriginHost(rule.action_parameters?.origin?.host || '');
        setOriginPort(rule.action_parameters?.origin?.port?.toString() || '');
        setHostHeader(rule.action_parameters?.host_header || '');
        setRuleEnabled(rule.enabled !== false);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!expression.trim()) { showToast(t('ruleExpression') + ' required', 'error'); return; }
        if (!originHost.trim() && !originPort.trim() && !hostHeader.trim()) {
            showToast('At least one origin override required', 'error'); return;
        }
        setSaving(true);
        const actionParams = {};
        if (originHost.trim() || originPort.trim()) {
            actionParams.origin = {};
            if (originHost.trim()) actionParams.origin.host = originHost.trim();
            if (originPort.trim()) actionParams.origin.port = parseInt(originPort);
        }
        if (hostHeader.trim()) actionParams.host_header = hostHeader.trim();

        const rule = {
            description: description.trim(),
            expression: expression.trim(),
            action: 'route',
            action_parameters: actionParams,
            enabled: ruleEnabled
        };
        try {
            const isEdit = editRuleIndex !== null;
            const res = await fetch(`/api/zones/${zone.id}/origin-rules`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify(isEdit
                    ? { action: 'update_rule', ruleIndex: editRuleIndex, rule }
                    : { action: 'create_rule', rule })
            });
            const data = await res.json();
            if (data.success) {
                showToast(t('ruleSaved'));
                setShowModal(false);
                fetchRules();
            } else {
                showToast(data.errors?.[0]?.message || t('errorOccurred'), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setSaving(false);
    };

    const handleDelete = (idx) => {
        openConfirm(t('deleteRuleConfirm') || 'Delete this rule?', t('deleteRuleConfirm') || 'Are you sure?', async () => {
            try {
                const res = await fetch(`/api/zones/${zone.id}/origin-rules`, {
                    method: 'POST',
                    headers: getHeaders(true),
                    body: JSON.stringify({ action: 'delete_rule', ruleIndex: idx })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(t('ruleDeleted'));
                    fetchRules();
                } else {
                    showToast(data.errors?.[0]?.message || t('errorOccurred'), 'error');
                }
            } catch (e) {
                showToast(t('errorOccurred'), 'error');
            }
        });
    };

    const ToggleSwitch = ({ checked, onChange, disabled }) => (
        <button role="switch" aria-checked={checked} onClick={onChange} disabled={disabled}
            style={{
                width: '40px', height: '22px', borderRadius: '11px', border: 'none',
                background: checked ? 'var(--primary)' : 'var(--border)',
                cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative',
                transition: 'background 0.2s', flexShrink: 0, opacity: disabled ? 0.6 : 1
            }}>
            <span style={{
                position: 'absolute', top: '2px', left: checked ? '20px' : '2px',
                width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
        </button>
    );

    if (loading && rules.length === 0 && !fetchError) {
        return <TabSkeleton variant="list" />;
    }

    if (fetchError && rules.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', fontSize: '0.8125rem', color: 'var(--error, #ef4444)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={16} /><span>{t('loadSettingsError').replace('{error}', fetchError)}</span></div>
                <button className="btn btn-outline" onClick={fetchRules} style={{ alignSelf: 'flex-start', padding: '4px 12px', fontSize: '0.75rem', marginTop: '4px' }}><RefreshCw size={12} /> {t('refresh') || 'Retry'}</button>
            </div>
        );
    }

    const inputStyle = { width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '0.8125rem', boxSizing: 'border-box' };
    const labelStyle = { display: 'block', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-muted)' };

    return (
        <div className="tab-enter" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server size={20} color="var(--primary)" />
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('orTitle')}</h3>
                    <span className="badge" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>{rules.length}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" onClick={openAdd} style={{ padding: '4px 10px', height: 'auto', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Plus size={12} /> {t('addRule')}
                    </button>
                    <button className="btn btn-outline" onClick={fetchRules} disabled={loading} style={{ padding: '4px 8px', height: 'auto', fontSize: '0.75rem' }}>
                        <RefreshCw size={12} className={loading ? 'spin' : ''} />
                    </button>
                    <a href={`https://dash.cloudflare.com/${zone.account?.id || ''}/${zone.name}/rules/origin-rules`}
                        target="_blank" rel="noopener noreferrer" className="btn btn-outline"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '4px 10px', textDecoration: 'none' }}>
                        <ExternalLink size={12} /> {t('rlManageInDashboard')}
                    </a>
                </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '-1rem 0 0 0', lineHeight: 1.5 }}>{t('orDesc')}</p>

            {rules.length === 0 ? (
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                    <Server size={32} color="var(--text-muted)" style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{t('orNoRules') || 'No origin rules configured.'}</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {rules.map((rule, idx) => (
                        <div key={rule.id || idx} className="glass-card" style={{ padding: '0.75rem 1rem', background: rule.enabled !== false ? 'var(--subtle-bg)' : 'transparent', opacity: rule.enabled !== false ? 1 : 0.7 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{rule.description || `Rule #${idx + 1}`}</span>
                                        {rule.action && <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px', textTransform: 'uppercase' }}>{rule.action.replace(/_/g, ' ')}</span>}
                                    </div>
                                    {rule.expression && <code style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all', display: 'block' }}>{rule.expression}</code>}
                                    {rule.action_parameters?.origin?.host && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '2px' }}>
                                            Origin: {rule.action_parameters.origin.host}{rule.action_parameters.origin.port ? `:${rule.action_parameters.origin.port}` : ''}
                                        </div>
                                    )}
                                    {rule.action_parameters?.host_header && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            Host Header: {rule.action_parameters.host_header}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, alignItems: 'center' }}>
                                    <button className="btn btn-outline" onClick={() => openEdit(rule, idx)} style={{ padding: '0.35rem', borderRadius: '6px' }} title={t('editRule')}><Edit2 size={14} /></button>
                                    <button className="btn btn-outline" onClick={() => handleDelete(idx)} style={{ padding: '0.35rem', borderRadius: '6px', color: 'var(--error)' }} title={t('delete')}><Trash2 size={14} /></button>
                                    <ToggleSwitch
                                        checked={rule.enabled !== false}
                                        onChange={() => handleToggleRule(idx, rule.enabled === false)}
                                        disabled={togglingRule[idx]}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="glass-card modal-content" onClick={e => e.stopPropagation()}
                        style={{ width: '100%', maxWidth: '560px', padding: '1.5rem', margin: '2rem auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Server size={18} color="var(--primary)" />
                                {editRuleIndex !== null ? t('editRule') : t('addRule')}
                            </h3>
                            <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}><X size={18} color="var(--text-muted)" /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div>
                                <label style={labelStyle}>{t('ruleDescription')}</label>
                                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="My origin rule" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>{t('ruleExpression')}</label>
                                <textarea value={expression} onChange={e => setExpression(e.target.value)}
                                    placeholder={t('ruleExpressionPlaceholder') || '(http.host eq "example.com")'}
                                    rows={3} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.75rem', resize: 'vertical' }} />
                            </div>
                            <div>
                                <label style={labelStyle}>{t('orOriginHost')}</label>
                                <input value={originHost} onChange={e => setOriginHost(e.target.value)} placeholder="origin.example.com" style={inputStyle} />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>{t('orOriginPort')}</label>
                                    <input type="number" value={originPort} onChange={e => setOriginPort(e.target.value)} placeholder="443" style={inputStyle} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>{t('orHostHeader')}</label>
                                    <input value={hostHeader} onChange={e => setHostHeader(e.target.value)} placeholder="custom-host.example.com" style={inputStyle} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('ruleEnabled')}:</label>
                                <ToggleSwitch checked={ruleEnabled} onChange={() => setRuleEnabled(!ruleEnabled)} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
                            <button className="btn btn-outline" onClick={() => setShowModal(false)}>{t('cancel')}</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? <RefreshCw size={14} className="spin" /> : (editRuleIndex !== null ? t('saveRule') : t('addRule'))}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OriginRules;
