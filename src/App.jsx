import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Server, User, Shield, Key, LogOut, Plus, Trash2, RefreshCw, Zap, Languages, CheckCircle, AlertCircle, X, ChevronDown, Settings, Save, Fingerprint, Moon, Sun, Search, Upload, Globe, Layers } from 'lucide-react';
import useTranslate from './hooks/useTranslate.ts';
import { getAuthHeaders } from './utils/auth.ts';
import SecurityBadges from './components/SecurityBadges.jsx';

const Login = React.lazy(() => import('./components/Login.jsx'));
const ZoneDetail = React.lazy(() => import('./components/ZoneDetail.jsx'));
const AddAccountModal = React.lazy(() => import('./components/AddAccountModal.jsx'));
const AddSessionModal = React.lazy(() => import('./components/AddSessionModal.jsx'));
const ChangePasswordModal = React.lazy(() => import('./components/ChangePasswordModal.jsx'));
const PasskeyModal = React.lazy(() => import('./components/PasskeyModal.jsx'));
const TotpModal = React.lazy(() => import('./components/TotpModal.jsx'));
const BulkOperationsModal = React.lazy(() => import('./components/BulkOperationsModal.jsx'));
const UserManagement = React.lazy(() => import('./components/UserManagement.jsx'));

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
    const [storageToggleLoading, setStorageToggleLoading] = useState(false);
    const [zoneStorageLoading, setZoneStorageLoading] = useState(false);
    const [isLocalMode, setIsLocalMode] = useState(false);
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('darkMode');
        return saved ? saved === 'true' : false;
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchResultsVisible, setSearchResultsVisible] = useState(50);
    const searchRef = useRef(null);
    const refreshInProgress = useRef(false);
    const refreshAbortController = useRef(null);
    const zoneFetchCache = useRef(new Map());

    // Modal visibility toggles
    const [showAddAccount, setShowAddAccount] = useState(false);
    const [showAddSession, setShowAddSession] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [showPasskeyModal, setShowPasskeyModal] = useState(false);
    const [showTotpModal, setShowTotpModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [showUserManagement, setShowUserManagement] = useState(false);

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
        const abortController = new AbortController();
        refreshAbortController.current = abortController;

        const doRefresh = async () => {
            if (refreshInProgress.current) return;
            if (abortController.signal.aborted) return;
            refreshInProgress.current = true;
            try {
                const updated = await tryRefreshToken(auth, abortController.signal);
                if (abortController.signal.aborted) return;
                if (updated) {
                    setAuth(updated);
                    persistAuth(updated);
                } else {
                    handleLogout();
                }
            } finally {
                refreshInProgress.current = false;
            }
        };

        const intervalId = setInterval(doRefresh, REFRESH_INTERVAL);
        return () => {
            clearInterval(intervalId);
            abortController.abort();
            refreshAbortController.current = null;
        };
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

        // Clear the deduplication cache at the start of each fetch cycle
        const batchCache = zoneFetchCache.current;
        batchCache.clear();

        if (globalLocal && authData.mode === 'server') {
            // Local mode: only use tokens from localStorage
            const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
            const keys = Object.keys(localTokens);
            for (const key of keys) {
                const token = localTokens[key];
                // Deduplicate by token — skip if already fetching for this token
                const cacheKey = `local:${token}`;
                if (batchCache.has(cacheKey)) {
                    promises.push(batchCache.get(cacheKey).then(zones =>
                        zones.map(z => ({ ...z, _localKey: key, _owner: key }))
                    ));
                    continue;
                }
                const fetchPromise = fetch('/api/zones', { headers: { 'X-Cloudflare-Token': token } }).then(async res => {
                    if (res.ok) {
                        const data = await res.json();
                        return data.result || [];
                    }
                    console.error(`Failed to fetch zones for local token ${key}: HTTP ${res.status}`);
                    return [];
                }).catch((err) => { console.error(`Failed to fetch zones for local token ${key}:`, err); return []; });
                batchCache.set(cacheKey, fetchPromise);
                promises.push(fetchPromise.then(zones => zones.map(z => ({ ...z, _localKey: key, _owner: key }))));
            }
        } else {
            // Server mode: use JWT + managed accounts
            // Batch all account fetches per session into a single parallel operation
            const sessions = authData.sessions || [{ token: authData.token, username: authData.username, role: authData.role, accounts: authData.accounts || [] }];
            for (let si = 0; si < sessions.length; si++) {
                const session = sessions[si];
                const accounts = session.accounts || [];
                const sessionPromises = [];
                if (accounts.length === 0) {
                    const cacheKey = `session:${session.token}:0`;
                    if (!batchCache.has(cacheKey)) {
                        const fetchPromise = fetch('/api/zones', {
                            headers: { 'Authorization': `Bearer ${session.token}`, 'X-Managed-Account-Index': '0' }
                        }).then(async res => {
                            if (res.ok) {
                                const data = await res.json();
                                return data.result || [];
                            }
                            console.error(`Failed to fetch zones for session ${session.username} (account 0): HTTP ${res.status}`);
                            return [];
                        }).catch((err) => { console.error(`Failed to fetch zones for session ${session.username} (account 0):`, err); return []; });
                        batchCache.set(cacheKey, fetchPromise);
                    }
                    sessionPromises.push(
                        batchCache.get(cacheKey).then(zones =>
                            zones.map(z => ({ ...z, _sessionIdx: si, _accountIdx: 0, _owner: session.username }))
                        )
                    );
                } else {
                    for (const acc of accounts) {
                        const cacheKey = `session:${session.token}:${acc.id}`;
                        if (!batchCache.has(cacheKey)) {
                            const fetchPromise = fetch('/api/zones', {
                                headers: { 'Authorization': `Bearer ${session.token}`, 'X-Managed-Account-Index': String(acc.id) }
                            }).then(async res => {
                                if (res.ok) {
                                    const data = await res.json();
                                    return data.result || [];
                                }
                                console.error(`Failed to fetch zones for session ${session.username} (account ${acc.id}): HTTP ${res.status}`);
                                return [];
                            }).catch((err) => { console.error(`Failed to fetch zones for session ${session.username} (account ${acc.id}):`, err); return []; });
                            batchCache.set(cacheKey, fetchPromise);
                        }
                        sessionPromises.push(
                            batchCache.get(cacheKey).then(zones =>
                                zones.map(z => ({ ...z, _sessionIdx: si, _accountIdx: acc.id, _owner: session.username }))
                            )
                        );
                    }
                }
                // Batch all account fetches for this session into a single Promise.all
                promises.push(Promise.all(sessionPromises).then(results => results.flat()));
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
    const tryRefreshToken = async (authData, signal) => {
        if (!authData.refreshToken) return null;
        try {
            const fetchOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: authData.refreshToken })
            };
            if (signal) fetchOptions.signal = signal;
            const res = await fetch('/api/refresh', fetchOptions);
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
        } catch (err) { console.error('Token refresh failed:', err); }
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
            } catch (err) {
                console.error('Failed to parse saved auth session:', err);
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
        // Fire-and-forget: revoke refresh token on the server
        if (auth && auth.mode === 'server' && auth.refreshToken && auth.token) {
            fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${auth.token}`
                },
                body: JSON.stringify({ refreshToken: auth.refreshToken })
            }).catch(() => {});
        }

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

    const handleRemoveAccount = async (accountId) => {
        if (!confirm(t('confirmRemoveAccount'))) return;
        const adminHeaders = { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' };
        try {
            const res = await fetch(`/api/admin/settings?index=${accountId}`, {
                method: 'DELETE',
                headers: adminHeaders
            });
            if (res.ok) {
                showToast(t('accountRemoved'), 'success');
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
        } catch (err) { console.error('Failed to remove account:', err); showToast(t('errorOccurred'), 'error'); }
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

    const ensureFreshAuth = async () => {
        if (auth.refreshToken) {
            const updated = await tryRefreshToken(auth);
            if (updated) {
                setAuth(updated);
                persistAuth(updated);
                return updated;
            }
        }
        return auth;
    };

    const handleToggleStorage = () => {
        if (auth.mode !== 'server') return;
        const newLocal = !isLocalMode;
        localStorage.setItem('global_local_mode', newLocal ? 'true' : 'false');
        setIsLocalMode(newLocal);
        setSelectedZone(null);
        showToast(newLocal ? t('switchedToLocal') : t('switchedToServer'), 'success');
        fetchZones(auth);
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
        } catch (err) {
            console.error('Failed to add local token:', err);
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
            const freshAuth = await ensureFreshAuth();
            const maxId = (freshAuth.accounts || []).reduce((max, a) => Math.max(max, a.id), -1);
            const nextIndex = maxId + 1;
            const adminHeaders = { 'Authorization': `Bearer ${freshAuth.token}`, 'Content-Type': 'application/json' };
            const res = await fetch('/api/admin/settings', {
                method: 'POST', headers: adminHeaders,
                body: JSON.stringify({ token, accountIndex: nextIndex })
            });
            if (res.ok) {
                delete localTokens[key];
                localStorage.setItem('local_cf_tokens', JSON.stringify(localTokens));
                if (selectedZone && selectedZone._localKey === key) setSelectedZone(null);
                showToast(t('uploadedToServer'), 'success');
                const newAuth = await refreshAuthAccounts(freshAuth);
                fetchZones(newAuth);
            } else {
                showToast(t('tokenSaveFailed'), 'error');
            }
        } catch (err) {
            console.error('Failed to upload local token to server:', err);
            showToast(t('tokenSaveFailed'), 'error');
        }
        setStorageToggleLoading(false);
    };

    const handleToggleZoneStorage = async (zoneObj) => {
        if (auth.mode !== 'server') return;
        setZoneStorageLoading(true);
        try {
            const freshAuth = await ensureFreshAuth();
            if (zoneObj._localKey) {
                // Local → Server: upload this token to server
                const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
                const token = localTokens[zoneObj._localKey];
                if (token) {
                    const maxId = (freshAuth.accounts || []).reduce((max, a) => Math.max(max, a.id), -1);
                    const nextIndex = maxId + 1;
                    const adminHeaders = { 'Authorization': `Bearer ${freshAuth.token}`, 'Content-Type': 'application/json' };
                    const res = await fetch('/api/admin/settings', {
                        method: 'POST', headers: adminHeaders,
                        body: JSON.stringify({ token, accountIndex: nextIndex })
                    });
                    if (res.ok) {
                        delete localTokens[zoneObj._localKey];
                        localStorage.setItem('local_cf_tokens', JSON.stringify(localTokens));
                        showToast(t('uploadedToServer'), 'success');
                        const newAuth = await refreshAuthAccounts(freshAuth);
                        setSelectedZone(null);
                        fetchZones(newAuth);
                    } else {
                        showToast(t('tokenSaveFailed'), 'error');
                    }
                }
            } else {
                // Server → Local: retrieve token from server, save locally, delete from server
                const idx = zoneObj._accountIdx || 0;
                const adminHeaders = { 'Authorization': `Bearer ${freshAuth.token}`, 'Content-Type': 'application/json' };
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
                    const newAuth = await refreshAuthAccounts(freshAuth);
                    setSelectedZone(null);
                    fetchZones(newAuth);
                } else {
                    showToast(t('tokenSaveFailed'), 'error');
                }
            }
        } catch (err) {
            console.error('Failed to toggle zone storage:', err);
            showToast(t('tokenSaveFailed'), 'error');
        }
        setZoneStorageLoading(false);
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
        setSearchResultsVisible(50);
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
            console.error('Search request failed:', err);
            setSearchResults([]);
        }
        setSearchLoading(false);
    };

    const handleAccountAdded = (newAuth) => {
        setAuth(newAuth);
        persistAuth(newAuth);
        fetchZones(newAuth);
    };

    const handleSessionAdded = (newAuth) => {
        setAuth(newAuth);
        persistAuth(newAuth);
        fetchZones(newAuth);
    };

    if (!auth) {
        return (
            <Suspense fallback={<div className="lazy-loading" />}>
                <Login onLogin={handleLogin} t={t} lang={lang} onLangChange={changeLang} />
            </Suspense>
        );
    }

    return (
        <Suspense fallback={<div className="lazy-loading" />}>
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
                    <button onClick={() => setToast(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', marginLeft: '4px' }} aria-label="Close notification">
                        <X size={14} color="var(--text-muted)" />
                    </button>
                </div>
            )}
            <header>
                <button className="unstyled logo" onClick={() => window.location.reload()} aria-label="DNS Manager - Reload">
                    <Zap size={22} color="var(--primary)" />
                    DNS <span>Manager</span>
                </button>

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
                        aria-label={lang === 'zh' ? 'Switch to English' : '切换到中文'}
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
                        aria-label={darkMode ? t('lightMode') : t('darkMode')}
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
                                    aria-label={t('globalSearchPlaceholder')}
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
                                        <button onClick={() => setSearchResults(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', display: 'flex' }} aria-label="Close search results">
                                            <X size={14} color="var(--text-muted)" />
                                        </button>
                                    </div>
                                    {searchResults.length === 0 && (
                                        <p style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {t('searchNoResults')}
                                        </p>
                                    )}
                                    {searchResults.slice(0, searchResultsVisible).map((result, idx) => (
                                        <div
                                            key={idx}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => {
                                                const matchedZone = zones.find(z => z.name === result.zoneName || z.id === result.zoneId);
                                                if (matchedZone) selectZone(matchedZone, auth);
                                                setSearchResults(null);
                                                setSearchQuery('');
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    const matchedZone = zones.find(z => z.name === result.zoneName || z.id === result.zoneId);
                                                    if (matchedZone) selectZone(matchedZone, auth);
                                                    setSearchResults(null);
                                                    setSearchQuery('');
                                                }
                                            }}
                                            style={{
                                                padding: '0.5rem 0.6rem', borderRadius: '6px', cursor: 'pointer',
                                                marginBottom: '2px', transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)' }}>{result.zoneName}</span>
                                                <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                                                    {result.type}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                {result.name} &rarr; {result.content}
                                            </div>
                                        </div>
                                    ))}
                                    {searchResults.length > searchResultsVisible && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSearchResultsVisible(prev => prev + 50); }}
                                            style={{
                                                width: '100%', padding: '0.4rem', border: 'none',
                                                background: 'var(--hover-bg)', borderRadius: '6px',
                                                cursor: 'pointer', fontSize: '0.7rem', color: 'var(--primary)',
                                                fontWeight: 600, marginTop: '0.25rem', transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--select-active-bg)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--hover-bg)'}
                                        >
                                            {t('showMore') || 'Show more'} ({searchResults.length - searchResultsVisible} remaining)
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {auth.mode === 'server' && !isLocalMode && (
                        <button
                            onClick={() => setShowBulkModal(true)}
                            style={{ border: 'none', background: 'transparent', padding: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)', borderRadius: '8px', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = 'var(--primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                            title={t('bulkOperations')}
                            aria-label={t('bulkOperations')}
                        >
                            <Layers size={18} />
                        </button>
                    )}

                    {auth.role === 'admin' && (
                        <>
                        <div style={{ height: '16px', width: '1px', background: 'var(--border)' }}></div>
                        <button
                            onClick={() => setShowUserManagement(true)}
                            style={{ border: 'none', background: 'transparent', padding: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)', borderRadius: '8px', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = 'var(--primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                            title={t('usersManagement')}
                            aria-label={t('usersManagement')}
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
                            aria-label={t('switchAccount')}
                            aria-expanded={showAccountSelector}
                            aria-haspopup="true"
                        >
                            <User size={16} />
                            <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{auth.username || 'admin'}</span>
                            <ChevronDown size={14} />
                        </button>
                        {showAccountSelector && (
                            <div className="glass-card fade-in" role="menu" aria-label={t('switchAccount')} style={{
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
                                        <button
                                            className="unstyled"
                                            role="menuitem"
                                            onClick={() => { setShowAccountSelector(false); setShowAddSession(true); }}
                                            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', width: '100%' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--select-active-bg)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <Plus size={14} />
                                            {t('loginAnotherAccount')}
                                        </button>
                                    </>
                                )}

                                <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }}></div>

                                {auth.mode === 'server' && auth.username !== 'admin' && (
                                    <button
                                        className="unstyled"
                                        role="menuitem"
                                        onClick={() => { setShowAccountSelector(false); setShowChangePassword(true); }}
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <Key size={14} />
                                        {t('changePassword')}
                                    </button>
                                )}

                                {auth.mode === 'server' && window.PublicKeyCredential && (
                                    <button
                                        className="unstyled"
                                        role="menuitem"
                                        onClick={() => { setShowAccountSelector(false); setShowPasskeyModal(true); }}
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <Fingerprint size={14} />
                                        {t('passkeyManage')}
                                    </button>
                                )}

                                {auth.mode === 'server' && (
                                    <button
                                        className="unstyled"
                                        role="menuitem"
                                        onClick={() => { setShowAccountSelector(false); setShowTotpModal(true); }}
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <Shield size={14} />
                                        {t('totpManage')}
                                    </button>
                                )}

                                <button
                                    className="unstyled"
                                    role="menuitem"
                                    onClick={handleLogout}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)', width: '100%' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <LogOut size={14} />
                                    {t('logout')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

            </header>

            {/* Extracted Modal Components */}
            <AddAccountModal show={showAddAccount} onClose={() => setShowAddAccount(false)} auth={auth} t={t} showToast={showToast} onAccountAdded={handleAccountAdded} />
            <AddSessionModal show={showAddSession} onClose={() => setShowAddSession(false)} auth={auth} t={t} showToast={showToast} onSessionAdded={handleSessionAdded} />
            <ChangePasswordModal show={showChangePassword} onClose={() => setShowChangePassword(false)} auth={auth} t={t} showToast={showToast} />
            <PasskeyModal show={showPasskeyModal} onClose={() => setShowPasskeyModal(false)} auth={auth} t={t} showToast={showToast} />
            <TotpModal show={showTotpModal} onClose={() => setShowTotpModal(false)} auth={auth} t={t} showToast={showToast} />
            <BulkOperationsModal show={showBulkModal} onClose={() => setShowBulkModal(false)} auth={auth} t={t} showToast={showToast} zones={zones} />
            <UserManagement show={showUserManagement} onClose={() => setShowUserManagement(false)} auth={auth} t={t} showToast={showToast} />

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
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => selectZone(z, auth)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectZone(z, auth); } }}
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
        </Suspense>
    );
};

export default App;
