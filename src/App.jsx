import React, { useState, useEffect, useRef } from 'react';
import { Server, User, Shield, Key, LogOut, Plus, Trash2, Edit2, RefreshCw, Zap, Languages, CheckCircle, AlertCircle, X, ChevronDown, Copy, Settings, Save, Fingerprint, Moon, Sun, Search, Upload, Globe } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import useTranslate from './hooks/useTranslate.js';
import { getAuthHeaders, hashPassword } from './utils/auth.js';
import Login from './components/Login.jsx';
import ZoneDetail from './components/ZoneDetail.jsx';
import SecurityBadges from './components/SecurityBadges.jsx';

const App = () => {
    const { t, lang, changeLang, toggleLang } = useTranslate();
    const [auth, setAuth] = useState(null);
    const [showAccountSelector, setShowAccountSelector] = useState(false);
    const accountSelectorRef = useRef(null);
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    const [recoveryToken, setRecoveryToken] = useState('');
    const [recoveryLoading, setRecoveryLoading] = useState(false);
    const [recoveryError, setRecoveryError] = useState('');
    const [showAddAccount, setShowAddAccount] = useState(false);
    const [newAccountToken, setNewAccountToken] = useState('');
    const [newAccountName, setNewAccountName] = useState('');
    const [addAccountLoading, setAddAccountLoading] = useState(false);
    const [addAccountError, setAddAccountError] = useState('');
    const [storageToggleLoading, setStorageToggleLoading] = useState(false);
    const [zoneStorageLoading, setZoneStorageLoading] = useState(false);
    const [isLocalMode, setIsLocalMode] = useState(false);
    const [showUserManagement, setShowUserManagement] = useState(false);
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
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [changePwdCurrent, setChangePwdCurrent] = useState('');
    const [changePwdNew, setChangePwdNew] = useState('');
    const [changePwdConfirm, setChangePwdConfirm] = useState('');
    const [changePwdLoading, setChangePwdLoading] = useState(false);
    const [changePwdError, setChangePwdError] = useState('');
    const [appSettings, setAppSettings] = useState({ openRegistration: false });
    const [appSettingsLoading, setAppSettingsLoading] = useState(false);
    const [showAddSession, setShowAddSession] = useState(false);
    const [addSessionUsername, setAddSessionUsername] = useState('');
    const [addSessionPassword, setAddSessionPassword] = useState('');
    const [addSessionLoading, setAddSessionLoading] = useState(false);
    const [addSessionError, setAddSessionError] = useState('');
    const [showPasskeyModal, setShowPasskeyModal] = useState(false);
    const [passkeys, setPasskeys] = useState([]);
    const [passkeyLoading, setPasskeyLoading] = useState(false);
    const [passkeyError, setPasskeyError] = useState('');
    const [userMgmtTab, setUserMgmtTab] = useState('users');
    const [auditLog, setAuditLog] = useState([]);
    const [auditLogLoading, setAuditLogLoading] = useState(false);
    const [auditLogPage, setAuditLogPage] = useState(1);
    const [auditLogHasMore, setAuditLogHasMore] = useState(false);
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('darkMode');
        return saved ? saved === 'true' : false;
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const searchRef = useRef(null);

    // Sync isLocalMode from global preference
    useEffect(() => {
        if (auth && auth.mode === 'server') {
            setIsLocalMode(localStorage.getItem('global_local_mode') === 'true');
        } else {
            setIsLocalMode(false);
        }
    }, [auth?.mode]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (accountSelectorRef.current && !accountSelectorRef.current.contains(event.target)) {
                setShowAccountSelector(false);
            }
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setSearchResults(null);
            }
        };

        const handleScroll = () => {
            if (showAccountSelector) setShowAccountSelector(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScroll, { capture: true });

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, { capture: true });
        };
    }, [showAccountSelector]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        localStorage.setItem('darkMode', String(darkMode));
    }, [darkMode]);

    // Periodic token refresh (every 12 minutes) for server mode
    useEffect(() => {
        if (!auth || auth.mode !== 'server' || !auth.refreshToken) return;

        const REFRESH_INTERVAL = 12 * 60 * 1000; // 12 minutes

        const doRefresh = async () => {
            const updated = await tryRefreshToken(auth);
            if (updated) {
                setAuth(updated);
                persistAuth(updated);
            } else {
                handleLogout();
            }
        };

        const intervalId = setInterval(doRefresh, REFRESH_INTERVAL);
        return () => clearInterval(intervalId);
    }, [auth?.refreshToken, auth?.mode]);

    const showToast = (message, type = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type, id: Date.now() });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    const selectZone = (zone, authData) => {
        const sessions = authData.sessions || [];
        // In local mode, set _localToken on auth for the selected zone
        if (zone._localKey) {
            const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
            const newAuth = { ...authData, _localToken: localTokens[zone._localKey] || null };
            setAuth(newAuth);
            persistAuth(newAuth);
        } else if (zone._sessionIdx != null && sessions[zone._sessionIdx]) {
            const s = sessions[zone._sessionIdx];
            const newAuth = {
                ...authData,
                _localToken: null,
                token: s.token,
                username: s.username,
                role: s.role,
                currentAccountIndex: zone._accountIdx || 0,
                activeSessionIndex: zone._sessionIdx
            };
            setAuth(newAuth);
            persistAuth(newAuth);
        }
        setSelectedZone(zone);
    };

    const fetchZones = async (authData) => {
        setLoading(true);
        const globalLocal = localStorage.getItem('global_local_mode') === 'true';
        const allZones = [];
        const promises = [];

        if (globalLocal && authData.mode === 'server') {
            // Local mode: only use tokens from localStorage
            const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
            const keys = Object.keys(localTokens);
            for (const key of keys) {
                const token = localTokens[key];
                promises.push(
                    fetch('/api/zones', { headers: { 'X-Cloudflare-Token': token } }).then(async res => {
                        if (res.ok) {
                            const data = await res.json();
                            return (data.result || []).map(z => ({ ...z, _localKey: key, _owner: key }));
                        }
                        return [];
                    }).catch(() => [])
                );
            }
        } else {
            // Server mode: use JWT + managed accounts
            const sessions = authData.sessions || [{ token: authData.token, username: authData.username, role: authData.role, accounts: authData.accounts || [] }];
            for (let si = 0; si < sessions.length; si++) {
                const session = sessions[si];
                const accounts = session.accounts || [];
                if (accounts.length === 0) {
                    promises.push(
                        fetch('/api/zones', {
                            headers: { 'Authorization': `Bearer ${session.token}`, 'X-Managed-Account-Index': '0' }
                        }).then(async res => {
                            if (res.ok) {
                                const data = await res.json();
                                return (data.result || []).map(z => ({ ...z, _sessionIdx: si, _accountIdx: 0, _owner: session.username }));
                            }
                            return [];
                        }).catch(() => [])
                    );
                    continue;
                }
                for (const acc of accounts) {
                    promises.push(
                        fetch('/api/zones', {
                            headers: { 'Authorization': `Bearer ${session.token}`, 'X-Managed-Account-Index': String(acc.id) }
                        }).then(async res => {
                            if (res.ok) {
                                const data = await res.json();
                                return (data.result || []).map(z => ({ ...z, _sessionIdx: si, _accountIdx: acc.id, _owner: session.username }));
                            }
                            return [];
                        }).catch(() => [])
                    );
                }
            }
        }

        const results = await Promise.all(promises);
        for (const zones of results) allZones.push(...zones);

        // Deduplicate zones by id (same zone might appear under different accounts)
        const seen = new Set();
        const uniqueZones = [];
        for (const z of allZones) {
            const key = `${z._owner}_${z.id}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueZones.push(z);
            }
        }

        const sortedZones = uniqueZones.sort((a, b) => new Date(b.modified_on) - new Date(a.modified_on));
        setZones(sortedZones);

        if (sortedZones.length > 0) {
            if (selectedZone) {
                const stillExists = sortedZones.find(z => z.id === selectedZone.id && z._owner === selectedZone._owner);
                if (stillExists) {
                    selectZone(stillExists, authData);
                } else {
                    selectZone(sortedZones[0], authData);
                }
            } else {
                selectZone(sortedZones[0], authData);
            }
        } else {
            setSelectedZone(null);
        }
        setLoading(false);
    };



    // Try to refresh token, returns updated auth or null on failure
    const tryRefreshToken = async (authData) => {
        if (!authData.refreshToken) return null;
        try {
            const res = await fetch('/api/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: authData.refreshToken })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.token) {
                    const updated = { ...authData, token: data.token };
                    const si = updated.activeSessionIndex || 0;
                    if (updated.sessions && updated.sessions[si]) {
                        const newSessions = [...updated.sessions];
                        newSessions[si] = { ...newSessions[si], token: data.token };
                        updated.sessions = newSessions;
                    }
                    if (data.refreshToken) updated.refreshToken = data.refreshToken;
                    if (data.accounts) {
                        updated.accounts = data.accounts;
                        if (updated.sessions && updated.sessions[si]) {
                            updated.sessions[si].accounts = data.accounts;
                        }
                    }
                    return updated;
                }
            }
        } catch (_e) { }
        return null;
    };

    useEffect(() => {
        const saved = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session');
        if (saved) {
            try {
                const credentials = JSON.parse(saved);
                // If we have a refresh token, refresh immediately to get a fresh access token
                if (credentials.refreshToken && credentials.mode === 'server') {
                    tryRefreshToken(credentials).then(updated => {
                        if (updated) {
                            setAuth(updated);
                            persistAuth(updated);
                            fetchZones(updated);
                        } else {
                            // Refresh failed — try with existing token (may still work)
                            setAuth(credentials);
                            fetchZones(credentials);
                        }
                    });
                } else {
                    setAuth(credentials);
                    fetchZones(credentials);
                }
            } catch (_e) {
                localStorage.removeItem('auth_session');
                sessionStorage.removeItem('auth_session');
            }
        }
    }, []);

    const handleLogin = (credentials) => {
        const session = { token: credentials.token, username: credentials.username, role: credentials.role, accounts: credentials.accounts || [] };
        const newAuth = {
            ...credentials,
            refreshToken: credentials.refreshToken || null,
            sessions: [session],
            activeSessionIndex: 0
        };
        setAuth(newAuth);
        const storage = credentials.remember ? localStorage : sessionStorage;
        storage.setItem('auth_session', JSON.stringify(newAuth));
        fetchZones(newAuth);
    };

    const persistAuth = (authData) => {
        const storage = authData.remember ? localStorage : sessionStorage;
        storage.setItem('auth_session', JSON.stringify(authData));
        if (!authData.remember) sessionStorage.setItem('auth_session', JSON.stringify(authData));
    };

    const handleLogout = () => {
        setAuth(null);
        setZones([]);
        setSelectedZone(null);
        localStorage.removeItem('auth_session');
        sessionStorage.removeItem('auth_session');
    };

    const handleRecoveryLogin = async () => {
        if (!recoveryToken.trim()) return;
        setRecoveryLoading(true);
        setRecoveryError('');
        try {
            const res = await fetch('/api/verify-token', {
                headers: { 'X-Cloudflare-Token': recoveryToken }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const credentials = { mode: 'client', token: recoveryToken, remember: false };
                handleLogin(credentials);
                setRecoveryToken('');
            } else {
                let errMsg = data.message || t('loginFailed');
                if (errMsg === 'Invalid token') errMsg = t('invalidToken');
                if (errMsg === 'No token provided') errMsg = t('tokenRequired');
                if (errMsg === 'Failed to verify token') errMsg = t('verifyFailed');
                setRecoveryError(errMsg);
            }
        } catch (err) {
            setRecoveryError(t('errorOccurred'));
        } finally {
            setRecoveryLoading(false);
        }
    };

    const handleSaveTokenToServer = async () => {
        if (!recoveryToken.trim()) return;
        setRecoveryLoading(true);
        setRecoveryError('');
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { ...getAuthHeaders(auth, true) },
                body: JSON.stringify({ token: recoveryToken, accountIndex: 0 })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(t('tokenSaved'), 'success');
                setRecoveryToken('');
                // Re-login with same server credentials to refresh accounts list and fetch zones
                fetchZones(auth);
            } else {
                setRecoveryError(data.error || t('tokenSaveFailed'));
            }
        } catch (err) {
            setRecoveryError(t('tokenSaveFailed'));
        } finally {
            setRecoveryLoading(false);
        }
    };

    const handleAddAccount = async () => {
        if (!newAccountToken.trim()) return;
        setAddAccountLoading(true);
        setAddAccountError('');
        try {
            // Find next available index
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
                setShowAddAccount(false);
                // Refresh accounts list
                const accRes = await fetch('/api/admin/settings', { headers: adminHeaders });
                const accData = await accRes.json();
                if (accRes.ok) {
                    const updatedAccounts = accData.accounts || [];
                    // Update the active session's accounts in sessions[]
                    const si = auth.activeSessionIndex || 0;
                    const newSessions = [...(auth.sessions || [])];
                    if (newSessions[si]) newSessions[si] = { ...newSessions[si], accounts: updatedAccounts };
                    const switchedAuth = { ...auth, accounts: updatedAccounts, sessions: newSessions, currentAccountIndex: data.id };
                    setAuth(switchedAuth);
                    persistAuth(switchedAuth);
                    fetchZones(switchedAuth);
                }
            } else {
                setAddAccountError(data.error || t('tokenSaveFailed'));
            }
        } catch (err) {
            setAddAccountError(t('tokenSaveFailed'));
        } finally {
            setAddAccountLoading(false);
        }
    };

    const handleRemoveAccount = async (accountId) => {
        if (!confirm(t('confirmRemoveAccount'))) return;
        const adminHeaders = { 'Authorization': `Bearer ${auth.token}` };
        try {
            const res = await fetch(`/api/admin/settings?index=${accountId}`, {
                method: 'DELETE',
                headers: adminHeaders
            });
            if (res.ok) {
                showToast(t('accountRemoved'), 'success');
                // Refresh accounts list
                const accRes = await fetch('/api/admin/settings', { headers: adminHeaders });
                const accData = await accRes.json();
                if (accRes.ok) {
                    const newAccounts = accData.accounts || [];
                    const si = auth.activeSessionIndex || 0;
                    const newSessions = [...(auth.sessions || [])];
                    if (newSessions[si]) newSessions[si] = { ...newSessions[si], accounts: newAccounts };
                    const newAuth = { ...auth, accounts: newAccounts, sessions: newSessions, currentAccountIndex: newAccounts.length > 0 ? newAccounts[0].id : 0 };
                    setAuth(newAuth);
                    persistAuth(newAuth);
                    fetchZones(newAuth);
                }
            }
        } catch (err) { }
    };

    const handleToggleStorage = async () => {
        if (auth.mode !== 'server') return;
        setStorageToggleLoading(true);
        const sessions = auth.sessions || [];

        try {
            if (!isLocalMode) {
                // Server → Local: move ALL tokens from KV to localStorage
                const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
                for (const session of sessions) {
                    const jwt = session.token;
                    const headers = { 'Authorization': `Bearer ${jwt}` };
                    // Get this user's accounts list
                    const accRes = await fetch('/api/admin/settings', { headers });
                    if (!accRes.ok) continue;
                    const accData = await accRes.json();
                    const accounts = accData.accounts || [];
                    // Retrieve each token and save locally
                    for (const acc of accounts) {
                        const retrieveRes = await fetch(`/api/admin/settings?retrieve=${acc.id}`, { headers });
                        if (!retrieveRes.ok) continue;
                        const retrieveData = await retrieveRes.json();
                        if (retrieveData.token) {
                            const localKey = `${session.username || 'admin'}_${acc.id}`;
                            localTokens[localKey] = retrieveData.token;
                            // Delete from KV
                            await fetch(`/api/admin/settings?index=${acc.id}`, { method: 'DELETE', headers });
                        }
                    }
                }
                localStorage.setItem('local_cf_tokens', JSON.stringify(localTokens));
                localStorage.setItem('global_local_mode', 'true');
                setIsLocalMode(true);
                setSelectedZone(null);
                showToast(t('switchedToLocal'), 'success');
                fetchZones(auth);
            } else {
                // Local → Server: move ALL tokens from localStorage back to KV
                const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
                for (const session of sessions) {
                    const jwt = session.token;
                    const headers = { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' };
                    const prefix = `${session.username || 'admin'}_`;
                    // Find all local tokens belonging to this session
                    for (const [key, token] of Object.entries(localTokens)) {
                        if (key.startsWith(prefix)) {
                            const accId = parseInt(key.substring(prefix.length));
                            const res = await fetch('/api/admin/settings', {
                                method: 'POST', headers,
                                body: JSON.stringify({ token, accountIndex: accId })
                            });
                            if (res.ok) delete localTokens[key];
                        }
                    }
                }
                localStorage.setItem('local_cf_tokens', JSON.stringify(localTokens));
                localStorage.setItem('global_local_mode', 'false');
                setIsLocalMode(false);
                showToast(t('switchedToServer'), 'success');
                // Clear local token from auth and refresh accounts from server
                const si = auth.activeSessionIndex || 0;
                const adminHeaders = { 'Authorization': `Bearer ${auth.token}` };
                const accRes = await fetch('/api/admin/settings', { headers: adminHeaders });
                if (accRes.ok) {
                    const accData = await accRes.json();
                    const updatedAccounts = accData.accounts || [];
                    const newSessions = [...sessions];
                    if (newSessions[si]) newSessions[si] = { ...newSessions[si], accounts: updatedAccounts };
                    const newAuth = { ...auth, _localToken: null, accounts: updatedAccounts, sessions: newSessions };
                    setAuth(newAuth);
                    persistAuth(newAuth);
                    setSelectedZone(null);
                    fetchZones(newAuth);
                } else {
                    const newAuth = { ...auth, _localToken: null };
                    setAuth(newAuth);
                    persistAuth(newAuth);
                    setSelectedZone(null);
                    fetchZones(newAuth);
                }
            }
        } catch (err) { }
        setStorageToggleLoading(false);
    };

    const handleAddLocalToken = async () => {
        if (!recoveryToken.trim()) return;
        setRecoveryLoading(true);
        setRecoveryError('');
        try {
            const res = await fetch('/api/verify-token', { headers: { 'X-Cloudflare-Token': recoveryToken } });
            const data = await res.json();
            if (res.ok && data.success) {
                const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
                let idx = 0;
                while (localTokens[`local_${idx}`]) idx++;
                localTokens[`local_${idx}`] = recoveryToken;
                localStorage.setItem('local_cf_tokens', JSON.stringify(localTokens));
                showToast(t('localTokenAdded'), 'success');
                setRecoveryToken('');
                fetchZones(auth);
            } else {
                let errMsg = data.message || t('loginFailed');
                if (errMsg === 'Invalid token') errMsg = t('invalidToken');
                if (errMsg === 'No token provided') errMsg = t('tokenRequired');
                if (errMsg === 'Failed to verify token') errMsg = t('verifyFailed');
                setRecoveryError(errMsg);
            }
        } catch (_e) {
            setRecoveryError(t('errorOccurred'));
        } finally {
            setRecoveryLoading(false);
        }
    };

    const handleRemoveLocalToken = (key) => {
        if (!confirm(t('confirmRemoveLocalToken'))) return;
        const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
        delete localTokens[key];
        localStorage.setItem('local_cf_tokens', JSON.stringify(localTokens));
        showToast(t('localTokenRemoved'), 'success');
        if (selectedZone && selectedZone._localKey === key) {
            setSelectedZone(null);
        }
        fetchZones(auth);
    };

    const getLocalTokensList = () => {
        const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
        return Object.entries(localTokens).map(([key, token]) => ({
            key,
            token,
            masked: token.substring(0, 8) + '••••••••' + token.substring(token.length - 4),
            zones: zones.filter(z => z._localKey === key).map(z => z.name)
        }));
    };

    const handleUploadLocalToken = async (key) => {
        const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
        const token = localTokens[key];
        if (!token) return;
        setStorageToggleLoading(true);
        try {
            const maxId = (auth.accounts || []).reduce((max, a) => Math.max(max, a.id), -1);
            const nextIndex = maxId + 1;
            const adminHeaders = { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' };
            const res = await fetch('/api/admin/settings', {
                method: 'POST', headers: adminHeaders,
                body: JSON.stringify({ token, accountIndex: nextIndex })
            });
            if (res.ok) {
                delete localTokens[key];
                localStorage.setItem('local_cf_tokens', JSON.stringify(localTokens));
                if (selectedZone && selectedZone._localKey === key) setSelectedZone(null);
                showToast(t('uploadedToServer'), 'success');
                const newAuth = await refreshAuthAccounts(auth);
                fetchZones(newAuth);
            } else {
                showToast(t('tokenSaveFailed'), 'error');
            }
        } catch (_e) {
            showToast(t('tokenSaveFailed'), 'error');
        }
        setStorageToggleLoading(false);
    };

    const refreshAuthAccounts = async (authData) => {
        const si = authData.activeSessionIndex || 0;
        const adminHeaders = { 'Authorization': `Bearer ${authData.token}` };
        const accRes = await fetch('/api/admin/settings', { headers: adminHeaders });
        if (accRes.ok) {
            const accData = await accRes.json();
            const updatedAccounts = accData.accounts || [];
            const newSessions = [...(authData.sessions || [])];
            if (newSessions[si]) newSessions[si] = { ...newSessions[si], accounts: updatedAccounts };
            const newAuth = { ...authData, _localToken: null, accounts: updatedAccounts, sessions: newSessions };
            setAuth(newAuth);
            persistAuth(newAuth);
            return newAuth;
        }
        return authData;
    };

    const handleToggleZoneStorage = async (zoneObj) => {
        if (auth.mode !== 'server') return;
        setZoneStorageLoading(true);
        try {
            if (zoneObj._localKey) {
                // Local → Server: upload this token to server
                const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
                const token = localTokens[zoneObj._localKey];
                if (token) {
                    const maxId = (auth.accounts || []).reduce((max, a) => Math.max(max, a.id), -1);
                    const nextIndex = maxId + 1;
                    const adminHeaders = { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' };
                    const res = await fetch('/api/admin/settings', {
                        method: 'POST', headers: adminHeaders,
                        body: JSON.stringify({ token, accountIndex: nextIndex })
                    });
                    if (res.ok) {
                        delete localTokens[zoneObj._localKey];
                        localStorage.setItem('local_cf_tokens', JSON.stringify(localTokens));
                        showToast(t('uploadedToServer'), 'success');
                        const newAuth = await refreshAuthAccounts(auth);
                        setSelectedZone(null);
                        fetchZones(newAuth);
                    }
                }
            } else {
                // Server → Local: retrieve token from server, save locally, delete from server
                const idx = zoneObj._accountIdx || 0;
                const adminHeaders = { 'Authorization': `Bearer ${auth.token}` };
                const res = await fetch(`/api/admin/settings?retrieve=${idx}`, { headers: adminHeaders });
                const data = await res.json();
                if (res.ok && data.token) {
                    const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
                    let localIdx = 0;
                    while (localTokens[`local_${localIdx}`]) localIdx++;
                    localTokens[`local_${localIdx}`] = data.token;
                    localStorage.setItem('local_cf_tokens', JSON.stringify(localTokens));
                    await fetch(`/api/admin/settings?index=${idx}`, { method: 'DELETE', headers: adminHeaders });
                    showToast(t('switchedToLocal'), 'success');
                    const newAuth = await refreshAuthAccounts(auth);
                    setSelectedZone(null);
                    fetchZones(newAuth);
                }
            }
        } catch (_e) {
            showToast(t('tokenSaveFailed'), 'error');
        }
        setZoneStorageLoading(false);
    };

    const fetchUsers = async () => {
        if (!auth || auth.role !== 'admin') return;
        setUserListLoading(true);
        try {
            const res = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${auth.token}` } });
            if (res.ok) {
                const data = await res.json();
                setUserList(data.users || []);
            }
        } catch (err) { }
        setUserListLoading(false);
    };

    const fetchAppSettings = async () => {
        if (!auth || auth.role !== 'admin') return;
        try {
            const res = await fetch('/api/admin/app-settings', { headers: { 'Authorization': `Bearer ${auth.token}` } });
            if (res.ok) {
                const data = await res.json();
                setAppSettings(data.settings || { openRegistration: false });
            }
        } catch (err) { }
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
        } catch (err) { }
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
        } catch (err) { }
        setEditUserLoading(false);
    };

    const handleDeleteUser = async (uname) => {
        if (!confirm(t('confirmDeleteUser'))) return;
        try {
            const res = await fetch(`/api/admin/users?username=${encodeURIComponent(uname)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            if (res.ok) {
                showToast(t('userDeleted'), 'success');
                fetchUsers();
            }
        } catch (err) { }
    };

    const handleAddSession = async () => {
        if (!addSessionUsername.trim() || !addSessionPassword.trim()) return;
        setAddSessionLoading(true);
        setAddSessionError('');
        try {
            const hashedPwd = await hashPassword(addSessionPassword);
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: addSessionUsername.trim(), password: hashedPwd })
            });
            const data = await res.json();
            if (res.ok && data.token) {
                const newSession = { token: data.token, username: data.username, role: data.role, accounts: data.accounts || [] };
                // Check if already logged in as this user
                const existing = (auth.sessions || []).findIndex(s => s.username === newSession.username);
                let newSessions;
                if (existing >= 0) {
                    newSessions = [...auth.sessions];
                    newSessions[existing] = newSession;
                } else {
                    newSessions = [...(auth.sessions || []), newSession];
                }
                const newAuth = { ...auth, sessions: newSessions };
                setAuth(newAuth);
                persistAuth(newAuth);
                setShowAddSession(false);
                setAddSessionUsername('');
                setAddSessionPassword('');
                showToast(t('sessionAdded'), 'success');
                fetchZones(newAuth);
            } else {
                setAddSessionError(data.error || t('loginFailed'));
            }
        } catch (err) {
            setAddSessionError(t('errorOccurred'));
        }
        setAddSessionLoading(false);
    };

    const handleChangePassword = async () => {
        if (!changePwdCurrent || !changePwdNew || !changePwdConfirm) return;
        if (changePwdNew !== changePwdConfirm) {
            setChangePwdError(t('passwordMismatch'));
            return;
        }
        if (changePwdNew.length < 8 || !/[a-zA-Z]/.test(changePwdNew) || !/[0-9]/.test(changePwdNew)) {
            setChangePwdError(t('passwordTooWeak'));
            return;
        }
        setChangePwdLoading(true);
        setChangePwdError('');
        try {
            const currentHashed = await hashPassword(changePwdCurrent);
            const newHashed = await hashPassword(changePwdNew);
            const res = await fetch('/api/account/password', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: currentHashed, newPassword: newHashed })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(t('passwordChanged'), 'success');
                setShowChangePassword(false);
                setChangePwdCurrent('');
                setChangePwdNew('');
                setChangePwdConfirm('');
            } else {
                setChangePwdError(data.error || t('passwordChangeError'));
            }
        } catch (err) {
            setChangePwdError(t('errorOccurred'));
        }
        setChangePwdLoading(false);
    };

    const fetchPasskeys = async () => {
        try {
            const res = await fetch('/api/passkey/credentials', {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            const data = await res.json();
            if (res.ok) setPasskeys(data.credentials || []);
        } catch (err) { }
    };

    const handleRegisterPasskey = async () => {
        if (!window.PublicKeyCredential) {
            setPasskeyError(t('passkeyNoSupport'));
            return;
        }
        setPasskeyLoading(true);
        setPasskeyError('');
        try {
            const optRes = await fetch('/api/passkey/register-options', {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            const optData = await optRes.json();
            if (!optRes.ok) {
                setPasskeyError(optData.error || t('passkeyError'));
                setPasskeyLoading(false);
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
                setPasskeyError(verifyData.error || t('passkeyError'));
            }
        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                setPasskeyError(t('passkeyError'));
            }
        }
        setPasskeyLoading(false);
    };

    const handleDeletePasskey = async (credId) => {
        try {
            const res = await fetch(`/api/passkey/credentials?id=${encodeURIComponent(credId)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            if (res.ok) {
                showToast(t('passkeyDeleted'), 'success');
                fetchPasskeys();
            }
        } catch (err) { }
    };

    const fetchAuditLog = async (page = 1) => {
        if (!auth || auth.role !== 'admin') return;
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
        } catch (err) { }
        setAuditLogLoading(false);
    };

    const handleClearAuditLog = async () => {
        if (!confirm(t('auditLogClearConfirm'))) return;
        try {
            const res = await fetch('/api/admin/audit-log', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            if (res.ok) {
                showToast(t('auditLogCleared'), 'success');
                setAuditLog([]);
                setAuditLogPage(1);
                setAuditLogHasMore(false);
            }
        } catch (err) { }
    };

    const handleRemoveSession = (sessionIdx) => {
        const sessions = auth.sessions || [];
        if (sessions.length <= 1) {
            handleLogout();
            return;
        }
        const newSessions = sessions.filter((_, i) => i !== sessionIdx);
        const newAuth = {
            ...auth,
            sessions: newSessions,
            token: newSessions[0].token,
            username: newSessions[0].username,
            role: newSessions[0].role,
            activeSessionIndex: 0,
            currentAccountIndex: newSessions[0].accounts?.[0]?.id || 0
        };
        setAuth(newAuth);
        persistAuth(newAuth);
        setSelectedZone(null);
        fetchZones(newAuth);
    };

    const handleSearch = async () => {
        if (!searchQuery || searchQuery.trim().length < 2) return;
        setSearchLoading(true);
        setSearchResults(null);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`, {
                headers: getAuthHeaders(auth)
            });
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data.results || []);
            } else {
                setSearchResults([]);
            }
        } catch (err) {
            setSearchResults([]);
        }
        setSearchLoading(false);
    };

    if (!auth) {
        return <Login onLogin={handleLogin} t={t} lang={lang} onLangChange={changeLang} />;
    }

    return (
        <div className="fade-in">
            {toast && (
                <div key={toast.id} style={{
                    position: 'fixed',
                    top: '24px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 9999,
                    background: toast.type === 'success' ? 'var(--card-bg)' : 'var(--card-bg)',
                    color: toast.type === 'success' ? 'var(--text)' : '#c53030',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    border: toast.type === 'success' ? '1px solid var(--border)' : '1px solid var(--border)',
                    animation: 'fadeDown 0.3s ease-out'
                }}>
                    <style>{`
                        @keyframes fadeDown {
                            from { opacity: 0; transform: translate(-50%, -20px); }
                            to { opacity: 1; transform: translate(-50%, 0); }
                        }
                    `}</style>
                    {toast.type === 'success' ? <CheckCircle size={18} color="var(--success)" /> : <AlertCircle size={18} color="var(--error)" />}
                    <span style={{ fontSize: '0.875rem', fontWeight: '600', whiteSpace: 'nowrap' }}>{toast.message}</span>
                    <button onClick={() => setToast(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', marginLeft: '4px' }}>
                        <X size={14} color="var(--text-muted)" />
                    </button>
                </div>
            )}
            <header>
                <div className="logo" onClick={() => window.location.reload()} style={{ cursor: 'pointer' }}>
                    <Zap size={22} color="var(--primary)" />
                    DNS <span>Manager</span>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        onClick={toggleLang}
                        style={{ border: 'none', background: 'transparent', padding: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)', borderRadius: '8px', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
                            e.currentTarget.style.color = 'var(--primary)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'var(--text-muted)';
                        }}
                        title={lang === 'zh' ? 'English' : '中文'}
                    >
                        <Languages size={18} />
                    </button>

                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        style={{ border: 'none', background: 'transparent', padding: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)', borderRadius: '8px', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
                            e.currentTarget.style.color = 'var(--primary)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'var(--text-muted)';
                        }}
                        title={darkMode ? t('lightMode') : t('darkMode')}
                    >
                        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                    </button>

                    {auth.mode === 'server' && (
                        <div ref={searchRef} style={{ position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--hover-bg)', borderRadius: '8px', padding: '2px 8px', border: '1px solid var(--border)' }}>
                                <Search size={14} color="var(--text-muted)" />
                                <input
                                    type="text"
                                    placeholder={t('globalSearchPlaceholder')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                                    style={{
                                        border: 'none', background: 'transparent', outline: 'none',
                                        fontSize: '0.75rem', padding: '4px 2px', width: '120px',
                                        color: 'var(--text)'
                                    }}
                                />
                                <button
                                    onClick={handleSearch}
                                    disabled={searchLoading || searchQuery.trim().length < 2}
                                    style={{
                                        border: 'none', background: 'transparent', cursor: 'pointer',
                                        padding: '2px', display: 'flex', color: 'var(--primary)',
                                        opacity: searchQuery.trim().length < 2 ? 0.4 : 1
                                    }}
                                >
                                    {searchLoading ? <RefreshCw className="spin" size={13} /> : <Search size={13} />}
                                </button>
                            </div>
                            {searchResults !== null && (
                                <div className="glass-card fade-in" style={{
                                    position: 'absolute', top: '110%', right: 0, width: '360px',
                                    maxHeight: '320px', overflowY: 'auto', zIndex: 150,
                                    padding: '0.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0.5rem', marginBottom: '0.25rem' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            {searchResults.length > 0
                                                ? t('searchResultCount').replace('{count}', searchResults.length)
                                                : t('searchNoResults')}
                                        </span>
                                        <button onClick={() => setSearchResults(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                                            <X size={14} color="var(--text-muted)" />
                                        </button>
                                    </div>
                                    {searchResults.length === 0 && (
                                        <p style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {t('searchNoResults')}
                                        </p>
                                    )}
                                    {searchResults.map((result, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => {
                                                const matchedZone = zones.find(z => z.name === result.zone_name || z.id === result.zone_id);
                                                if (matchedZone) selectZone(matchedZone, auth);
                                                setSearchResults(null);
                                                setSearchQuery('');
                                            }}
                                            style={{
                                                padding: '0.5rem 0.6rem', borderRadius: '6px', cursor: 'pointer',
                                                marginBottom: '2px', transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)' }}>{result.zone_name}</span>
                                                <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                                                    {result.type}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                {result.name} &rarr; {result.content}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {auth.role === 'admin' && (
                        <>
                        <div style={{ height: '16px', width: '1px', background: 'var(--border)' }}></div>
                        <button
                            onClick={() => { setShowUserManagement(true); fetchUsers(); fetchAppSettings(); }}
                            style={{ border: 'none', background: 'transparent', padding: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)', borderRadius: '8px', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = 'var(--primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                            title={t('usersManagement')}
                        >
                            <Settings size={18} />
                        </button>
                        </>
                    )}

                    <div style={{ height: '16px', width: '1px', background: 'var(--border)' }}></div>

                    {auth.mode === 'server' ? (
                        <button
                            onClick={handleToggleStorage}
                            disabled={storageToggleLoading}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                fontSize: '0.75rem', fontWeight: '600',
                                padding: '4px 10px', borderRadius: '6px',
                                border: '1px solid',
                                borderColor: isLocalMode ? 'var(--primary)' : 'var(--border)',
                                background: isLocalMode ? 'var(--select-active-bg)' : 'transparent',
                                color: isLocalMode ? 'var(--primary)' : 'var(--text-muted)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            title={isLocalMode ? t('switchedToLocal') : t('switchedToServer')}
                        >
                            {storageToggleLoading ? <RefreshCw className="spin" size={13} /> : <Server size={13} />}
                            {isLocalMode ? t('storageLocal') : t('storageServer')}
                        </button>
                    ) : (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            fontSize: '0.75rem', fontWeight: '600',
                            padding: '4px 10px', borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                        }}>
                            <Server size={13} />
                            {t('clientMode')}
                        </div>
                    )}

                    <div style={{ height: '16px', width: '1px', background: 'var(--border)' }}></div>


                    <div style={{ position: 'relative' }} ref={accountSelectorRef}>
                        <button
                            onClick={() => setShowAccountSelector(!showAccountSelector)}
                            style={{ border: 'none', background: 'transparent', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', borderRadius: '8px', transition: 'background 0.2s', fontSize: '0.8rem' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            title={t('switchAccount')}
                        >
                            <User size={16} />
                            <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{auth.username || 'admin'}</span>
                            <ChevronDown size={14} />
                        </button>
                        {showAccountSelector && (
                            <div className="glass-card fade-in" style={{
                                position: 'absolute',
                                top: '120%',
                                right: 0,
                                width: '220px',
                                padding: '0.25rem',
                                zIndex: 100,
                                maxHeight: '350px',
                                overflowY: 'auto'
                            }}>
                                {auth.mode === 'server' && (auth.sessions || []).map((session, si) => (
                                    <div key={session.username} style={{
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '6px',
                                        fontSize: '0.875rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        color: si === (auth.activeSessionIndex || 0) ? 'var(--primary)' : 'var(--text)',
                                        background: si === (auth.activeSessionIndex || 0) ? 'var(--select-active-bg)' : 'transparent',
                                        fontWeight: si === (auth.activeSessionIndex || 0) ? 600 : 400,
                                        marginBottom: '2px'
                                    }}
                                        onMouseEnter={e => { if (si !== (auth.activeSessionIndex || 0)) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                                        onMouseLeave={e => { if (si !== (auth.activeSessionIndex || 0)) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <User size={14} />
                                        <span style={{ flex: 1 }}>{session.username}</span>
                                        <span className={`badge ${session.role === 'admin' ? 'badge-orange' : 'badge-green'}`} style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                                            {session.role === 'admin' ? t('roleAdmin') : t('roleUser')}
                                        </span>
                                        {(auth.sessions || []).length > 1 && (
                                            <X size={13} style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
                                                onClick={(e) => { e.stopPropagation(); setShowAccountSelector(false); handleRemoveSession(si); }}
                                                onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                            />
                                        )}
                                    </div>
                                ))}

                                {auth.mode === 'server' && (
                                    <>
                                        <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }}></div>
                                        <div
                                            onClick={() => { setShowAccountSelector(false); setShowAddSession(true); }}
                                            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--select-active-bg)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <Plus size={14} />
                                            {t('loginAnotherAccount')}
                                        </div>
                                    </>
                                )}

                                <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }}></div>

                                {auth.mode === 'server' && auth.username !== 'admin' && (
                                    <div
                                        onClick={() => { setShowAccountSelector(false); setShowChangePassword(true); setChangePwdError(''); }}
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <Key size={14} />
                                        {t('changePassword')}
                                    </div>
                                )}

                                {auth.mode === 'server' && window.PublicKeyCredential && (
                                    <div
                                        onClick={() => { setShowAccountSelector(false); setShowPasskeyModal(true); setPasskeyError(''); fetchPasskeys(); }}
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <Fingerprint size={14} />
                                        {t('passkeyManage')}
                                    </div>
                                )}

                                <div
                                    onClick={handleLogout}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <LogOut size={14} />
                                    {t('logout')}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </header>

            {/* Add Account Modal */}
            {showAddAccount && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowAddAccount(false); setAddAccountError(''); } }}>
                    <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('addAccountTitle')}</h3>
                            <button onClick={() => { setShowAddAccount(false); setAddAccountError(''); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                                <X size={18} color="var(--text-muted)" />
                            </button>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('accountName')}</label>
                            <input
                                type="text"
                                placeholder={t('accountNamePlaceholder')}
                                value={newAccountName}
                                onChange={(e) => setNewAccountName(e.target.value)}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('tokenLabel')}</label>
                            <div style={{ position: 'relative' }}>
                                <Shield size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="password"
                                    placeholder={t('tokenPlaceholder')}
                                    value={newAccountToken}
                                    onChange={(e) => { setNewAccountToken(e.target.value); setAddAccountError(''); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddAccount(); }}
                                    style={{ paddingLeft: '38px', width: '100%' }}
                                />
                            </div>
                        </div>

                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            {t('noZonesGetToken')}{' '}
                            <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                                dash.cloudflare.com/profile/api-tokens
                            </a>
                        </p>

                        {addAccountError && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{addAccountError}</p>}

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={() => { setShowAddAccount(false); setAddAccountError(''); }}>{t('cancel')}</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleAddAccount}
                                disabled={addAccountLoading || !newAccountToken.trim()}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                {addAccountLoading ? <RefreshCw className="spin" size={14} /> : <Plus size={14} />}
                                {t('addAccount')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Session Modal */}
            {showAddSession && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowAddSession(false); setAddSessionError(''); } }}>
                    <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '380px', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('addSessionTitle')}</h3>
                            <button onClick={() => { setShowAddSession(false); setAddSessionError(''); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                                <X size={18} color="var(--text-muted)" />
                            </button>
                        </div>

                        <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('usernameLabel')}</label>
                            <div style={{ position: 'relative' }}>
                                <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="text" placeholder={t('usernamePlaceholder')} value={addSessionUsername}
                                    onChange={(e) => setAddSessionUsername(e.target.value)}
                                    style={{ paddingLeft: '38px', width: '100%' }} />
                            </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('passwordLabel')}</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="password" placeholder={t('passwordPlaceholder')} value={addSessionPassword}
                                    onChange={(e) => { setAddSessionPassword(e.target.value); setAddSessionError(''); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddSession(); }}
                                    style={{ paddingLeft: '38px', width: '100%' }} />
                            </div>
                        </div>

                        {addSessionError && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{addSessionError}</p>}

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={() => { setShowAddSession(false); setAddSessionError(''); }}>{t('cancel')}</button>
                            <button className="btn btn-primary" onClick={handleAddSession}
                                disabled={addSessionLoading || !addSessionUsername.trim() || !addSessionPassword.trim()}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {addSessionLoading ? <RefreshCw className="spin" size={14} /> : <LogOut size={14} style={{ transform: 'rotate(180deg)' }} />}
                                {t('loginBtn')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {showChangePassword && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowChangePassword(false); setChangePwdError(''); } }}>
                    <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '380px', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('changePassword')}</h3>
                            <button onClick={() => { setShowChangePassword(false); setChangePwdError(''); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                                <X size={18} color="var(--text-muted)" />
                            </button>
                        </div>

                        <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('currentPassword')}</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="password" placeholder={t('currentPasswordPlaceholder')} value={changePwdCurrent}
                                    onChange={(e) => { setChangePwdCurrent(e.target.value); setChangePwdError(''); }}
                                    style={{ paddingLeft: '38px', width: '100%' }} />
                            </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('newPassword')}</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="password" placeholder={t('newPasswordPlaceholder2')} value={changePwdNew}
                                    onChange={(e) => { setChangePwdNew(e.target.value); setChangePwdError(''); }}
                                    style={{ paddingLeft: '38px', width: '100%' }} />
                            </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>{t('confirmNewPassword')}</label>
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="password" placeholder={t('confirmNewPasswordPlaceholder')} value={changePwdConfirm}
                                    onChange={(e) => { setChangePwdConfirm(e.target.value); setChangePwdError(''); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); }}
                                    style={{ paddingLeft: '38px', width: '100%' }} />
                            </div>
                        </div>

                        {changePwdError && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{changePwdError}</p>}

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={() => { setShowChangePassword(false); setChangePwdError(''); }}>{t('cancel')}</button>
                            <button className="btn btn-primary" onClick={handleChangePassword}
                                disabled={changePwdLoading || !changePwdCurrent || !changePwdNew || !changePwdConfirm}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {changePwdLoading ? <RefreshCw className="spin" size={14} /> : <Save size={14} />}
                                {t('save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Passkey Management Modal */}
            {showPasskeyModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShowPasskeyModal(false); }}>
                    <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Fingerprint size={18} /> {t('passkeyManage')}
                            </h3>
                            <button onClick={() => setShowPasskeyModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                                <X size={18} color="var(--text-muted)" />
                            </button>
                        </div>

                        {passkeys.length === 0 ? (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                                {t('passkeyNone')}
                            </p>
                        ) : (
                            <div style={{ marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                                {passkeys.map((pk, i) => (
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
                                        <button
                                            onClick={() => handleDeletePasskey(pk.id)}
                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', color: 'var(--error)' }}
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {passkeyError && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{passkeyError}</p>}

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={() => setShowPasskeyModal(false)}>{t('cancel')}</button>
                            <button className="btn btn-primary" onClick={handleRegisterPasskey}
                                disabled={passkeyLoading}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {passkeyLoading ? <RefreshCw className="spin" size={14} /> : <Plus size={14} />}
                                {t('passkeyRegister')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* User Management Modal */}
            {showUserManagement && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: '1rem' }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShowUserManagement(false); }}>
                    <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '580px', padding: '1.5rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('usersManagement')}</h3>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {userMgmtTab === 'users' && (
                                    <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => { setShowAddUser(true); setAddUserError(''); }}>
                                        <Plus size={14} /> {t('addUser')}
                                    </button>
                                )}
                                <button onClick={() => setShowUserManagement(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                                    <X size={18} color="var(--text-muted)" />
                                </button>
                            </div>
                        </div>

                        {/* Tab Bar */}
                        <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderBottom: '2px solid var(--border)' }}>
                            <button
                                onClick={() => setUserMgmtTab('users')}
                                style={{
                                    padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                                    border: 'none', background: 'transparent', cursor: 'pointer',
                                    color: userMgmtTab === 'users' ? 'var(--primary)' : 'var(--text-muted)',
                                    borderBottom: userMgmtTab === 'users' ? '2px solid var(--primary)' : '2px solid transparent',
                                    marginBottom: '-2px', transition: 'all 0.2s'
                                }}
                            >
                                {t('usersManagement')}
                            </button>
                            <button
                                onClick={() => { setUserMgmtTab('audit'); fetchAuditLog(1); }}
                                style={{
                                    padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                                    border: 'none', background: 'transparent', cursor: 'pointer',
                                    color: userMgmtTab === 'audit' ? 'var(--primary)' : 'var(--text-muted)',
                                    borderBottom: userMgmtTab === 'audit' ? '2px solid var(--primary)' : '2px solid transparent',
                                    marginBottom: '-2px', transition: 'all 0.2s'
                                }}
                            >
                                {t('auditLog')}
                            </button>
                        </div>

                        {/* Users Tab */}
                        {userMgmtTab === 'users' && (
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
                                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', color: 'var(--text-muted)' }}
                                                            onClick={() => handleDeleteUser(u.username)}
                                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
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
                        {userMgmtTab === 'audit' && (
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
                                        <button
                                            className="btn btn-outline"
                                            onClick={() => fetchAuditLog(auditLogPage - 1)}
                                            disabled={auditLogPage <= 1 || auditLogLoading}
                                            style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                                        >
                                            {t('auditPrev')}
                                        </button>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
                                            {auditLogPage}
                                        </span>
                                        <button
                                            className="btn btn-outline"
                                            onClick={() => fetchAuditLog(auditLogPage + 1)}
                                            disabled={!auditLogHasMore || auditLogLoading}
                                            style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                                        >
                                            {t('auditNext')}
                                        </button>
                                    </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <main style={{ paddingBottom: '3rem' }}>
                {isLocalMode && auth.mode === 'server' ? (
                    /* === LOCAL MODE UI === */
                    selectedZone ? (
                        <ZoneDetail
                            zone={selectedZone}
                            zones={zones}
                            onSwitchZone={(z) => selectZone(z, auth)}
                            onRefreshZones={() => fetchZones(auth)}
                            zonesLoading={loading}
                            auth={auth}
                            onBack={() => { }}
                            t={t}
                            showToast={showToast}
                            onAddAccount={null}
                            onAddSession={() => setShowAddSession(true)}
                            onToggleZoneStorage={handleToggleZoneStorage}
                            zoneStorageLoading={zoneStorageLoading}
                        />
                    ) : (
                        <div className="container" style={{ marginTop: '2rem', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto' }}>
                            {loading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
                                    <RefreshCw className="spin" size={32} style={{ color: 'var(--primary)' }} />
                                    <p style={{ color: 'var(--text-muted)' }}>{t('statusInitializing')}</p>
                                </div>
                            ) : (
                                <div className="fade-in">
                                    {/* Local mode header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                                        <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('localModeTitle')}</h3>
                                        <span className="badge badge-orange" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>{t('localBadge')}</span>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                        {t('localModeDesc')}
                                    </p>

                                    {/* Local domains list */}
                                    {zones.length > 0 && (
                                        <div className="glass-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                                            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>{t('localTokens')}</h4>
                                            {zones.map((z) => (
                                                <div
                                                    key={z.id}
                                                    onClick={() => selectZone(z, auth)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                        padding: '0.5rem 0.6rem', borderRadius: '6px',
                                                        marginBottom: '4px', background: 'var(--hover-bg)',
                                                        cursor: 'pointer', transition: 'background 0.15s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--select-active-bg)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                                >
                                                    <Globe size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', flex: 1 }}>{z.name}</span>
                                                    <span className="badge badge-green" style={{ fontSize: '0.6rem', padding: '1px 5px', flexShrink: 0 }}>{z.status}</span>
                                                    <span className="badge badge-orange" style={{ fontSize: '0.6rem', padding: '1px 5px', flexShrink: 0 }}>{t('localBadge')}</span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleToggleZoneStorage(z); }}
                                                        disabled={zoneStorageLoading}
                                                        style={{
                                                            border: 'none', background: 'transparent', cursor: 'pointer',
                                                            padding: '2px', display: 'flex', color: 'var(--text-muted)', flexShrink: 0
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                                        title={t('uploadToServer')}
                                                    >
                                                        <Upload size={13} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleRemoveLocalToken(z._localKey); }}
                                                        style={{
                                                            border: 'none', background: 'transparent', cursor: 'pointer',
                                                            padding: '2px', display: 'flex', color: 'var(--text-muted)', flexShrink: 0
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                                        title={t('removeLocalToken')}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add local token card */}
                                    <div className="glass-card" style={{ padding: '1.25rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>{t('addLocalToken')}</h4>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                            {getLocalTokensList().length === 0 ? t('noLocalTokens') : t('noZonesEnterToken')}{' '}
                                            <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                                                dash.cloudflare.com/profile/api-tokens
                                            </a>
                                        </p>
                                        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                                            <Shield size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                            <input
                                                type="password"
                                                placeholder={t('tokenPlaceholder')}
                                                value={recoveryToken}
                                                onChange={(e) => { setRecoveryToken(e.target.value); setRecoveryError(''); }}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddLocalToken(); }}
                                                style={{ paddingLeft: '38px', width: '100%' }}
                                            />
                                        </div>
                                        {recoveryError && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{recoveryError}</p>}
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleAddLocalToken}
                                            disabled={recoveryLoading || !recoveryToken.trim()}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', justifyContent: 'center' }}
                                        >
                                            {recoveryLoading ? <RefreshCw className="spin" size={14} /> : <Plus size={14} />}
                                            {t('addLocalToken')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                ) : selectedZone ? (
                    /* === SERVER/CLIENT MODE WITH ZONE SELECTED === */
                    <ZoneDetail
                        zone={selectedZone}
                        zones={zones}
                        onSwitchZone={(z) => selectZone(z, auth)}
                        onRefreshZones={() => fetchZones(auth)}
                        zonesLoading={loading}
                        auth={auth}
                        onBack={() => { }}
                        t={t}
                        showToast={showToast}
                        onAddAccount={auth.mode === 'server' ? () => setShowAddAccount(true) : null}
                        onAddSession={() => setShowAddSession(true)}
                        onToggleZoneStorage={auth.mode === 'server' ? handleToggleZoneStorage : null}
                        zoneStorageLoading={zoneStorageLoading}
                    />
                ) : (
                    /* === SERVER/CLIENT MODE NO ZONES === */
                    <div className="container" style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-muted)' }}>
                        {loading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <RefreshCw className="spin" size={32} style={{ color: 'var(--primary)' }} />
                                <p>{t('statusInitializing')}</p>
                            </div>
                        ) : (
                            <div className="glass-card fade-in" style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', padding: '0.75rem', background: 'rgba(229, 62, 62, 0.1)', borderRadius: '12px', marginBottom: '1rem' }}>
                                    <AlertCircle size={32} color="var(--error)" />
                                </div>
                                <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>{t('noZonesFound')}</h3>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                    {auth.mode === 'server' ? t('noZonesServerExplanation') : t('noZonesClientExplanation')}
                                </p>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
                                    <button className="btn btn-outline" onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <LogOut size={14} /> {t('backToLogin')}
                                    </button>
                                    <button className="btn btn-outline" onClick={() => fetchZones(auth)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <RefreshCw size={14} /> {t('retryFetch')}
                                    </button>
                                </div>
                                <div style={{ height: '1px', background: 'var(--border)', margin: '1.5rem 0' }}></div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{t('noZonesEnterToken')}</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                    {t('noZonesGetToken')}{' '}
                                    <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                                        dash.cloudflare.com/profile/api-tokens
                                    </a>
                                </p>
                                <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                                    <Shield size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        type="password"
                                        placeholder={t('tokenPlaceholder')}
                                        value={recoveryToken}
                                        onChange={(e) => { setRecoveryToken(e.target.value); setRecoveryError(''); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && auth.mode === 'server') handleSaveTokenToServer(); else if (e.key === 'Enter') handleRecoveryLogin(); }}
                                        style={{ paddingLeft: '38px', width: '100%' }}
                                    />
                                </div>
                                {auth.mode === 'server' && (
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{t('saveToServerHint')}</p>
                                )}
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                    {auth.mode === 'server' && (
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleSaveTokenToServer}
                                            disabled={recoveryLoading || !recoveryToken.trim()}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                        >
                                            {recoveryLoading ? <RefreshCw className="spin" size={14} /> : <Save size={14} />}
                                            {t('saveToServer')}
                                        </button>
                                    )}
                                    <button
                                        className={auth.mode === 'server' ? 'btn btn-outline' : 'btn btn-primary'}
                                        onClick={handleRecoveryLogin}
                                        disabled={recoveryLoading || !recoveryToken.trim()}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <Key size={14} />
                                        {t('useDirectly')}
                                    </button>
                                </div>
                                {recoveryError && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginTop: '0.75rem' }}>{recoveryError}</p>}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Footer Security Badges */}
            <footer style={{
                padding: '1.5rem 1rem', textAlign: 'center',
                borderTop: '1px solid var(--border)', background: 'var(--card-bg)'
            }}>
                <SecurityBadges t={t} />
                <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.5rem', letterSpacing: '0.02em' }}>
                    Cloudflare DNS Manager &mdash; {lang === 'zh' ? '您的数据安全是我们的首要任务' : 'Your data security is our top priority'}
                </p>
            </footer>
        </div >
    );
};

export default App;
