import React, { useState, useEffect } from 'react';
import { User, Plus, Trash2, Edit2, RefreshCw, Save, Copy, CheckCircle, X } from 'lucide-react';

const UserManagement = ({ show, onClose, auth, t, showToast }) => {
    const [tab, setTab] = useState('users');
    const [userList, setUserList] = useState([]);
    const [userListLoading, setUserListLoading] = useState(false);
    const [showAddUser, setShowAddUser] = useState(false);
    const [newUserName, setNewUserName] = useState('');
    const [newUserRole, setNewUserRole] = useState('user');
    const [addUserLoading, setAddUserLoading] = useState(false);
    const [addUserError, setAddUserError] = useState('');
    const [createdSetupToken, setCreatedSetupToken] = useState('');
    const [editingUser, setEditingUser] = useState(null);
    const [editUserRole, setEditUserRole] = useState('user');
    const [editUserLoading, setEditUserLoading] = useState(false);
    const [auditLog, setAuditLog] = useState([]);
    const [auditLogLoading, setAuditLogLoading] = useState(false);
    const [auditLogPage, setAuditLogPage] = useState(1);
    const [auditLogHasMore, setAuditLogHasMore] = useState(false);
    const [appSettings, setAppSettings] = useState({ openRegistration: false });
    const [appSettingsLoading, setAppSettingsLoading] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState('');

    useEffect(() => {
        if (show && auth?.token && auth?.role === 'admin') {
            fetchUsers();
            fetchAppSettings();
        }
    }, [show]);

    useEffect(() => {
        if (!show) return;
        const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [show, onClose]);

    const fetchUsers = async () => {
        setUserListLoading(true);
        try {
            const res = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${auth.token}` } });
            if (res.ok) {
                const data = await res.json();
                setUserList(data.users || []);
            }
        } catch (err) { console.error('Failed to fetch users:', err); showToast(t('errorOccurred'), 'error'); }
        setUserListLoading(false);
    };

    const fetchAppSettings = async () => {
        try {
            const res = await fetch('/api/admin/app-settings', { headers: { 'Authorization': `Bearer ${auth.token}` } });
            if (res.ok) {
                const data = await res.json();
                const settings = data.settings || { openRegistration: false };
                setAppSettings(settings);
                if (settings.webhookUrl !== undefined) setWebhookUrl(settings.webhookUrl);
            }
        } catch (err) { console.error('Failed to fetch app settings:', err); }
    };

    const handleToggleOpenRegistration = async () => {
        setAppSettingsLoading(true);
        try {
            const res = await fetch('/api/admin/app-settings', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ openRegistration: !appSettings.openRegistration })
            });
            if (res.ok) {
                const data = await res.json();
                setAppSettings(data.settings);
                showToast(t('settingsSaved'), 'success');
            }
        } catch (err) { console.error('Failed to toggle open registration:', err); showToast(t('errorOccurred'), 'error'); }
        setAppSettingsLoading(false);
    };

    const handleAddUser = async () => {
        if (!newUserName.trim()) return;
        setAddUserLoading(true);
        setAddUserError('');
        setCreatedSetupToken('');
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newUserName.trim(), role: newUserRole })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(t('userCreated'), 'success');
                setCreatedSetupToken(data.setupToken || '');
                setNewUserName('');
                setNewUserRole('user');
                fetchUsers();
            } else {
                setAddUserError(data.error || t('errorOccurred'));
            }
        } catch (err) {
            setAddUserError(t('errorOccurred'));
        }
        setAddUserLoading(false);
    };

    const handleEditUser = async (uname, resetSetupToken = false) => {
        setEditUserLoading(true);
        setCreatedSetupToken('');
        try {
            const body = { username: uname, role: editUserRole };
            if (resetSetupToken) body.resetSetupToken = true;
            const res = await fetch('/api/admin/users', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (res.ok) {
                showToast(t('userUpdated'), 'success');
                if (data.setupToken) setCreatedSetupToken(data.setupToken);
                setEditingUser(null);
                fetchUsers();
            }
        } catch (err) { console.error('Failed to edit user:', err); showToast(t('errorOccurred'), 'error'); }
        setEditUserLoading(false);
    };

    const handleDeleteUser = async (uname) => {
        if (!confirm(t('confirmDeleteUser'))) return;
        try {
            const res = await fetch(`/api/admin/users?username=${encodeURIComponent(uname)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                showToast(t('userDeleted'), 'success');
                fetchUsers();
            }
        } catch (err) { console.error('Failed to delete user:', err); showToast(t('errorOccurred'), 'error'); }
    };

    const fetchAuditLog = async (page = 1) => {
        setAuditLogLoading(true);
        try {
            const res = await fetch(`/api/admin/audit-log?page=${page}&per_page=30`, {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAuditLog(data.entries || []);
                setAuditLogPage(page);
                setAuditLogHasMore(data.hasMore || false);
            }
        } catch (err) { console.error('Failed to fetch audit log:', err); }
        setAuditLogLoading(false);
    };

    const handleClearAuditLog = async () => {
        if (!confirm(t('auditLogClearConfirm'))) return;
        try {
            const res = await fetch('/api/admin/audit-log', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                showToast(t('auditLogCleared'), 'success');
                setAuditLog([]);
                setAuditLogPage(1);
                setAuditLogHasMore(false);
            }
        } catch (err) { console.error('Failed to clear audit log:', err); showToast(t('errorOccurred'), 'error'); }
    };

    const handleSaveWebhook = async () => {
        try {
            const res = await fetch('/api/admin/app-settings', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ webhookUrl })
            });
            if (res.ok) {
                const data = await res.json();
                setAppSettings(data.settings);
                showToast(t('webhookSaved'), 'success');
            }
        } catch (e) { console.error('Failed to save webhook:', e); showToast(t('errorOccurred'), 'error'); }
    };

    if (!show) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="glass-card fade-in" role="dialog" aria-label={t('usersManagement')} style={{ width: '100%', maxWidth: '580px', padding: '1.5rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('usersManagement')}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {tab === 'users' && (
                            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => { setShowAddUser(true); setAddUserError(''); }}>
                                <Plus size={14} /> {t('addUser')}
                            </button>
                        )}
                        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }} aria-label="Close">
                            <X size={18} color="var(--text-muted)" />
                        </button>
                    </div>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderBottom: '2px solid var(--border)' }}>
                    <button
                        onClick={() => setTab('users')}
                        style={{
                            padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            color: tab === 'users' ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: tab === 'users' ? '2px solid var(--primary)' : '2px solid transparent',
                            marginBottom: '-2px', transition: 'all 0.2s'
                        }}
                    >
                        {t('usersManagement')}
                    </button>
                    <button
                        onClick={() => { setTab('audit'); fetchAuditLog(1); }}
                        style={{
                            padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            color: tab === 'audit' ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: tab === 'audit' ? '2px solid var(--primary)' : '2px solid transparent',
                            marginBottom: '-2px', transition: 'all 0.2s'
                        }}
                    >
                        {t('auditLog')}
                    </button>
                </div>

                {/* Users Tab */}
                {tab === 'users' && (
                    <>
                        {/* Registration Settings */}
                        <div style={{ padding: '0.75rem 1rem', background: 'var(--hover-bg)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.15rem' }}>{t('appSettings')}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    {appSettings.openRegistration ? t('openRegistrationDesc') : t('inviteTokenModeDesc')}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                    {appSettings.openRegistration ? t('openRegistration') : t('inviteTokenMode')}
                                </span>
                                <button
                                    onClick={handleToggleOpenRegistration}
                                    disabled={appSettingsLoading}
                                    style={{
                                        width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                                        background: appSettings.openRegistration ? 'var(--primary)' : '#d1d5db',
                                        position: 'relative', transition: 'background 0.2s', flexShrink: 0
                                    }}
                                >
                                    <div style={{
                                        width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                                        position: 'absolute', top: '3px',
                                        left: appSettings.openRegistration ? '21px' : '3px',
                                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                    }} />
                                </button>
                            </div>
                        </div>

                        {/* Webhook URL */}
                        <div style={{ padding: '0.75rem 1rem', background: 'var(--hover-bg)', borderRadius: '8px', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>{t('webhookUrl')}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{t('webhookDesc')}</div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input type="text" value={webhookUrl}
                                    onChange={e => setWebhookUrl(e.target.value)}
                                    placeholder={t('webhookUrlPlaceholder')}
                                    style={{ flex: 1, fontSize: '0.8rem' }} />
                                <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={handleSaveWebhook}>
                                    <Save size={12} /> {t('save')}
                                </button>
                            </div>
                        </div>

                        {/* Add User Form */}
                        {showAddUser && (
                            <div style={{ padding: '1rem', background: 'var(--hover-bg)', borderRadius: '8px', marginBottom: '1rem' }}>
                                {createdSetupToken ? (
                                    <div>
                                        <p style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--success)' }}>
                                            <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                            {t('userCreated')}
                                        </p>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            {t('setupTokenLabel')}:
                                        </p>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                            <input type="text" readOnly value={createdSetupToken}
                                                style={{ flex: 1, fontSize: '0.75rem', fontFamily: 'monospace', background: 'var(--card-bg)', userSelect: 'all' }} />
                                            <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                onClick={() => { navigator.clipboard.writeText(createdSetupToken); showToast(t('setupTokenCopied'), 'success'); }}>
                                                <Copy size={12} /> {t('copied').split(' ')[0]}
                                            </button>
                                        </div>
                                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                            {t('setupAccountDesc')}
                                        </p>
                                        <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                            onClick={() => { setShowAddUser(false); setCreatedSetupToken(''); }}>
                                            {t('cancel')}
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <input type="text" placeholder={t('usernamePlaceholder')} value={newUserName}
                                            onChange={(e) => setNewUserName(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddUser(); }}
                                            style={{ flex: 1, fontSize: '0.85rem' }} />
                                        <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}
                                            style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                                            <option value="user">{t('roleUser')}</option>
                                            <option value="admin">{t('roleAdmin')}</option>
                                        </select>
                                        <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                            onClick={handleAddUser} disabled={addUserLoading || !newUserName.trim()}>
                                            {addUserLoading ? <RefreshCw className="spin" size={14} /> : t('addUser')}
                                        </button>
                                        <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                            onClick={() => { setShowAddUser(false); setAddUserError(''); setCreatedSetupToken(''); }}>
                                            {t('cancel')}
                                        </button>
                                    </div>
                                    {addUserError && <p style={{ color: 'var(--error)', fontSize: '0.75rem', margin: 0 }}>{addUserError}</p>}
                                    </>
                                )}
                            </div>
                        )}

                        {/* Setup token display (after reset) */}
                        {!showAddUser && createdSetupToken && (
                            <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #bbf7d0' }}>
                                <p style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--success)' }}>
                                    <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                    {t('resetSetupToken')}
                                </p>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <input type="text" readOnly value={createdSetupToken}
                                        style={{ flex: 1, fontSize: '0.75rem', fontFamily: 'monospace', background: 'var(--card-bg)', userSelect: 'all' }} />
                                    <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => { navigator.clipboard.writeText(createdSetupToken); showToast(t('setupTokenCopied'), 'success'); }}>
                                        <Copy size={12} /> {t('copied').split(' ')[0]}
                                    </button>
                                </div>
                                <button className="btn btn-outline" style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                                    onClick={() => setCreatedSetupToken('')}>
                                    <X size={12} />
                                </button>
                            </div>
                        )}

                        {/* User List */}
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {userListLoading ? (
                                <div style={{ textAlign: 'center', padding: '2rem' }}><RefreshCw className="spin" size={20} color="var(--primary)" /></div>
                            ) : (
                                userList.map(u => (
                                    <div key={u.username} style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)', gap: '0.5rem' }}>
                                        {editingUser === u.username ? (
                                            <>
                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <User size={14} color="var(--text-muted)" />
                                                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{u.username}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <select value={editUserRole} onChange={(e) => setEditUserRole(e.target.value)}
                                                            style={{ flex: 1, padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                                                            <option value="user">{t('roleUser')}</option>
                                                            <option value="admin">{t('roleAdmin')}</option>
                                                        </select>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                                                            onClick={() => handleEditUser(u.username)} disabled={editUserLoading}>
                                                            {editUserLoading ? <RefreshCw className="spin" size={12} /> : <Save size={12} />}
                                                        </button>
                                                        <button className="btn btn-outline" style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                                                            onClick={() => handleEditUser(u.username, true)} disabled={editUserLoading}
                                                            title={t('resetSetupToken')}>
                                                            <RefreshCw size={12} />
                                                        </button>
                                                        <button className="btn btn-outline" style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                                                            onClick={() => setEditingUser(null)}>
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <User size={14} color="var(--text-muted)" />
                                                <span style={{ flex: 1, fontWeight: 500, fontSize: '0.875rem' }}>{u.username}</span>
                                                {u.username !== 'admin' && (
                                                    <span className={`badge ${u.status === 'active' ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                                                        {u.status === 'active' ? t('userStatusActive') : t('userStatusPending')}
                                                    </span>
                                                )}
                                                <span className={`badge ${u.role === 'admin' ? 'badge-orange' : 'badge-green'}`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                                                    {u.role === 'admin' ? t('roleAdmin') : t('roleUser')}
                                                </span>
                                                {u.username !== 'admin' && (
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', color: 'var(--text-muted)' }}
                                                            onClick={() => { setEditingUser(u.username); setEditUserRole(u.role); }}
                                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                                            aria-label={`Edit user ${u.username}`}>
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', color: 'var(--text-muted)' }}
                                                            onClick={() => handleDeleteUser(u.username)}
                                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                                            aria-label={`Delete user ${u.username}`}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}

                {/* Audit Log Tab */}
                {tab === 'audit' && (
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                            <button
                                className="btn btn-outline"
                                onClick={handleClearAuditLog}
                                style={{ padding: '4px 10px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--error)', borderColor: 'var(--error)' }}
                            >
                                <Trash2 size={12} /> {t('auditLogClear')}
                            </button>
                        </div>

                        {auditLogLoading ? (
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <RefreshCw className="spin" size={20} color="var(--primary)" />
                            </div>
                        ) : auditLog.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '2rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {t('auditLogEmpty')}
                            </p>
                        ) : (
                            <>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('auditTime')}</th>
                                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('auditUser')}</th>
                                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('auditAction')}</th>
                                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{t('auditDetail')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditLog.map((entry, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                                    {new Date(entry.timestamp).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '0.5rem 0.6rem', fontWeight: 500 }}>
                                                    {entry.username}
                                                </td>
                                                <td style={{ padding: '0.5rem 0.6rem' }}>
                                                    <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>
                                                        {entry.action}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {entry.detail}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                                <button className="btn btn-outline" onClick={() => fetchAuditLog(auditLogPage - 1)}
                                    disabled={auditLogPage <= 1 || auditLogLoading}
                                    style={{ padding: '4px 12px', fontSize: '0.75rem' }}>
                                    {t('auditPrev')}
                                </button>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
                                    {auditLogPage}
                                </span>
                                <button className="btn btn-outline" onClick={() => fetchAuditLog(auditLogPage + 1)}
                                    disabled={!auditLogHasMore || auditLogLoading}
                                    style={{ padding: '4px 12px', fontSize: '0.75rem' }}>
                                    {t('auditNext')}
                                </button>
                            </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserManagement;
