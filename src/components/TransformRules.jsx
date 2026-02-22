import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Repeat, AlertTriangle, ExternalLink, ChevronDown, ChevronRight, Plus, Edit2, Trash2, X } from 'lucide-react';
import TabSkeleton from './TabSkeleton';

const TransformRules = ({ zone, getHeaders, t, showToast, openConfirm }) => {
    const [urlRewriteRules, setUrlRewriteRules] = useState([]);
    const [headerModRules, setHeaderModRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [togglingRule, setTogglingRule] = useState({});
    const [showUrlRewrite, setShowUrlRewrite] = useState(true);
    const [showHeaderMod, setShowHeaderMod] = useState(true);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editRuleIndex, setEditRuleIndex] = useState(null);
    const [editPhase, setEditPhase] = useState(null); // 'url_rewrite' | 'header_mod'
    const [saving, setSaving] = useState(false);

    // Shared form state
    const [description, setDescription] = useState('');
    const [expression, setExpression] = useState('');
    const [ruleEnabled, setRuleEnabled] = useState(true);

    // URL rewrite form
    const [pathType, setPathType] = useState('static');
    const [pathValue, setPathValue] = useState('');
    const [queryType, setQueryType] = useState('static');
    const [queryValue, setQueryValue] = useState('');

    // Header mod form
    const [headerOps, setHeaderOps] = useState([{ operation: 'set', name: '', value: '' }]);

    const fetchRules = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(`/api/zones/${zone.id}/transform-rules`, { headers: getHeaders() });
            const data = await res.json();
            if (data.success) {
                setUrlRewriteRules(data.url_rewrite_rules || []);
                setHeaderModRules(data.header_mod_rules || []);
            } else {
                setFetchError(data.errors?.[0]?.message || data.error || t('errorOccurred'));
            }
        } catch (e) {
            setFetchError(t('errorOccurred'));
        }
        setLoading(false);
    }, [zone.id]);

    useEffect(() => { fetchRules(); }, [fetchRules]);

    const handleToggleRule = async (phase, ruleIdx, enabled) => {
        const key = `${phase}_${ruleIdx}`;
        setTogglingRule(prev => ({ ...prev, [key]: true }));
        try {
            const res = await fetch(`/api/zones/${zone.id}/transform-rules`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({ action: 'toggle_rule', phase, ruleIndex: ruleIdx, enabled })
            });
            const data = await res.json();
            if (data.success) {
                if (phase === 'url_rewrite') {
                    setUrlRewriteRules(prev => prev.map((r, i) => i === ruleIdx ? { ...r, enabled } : r));
                } else {
                    setHeaderModRules(prev => prev.map((r, i) => i === ruleIdx ? { ...r, enabled } : r));
                }
                showToast(t('updateSuccess'));
            } else {
                showToast(data.errors?.[0]?.message || t('errorOccurred'), 'error');
            }
        } catch (e) {
            showToast(t('errorOccurred'), 'error');
        }
        setTogglingRule(prev => ({ ...prev, [key]: false }));
    };

    const openAdd = (phase) => {
        setEditRuleIndex(null);
        setEditPhase(phase);
        setDescription('');
        setExpression('');
        setRuleEnabled(true);
        if (phase === 'url_rewrite') {
            setPathType('static'); setPathValue('');
            setQueryType('static'); setQueryValue('');
        } else {
            setHeaderOps([{ operation: 'set', name: '', value: '' }]);
        }
        setShowModal(true);
    };

    const openEdit = (rule, idx, phase) => {
        setEditRuleIndex(idx);
        setEditPhase(phase);
        setDescription(rule.description || '');
        setExpression(rule.expression || '');
        setRuleEnabled(rule.enabled !== false);
        if (phase === 'url_rewrite') {
            const uri = rule.action_parameters?.uri || {};
            if (uri.path?.expression) { setPathType('dynamic'); setPathValue(uri.path.expression); }
            else { setPathType('static'); setPathValue(uri.path?.value || ''); }
            if (uri.query?.expression) { setQueryType('dynamic'); setQueryValue(uri.query.expression); }
            else { setQueryType('static'); setQueryValue(uri.query?.value || ''); }
        } else {
            const headers = rule.action_parameters?.headers || [];
            setHeaderOps(headers.length > 0 ? headers.map(h => ({ operation: h.operation, name: h.name, value: h.value || '' })) : [{ operation: 'set', name: '', value: '' }]);
        }
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!expression.trim()) { showToast(t('ruleExpression') + ' required', 'error'); return; }
        setSaving(true);

        let actionParams;
        if (editPhase === 'url_rewrite') {
            const uri = {};
            if (pathValue.trim()) uri.path = pathType === 'dynamic' ? { expression: pathValue.trim() } : { value: pathValue.trim() };
            if (queryValue.trim()) uri.query = queryType === 'dynamic' ? { expression: queryValue.trim() } : { value: queryValue.trim() };
            if (!uri.path && !uri.query) { showToast('Path or query rewrite required', 'error'); setSaving(false); return; }
            actionParams = { uri };
        } else {
            const validOps = headerOps.filter(h => h.name.trim());
            if (validOps.length === 0) { showToast('At least one header operation required', 'error'); setSaving(false); return; }
            actionParams = { headers: validOps.map(h => h.operation === 'remove' ? { operation: h.operation, name: h.name.trim() } : { operation: h.operation, name: h.name.trim(), value: h.value }) };
        }

        const rule = {
            description: description.trim(),
            expression: expression.trim(),
            action: 'rewrite',
            action_parameters: actionParams,
            enabled: ruleEnabled
        };
        try {
            const isEdit = editRuleIndex !== null;
            const res = await fetch(`/api/zones/${zone.id}/transform-rules`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({
                    action: isEdit ? 'update_rule' : 'create_rule',
                    phase: editPhase,
                    ...(isEdit ? { ruleIndex: editRuleIndex, rule } : { rule })
                })
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

    const handleDelete = (phase, idx) => {
        openConfirm(t('deleteRuleConfirm') || 'Delete this rule?', t('deleteRuleConfirm') || 'Are you sure?', async () => {
            try {
                const res = await fetch(`/api/zones/${zone.id}/transform-rules`, {
                    method: 'POST',
                    headers: getHeaders(true),
                    body: JSON.stringify({ action: 'delete_rule', phase, ruleIndex: idx })
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

    const updateHeaderOp = (idx, field, value) => {
        setHeaderOps(prev => prev.map((h, i) => i === idx ? { ...h, [field]: value } : h));
    };
    const addHeaderOp = () => setHeaderOps(prev => [...prev, { operation: 'set', name: '', value: '' }]);
    const removeHeaderOp = (idx) => setHeaderOps(prev => prev.filter((_, i) => i !== idx));

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

    const RuleList = ({ rules, phase, title, show, setShow }) => (
        <div className="glass-card" style={{ padding: '1rem', background: 'var(--subtle-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button className="unstyled" onClick={() => setShow(!show)} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', padding: '0.25rem 0', background: 'transparent', border: 'none', flex: 1 }}>
                    {show ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {title}
                    <span className="badge" style={{ fontSize: '0.65rem', padding: '1px 6px', marginLeft: '4px' }}>{rules.length}</span>
                </button>
                <button className="btn btn-primary" onClick={() => openAdd(phase)} style={{ padding: '3px 8px', height: 'auto', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Plus size={10} /> {t('addRule')}
                </button>
            </div>
            {show && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {rules.length === 0 ? (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>{t('trNoRules') || 'No rules configured.'}</p>
                    ) : rules.map((rule, idx) => (
                        <div key={rule.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: rule.enabled !== false ? 'var(--input-bg)' : 'transparent', opacity: rule.enabled !== false ? 1 : 0.7 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{rule.description || `Rule #${idx + 1}`}</span>
                                    {rule.action && <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px', textTransform: 'uppercase' }}>{rule.action}</span>}
                                </div>
                                {rule.expression && <code style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all', display: 'block' }}>{rule.expression}</code>}
                                {/* Show rewrite details */}
                                {phase === 'url_rewrite' && rule.action_parameters?.uri && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '2px' }}>
                                        {rule.action_parameters.uri.path && <>Path: {rule.action_parameters.uri.path.value || rule.action_parameters.uri.path.expression}</>}
                                        {rule.action_parameters.uri.query && <>{rule.action_parameters.uri.path ? ' | ' : ''}Query: {rule.action_parameters.uri.query.value || rule.action_parameters.uri.query.expression}</>}
                                    </div>
                                )}
                                {/* Show header mod details */}
                                {phase === 'header_mod' && rule.action_parameters?.headers && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '2px' }}>
                                        {rule.action_parameters.headers.map((h, i) => (
                                            <span key={i}>{i > 0 ? ', ' : ''}{h.operation} {h.name}{h.value ? `=${h.value}` : ''}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, alignItems: 'center' }}>
                                <button className="btn btn-outline" onClick={() => openEdit(rule, idx, phase)} style={{ padding: '0.3rem', borderRadius: '6px' }} title={t('editRule')}><Edit2 size={13} /></button>
                                <button className="btn btn-outline" onClick={() => handleDelete(phase, idx)} style={{ padding: '0.3rem', borderRadius: '6px', color: 'var(--error)' }} title={t('delete')}><Trash2 size={13} /></button>
                                <ToggleSwitch
                                    checked={rule.enabled !== false}
                                    onChange={() => handleToggleRule(phase, idx, rule.enabled === false)}
                                    disabled={togglingRule[`${phase}_${idx}`]}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    if (loading && urlRewriteRules.length === 0 && headerModRules.length === 0 && !fetchError) {
        return <TabSkeleton variant="list" />;
    }

    if (fetchError && urlRewriteRules.length === 0 && headerModRules.length === 0) {
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
                    <Repeat size={20} color="var(--primary)" />
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('trTitle')}</h3>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-outline" onClick={fetchRules} disabled={loading} style={{ padding: '4px 8px', height: 'auto', fontSize: '0.75rem' }}>
                        <RefreshCw size={12} className={loading ? 'spin' : ''} />
                    </button>
                    <a href={`https://dash.cloudflare.com/${zone.account?.id || ''}/${zone.name}/rules/transform-rules`}
                        target="_blank" rel="noopener noreferrer" className="btn btn-outline"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '4px 10px', textDecoration: 'none' }}>
                        <ExternalLink size={12} /> {t('rlManageInDashboard')}
                    </a>
                </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '-1rem 0 0 0', lineHeight: 1.5 }}>{t('trDesc')}</p>

            <RuleList rules={urlRewriteRules} phase="url_rewrite" title={t('trUrlRewrite') || 'URL Rewrite Rules'} show={showUrlRewrite} setShow={setShowUrlRewrite} />
            <RuleList rules={headerModRules} phase="header_mod" title={t('trHeaderMod') || 'Header Modification Rules'} show={showHeaderMod} setShow={setShowHeaderMod} />

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="glass-card modal-content" onClick={e => e.stopPropagation()}
                        style={{ width: '100%', maxWidth: '560px', padding: '1.5rem', margin: '2rem auto', maxHeight: '85vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Repeat size={18} color="var(--primary)" />
                                {editRuleIndex !== null ? t('editRule') : t('addRule')}
                                {editPhase === 'url_rewrite'
                                    ? <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>URL Rewrite</span>
                                    : <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>Header Mod</span>}
                            </h3>
                            <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}><X size={18} color="var(--text-muted)" /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div>
                                <label style={labelStyle}>{t('ruleDescription')}</label>
                                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="My transform rule" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>{t('ruleExpression')}</label>
                                <textarea value={expression} onChange={e => setExpression(e.target.value)}
                                    placeholder={t('ruleExpressionPlaceholder') || '(http.host eq "example.com")'}
                                    rows={3} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.75rem', resize: 'vertical' }} />
                            </div>

                            {editPhase === 'url_rewrite' ? (
                                <>
                                    <div>
                                        <label style={labelStyle}>{t('trRewritePath')}</label>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                            <button onClick={() => setPathType('static')} className={`badge ${pathType === 'static' ? 'badge-blue' : ''}`}
                                                style={{ cursor: 'pointer', border: 'none', fontSize: '0.7rem', padding: '2px 8px' }}>{t('staticValue')}</button>
                                            <button onClick={() => setPathType('dynamic')} className={`badge ${pathType === 'dynamic' ? 'badge-blue' : ''}`}
                                                style={{ cursor: 'pointer', border: 'none', fontSize: '0.7rem', padding: '2px 8px' }}>{t('dynamicExpression')}</button>
                                        </div>
                                        <input value={pathValue} onChange={e => setPathValue(e.target.value)}
                                            placeholder={pathType === 'static' ? '/new-path' : 'concat("/prefix", http.request.uri.path)'}
                                            style={{ ...inputStyle, fontFamily: pathType === 'dynamic' ? 'monospace' : 'inherit' }} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>{t('trRewriteQuery')}</label>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                            <button onClick={() => setQueryType('static')} className={`badge ${queryType === 'static' ? 'badge-blue' : ''}`}
                                                style={{ cursor: 'pointer', border: 'none', fontSize: '0.7rem', padding: '2px 8px' }}>{t('staticValue')}</button>
                                            <button onClick={() => setQueryType('dynamic')} className={`badge ${queryType === 'dynamic' ? 'badge-blue' : ''}`}
                                                style={{ cursor: 'pointer', border: 'none', fontSize: '0.7rem', padding: '2px 8px' }}>{t('dynamicExpression')}</button>
                                        </div>
                                        <input value={queryValue} onChange={e => setQueryValue(e.target.value)}
                                            placeholder={queryType === 'static' ? 'key=value' : 'concat(http.request.uri.query, "&extra=1")'}
                                            style={{ ...inputStyle, fontFamily: queryType === 'dynamic' ? 'monospace' : 'inherit' }} />
                                    </div>
                                </>
                            ) : (
                                <div>
                                    <label style={labelStyle}>{t('trHeaderOperation') || 'Header Operations'}</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {headerOps.map((op, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)' }}>
                                                <select value={op.operation} onChange={e => updateHeaderOp(idx, 'operation', e.target.value)}
                                                    style={{ padding: '0.35rem', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', width: '70px' }}>
                                                    <option value="set">{t('trHeaderOpSet') || 'Set'}</option>
                                                    <option value="add">{t('trHeaderOpAdd') || 'Add'}</option>
                                                    <option value="remove">{t('trHeaderOpRemove') || 'Remove'}</option>
                                                </select>
                                                <input value={op.name} onChange={e => updateHeaderOp(idx, 'name', e.target.value)}
                                                    placeholder={t('trHeaderName') || 'Header Name'}
                                                    style={{ ...inputStyle, flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem' }} />
                                                {op.operation !== 'remove' && (
                                                    <input value={op.value} onChange={e => updateHeaderOp(idx, 'value', e.target.value)}
                                                        placeholder={t('trHeaderValue') || 'Value'}
                                                        style={{ ...inputStyle, flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem' }} />
                                                )}
                                                {headerOps.length > 1 && (
                                                    <button onClick={() => removeHeaderOp(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: 'var(--error)', display: 'flex' }}>
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        <button className="btn btn-outline" onClick={addHeaderOp} style={{ alignSelf: 'flex-start', padding: '3px 10px', fontSize: '0.7rem' }}>
                                            <Plus size={10} /> {t('trAddHeaderOp') || 'Add Header'}
                                        </button>
                                    </div>
                                </div>
                            )}

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

export default TransformRules;
