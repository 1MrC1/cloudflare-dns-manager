import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Server, User, Shield, Key, LogOut, Plus, Trash2, RefreshCw, Zap, Languages, CheckCircle, AlertCircle, X, ChevronDown, Settings, Save, Fingerprint, Moon, Sun, Search, Upload, Globe, Layers, Keyboard, WifiOff, Activity, Menu, BarChart3, Database, FileText, ShieldAlert, Wifi, Eye, Code, ArrowRightLeft, BarChart2, Repeat, Mail, FileWarning, Copy } from 'lucide-react';
import useTranslate from './hooks/useTranslate.ts';
import { getAuthHeaders } from './utils/auth.ts';
import SecurityBadges from './components/SecurityBadges.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';

const Login = React.lazy(() => import('./components/Login.jsx'));
const ZoneDetail = React.lazy(() => import('./components/ZoneDetail.jsx'));
const AddAccountModal = React.lazy(() => import('./components/AddAccountModal.jsx'));
const AddSessionModal = React.lazy(() => import('./components/AddSessionModal.jsx'));
const ChangePasswordModal = React.lazy(() => import('./components/ChangePasswordModal.jsx'));
const PasskeyModal = React.lazy(() => import('./components/PasskeyModal.jsx'));
const TotpModal = React.lazy(() => import('./components/TotpModal.jsx'));
const BulkOperationsModal = React.lazy(() => import('./components/BulkOperationsModal.jsx'));
const UserManagement = React.lazy(() => import('./components/UserManagement.jsx'));
const Dashboard = React.lazy(() => import('./components/Dashboard.jsx'));
const OnboardingTour = React.lazy(() => import('./components/OnboardingTour.jsx'));
const MonitorsModal = React.lazy(() => import('./components/MonitorsModal.jsx'));

const App = () => {
    const { t, lang, changeLang, toggleLang } = useTranslate();
    const [auth, setAuth] = useState(null);
    const [showAccountSelector, setShowAccountSelector] = useState(false);
    const accountSelectorRef = useRef(null);
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toasts, setToasts] = useState([]);
    const toastIdCounter = useRef(0);
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
    const authRef = useRef(null);
    const zoneFetchCache = useRef(new Map());
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [dnsRecordCounts, setDnsRecordCounts] = useState(() => {
        try { return JSON.parse(localStorage.getItem('dns_record_counts') || '{}'); } catch { return {}; }
    });
    const [sidebarOpen, setSidebarOpen] = useState(false);
    // Hash-based routing: /#/zone/{name}/{tab} or /#/overview
    const parseHash = () => {
        const hash = window.location.hash.replace(/^#\/?/, '');
        const parts = hash.split('/');
        if (parts[0] === 'zone' && parts[1]) {
            return { zoneName: decodeURIComponent(parts[1]), tab: parts[2] || 'dns' };
        }
        return { zoneName: null, tab: parts[0] || 'overview' };
    };
    const initialRoute = parseHash();
    const [activeTab, setActiveTab] = useState(initialRoute.tab || 'overview');
    const pendingRouteRef = useRef(initialRoute.zoneName ? initialRoute : null);
    const suppressHashUpdate = useRef(false);
    const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);
    const [zoneSearchFilter, setZoneSearchFilter] = useState('');
    const zoneDropdownRef = useRef(null);

    // Modal visibility toggles
    const [showAddAccount, setShowAddAccount] = useState(false);
    const [showAddSession, setShowAddSession] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [showPasskeyModal, setShowPasskeyModal] = useState(false);
    const [showTotpModal, setShowTotpModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [showUserManagement, setShowUserManagement] = useState(false);
    const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
    const [showMonitorsModal, setShowMonitorsModal] = useState(false);
    const [failedMonitorCount, setFailedMonitorCount] = useState(0);
    const zoneDetailRef = useRef(null);
    const searchInputRef = useRef(null);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        localStorage.setItem('darkMode', String(darkMode));
    }, [darkMode]);

    // Lock body scroll when mobile sidebar open
    useEffect(() => {
        if (sidebarOpen && window.innerWidth <= 768) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
        return () => document.body.classList.remove('modal-open');
    }, [sidebarOpen]);

    // Click-outside handler for zone dropdown
    useEffect(() => {
        if (!zoneDropdownOpen) return;
        function handleClickOutside(e) {
            if (zoneDropdownRef.current && !zoneDropdownRef.current.contains(e.target)) {
                setZoneDropdownOpen(false);
                setZoneSearchFilter('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [zoneDropdownOpen]);

    const MAX_TOASTS = 3;
    const dismissToast = (id) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 300);
    };
    const showToast = (message, type = 'success') => {
        const id = ++toastIdCounter.current;
        const toast = { message, type, id, createdAt: Date.now(), exiting: false };
        setToasts(prev => {
            const next = [toast, ...prev];
            if (next.length > MAX_TOASTS) {
                return next.slice(0, MAX_TOASTS);
            }
            return next;
        });
        setTimeout(() => dismissToast(id), 3000);
    };

    const persistAuth = (authData) => {
        const storage = authData.remember ? localStorage : sessionStorage;
        storage.setItem('auth_session', JSON.stringify(authData));
    };

    const tryRefreshToken = async (authData, signal) => {
        try {
            const res = await fetch('/api/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: authData.refreshToken }),
                signal
            });
            if (res.ok) {
                const data = await res.json();
                const freshAccounts = (data.accounts && data.accounts.length > 0) ? data.accounts : null;
                const sessions = (authData.sessions || []).map((s, i) =>
                    i === (authData.activeSessionIndex || 0)
                        ? { ...s, token: data.token, ...(freshAccounts ? { accounts: freshAccounts } : {}) }
                        : s
                );
                return { ...authData, token: data.token, refreshToken: data.refreshToken || authData.refreshToken, sessions, ...(freshAccounts ? { accounts: freshAccounts } : {}) };
            }
        } catch (e) {
            if (e.name !== 'AbortError') console.error('Token refresh failed:', e);
        }
        return null;
    };

    // Fetch wrapper that auto-injects auth headers and refreshes JWT on 401
    const authFetch = async (url, options = {}) => {
        const currentAuth = authRef.current;
        if (!currentAuth) return fetch(url, options);

        const withType = !!(options.body && !options.headers?.['Content-Type'] && typeof options.body === 'string');
        const mergedHeaders = { ...getAuthHeaders(currentAuth, withType), ...options.headers };
        const res = await fetch(url, { ...options, headers: mergedHeaders });

        if (res.status === 401 && currentAuth.mode === 'server' && currentAuth.refreshToken) {
            const refreshed = await tryRefreshToken(currentAuth);
            if (refreshed) {
                setAuth(refreshed);
                persistAuth(refreshed);
                const retryHeaders = { ...getAuthHeaders(refreshed, withType), ...options.headers };
                return fetch(url, { ...options, headers: retryHeaders });
            }
        }
        return res;
    };

    const handleLogout = () => {
        if (auth && auth.mode === 'server' && auth.token) {
            fetch('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
                body: JSON.stringify({ refreshToken: auth.refreshToken })
            }).catch(() => {});
        }
        if (refreshAbortController.current) {
            refreshAbortController.current.abort();
            refreshAbortController.current = null;
        }
        setAuth(null);
        setZones([]);
        setSelectedZone(null);
        localStorage.removeItem('auth_session');
        sessionStorage.removeItem('auth_session');
    };

    // Keep authRef in sync so timers/callbacks always see fresh auth
    useEffect(() => { authRef.current = auth; }, [auth]);

    // Sync URL hash when zone/tab changes
    useEffect(() => {
        if (suppressHashUpdate.current) { suppressHashUpdate.current = false; return; }
        let newHash;
        if (selectedZone) {
            newHash = `#/zone/${encodeURIComponent(selectedZone.name)}/${activeTab}`;
        } else {
            newHash = activeTab && activeTab !== 'overview' ? `#/${activeTab}` : '#/';
        }
        if (window.location.hash !== newHash) {
            window.history.pushState(null, '', newHash);
        }
    }, [selectedZone?.id, activeTab]);

    // Handle browser back/forward
    useEffect(() => {
        const handlePopState = () => {
            suppressHashUpdate.current = true;
            const route = parseHash();
            if (route.zoneName) {
                const match = zones.find(z => z.name === route.zoneName);
                if (match) {
                    if (!selectedZone || selectedZone.id !== match.id) selectZone(match, authRef.current || auth);
                    setActiveTab(route.tab || 'dns');
                }
            } else {
                setActiveTab(route.tab || 'overview');
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [zones, selectedZone, auth]);

    // Online/offline detection
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

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

    // Global keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            const tag = e.target.tagName;
            const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

            if (e.key === 'Escape') {
                if (zoneDropdownOpen) { setZoneDropdownOpen(false); setZoneSearchFilter(''); return; }
                if (sidebarOpen) { setSidebarOpen(false); return; }
                if (showShortcutsHelp) { setShowShortcutsHelp(false); return; }
                if (showMonitorsModal) { setShowMonitorsModal(false); return; }
                if (showAddAccount) { setShowAddAccount(false); return; }
                if (showAddSession) { setShowAddSession(false); return; }
                if (showChangePassword) { setShowChangePassword(false); return; }
                if (showPasskeyModal) { setShowPasskeyModal(false); return; }
                if (showTotpModal) { setShowTotpModal(false); return; }
                if (showBulkModal) { setShowBulkModal(false); return; }
                if (showUserManagement) { setShowUserManagement(false); return; }
                if (showAccountSelector) { setShowAccountSelector(false); return; }
                if (searchResults !== null) { setSearchResults(null); return; }
                return;
            }

            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (searchInputRef.current) searchInputRef.current.focus();
                return;
            }

            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault();
                if (selectedZone && zoneDetailRef.current) zoneDetailRef.current.openAddRecord();
                return;
            }

            if (e.key === '?' && !isInputFocused) {
                e.preventDefault();
                setShowShortcutsHelp(prev => !prev);
                return;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showShortcutsHelp, showMonitorsModal, showAddAccount, showAddSession, showChangePassword, showPasskeyModal, showTotpModal, showBulkModal, showUserManagement, showAccountSelector, searchResults, selectedZone]);

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
                const currentAuth = authRef.current;
                const updated = await tryRefreshToken(currentAuth, abortController.signal);
                if (abortController.signal.aborted) return;
                if (updated) {
                    setAuth(updated);
                    persistAuth(updated);
                } else {
                    doLogout();
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

    // Fetch failed monitor count for badge (server mode only)
    useEffect(() => {
        if (!auth || auth.mode !== 'server') {
            setFailedMonitorCount(0);
            return;
        }
        const fetchMonitorCount = async () => {
            try {
                const res = await fetch('/api/monitors', {
                    headers: { 'Authorization': `Bearer ${auth.token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const monitors = data.monitors || [];
                    setFailedMonitorCount(monitors.filter(m => m.lastStatus === 'fail').length);
                }
            } catch {
                // ignore
            }
        };
        fetchMonitorCount();
        const interval = setInterval(fetchMonitorCount, 60000);
        return () => clearInterval(interval);
    }, [auth?.token, auth?.mode]);

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

        // Helper: fetch zones and extract result + authType from response
        let got401 = false;
        let gotError = null;
        const fetchZonesApi = (headers) => fetch('/api/zones', { headers }).then(async res => {
            if (res.ok) {
                const data = await res.json();
                return { zones: data.result || [], authType: data._authType || 'api_token' };
            }
            if (res.status === 401) got401 = true;
            else if (!gotError) gotError = res.status;
            return { zones: [], authType: 'api_token' };
        }).catch((e) => {
            if (!gotError) gotError = e.message || 'Network error';
            return { zones: [], authType: 'api_token' };
        });

        if (globalLocal && authData.mode === 'server') {
            // Local mode: only use tokens from localStorage
            const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
            const keys = Object.keys(localTokens);
            for (const key of keys) {
                const token = localTokens[key];
                const cacheKey = `local:${token}`;
                if (!batchCache.has(cacheKey)) {
                    batchCache.set(cacheKey, fetchZonesApi({ 'X-Cloudflare-Token': token }));
                }
                promises.push(batchCache.get(cacheKey).then(({ zones, authType }) =>
                    zones.map(z => ({ ...z, _localKey: key, _owner: key, _accountType: authType, _accountName: key, _tokenHint: '…' + token.slice(-4) }))
                ));
            }
        } else {
            // Server mode: use JWT + managed accounts
            const sessions = authData.sessions || [{ token: authData.token, username: authData.username, role: authData.role, accounts: authData.accounts || [] }];
            for (let si = 0; si < sessions.length; si++) {
                const session = sessions[si];
                const accounts = session.accounts || [];
                const sessionPromises = [];
                if (accounts.length === 0) {
                    const cacheKey = `session:${session.token}:0`;
                    if (!batchCache.has(cacheKey)) {
                        batchCache.set(cacheKey, fetchZonesApi({ 'Authorization': `Bearer ${session.token}`, 'X-Managed-Account-Index': '0' }));
                    }
                    sessionPromises.push(
                        batchCache.get(cacheKey).then(({ zones, authType }) =>
                            zones.map(z => ({ ...z, _sessionIdx: si, _accountIdx: 0, _owner: session.username, _accountType: authType, _accountName: authData.email || session.username || 'Default', _tokenHint: '' }))
                        )
                    );
                } else {
                    for (const acc of accounts) {
                        const cacheKey = `session:${session.token}:${acc.id}`;
                        if (!batchCache.has(cacheKey)) {
                            batchCache.set(cacheKey, fetchZonesApi({ 'Authorization': `Bearer ${session.token}`, 'X-Managed-Account-Index': String(acc.id) }));
                        }
                        sessionPromises.push(
                            batchCache.get(cacheKey).then(({ zones, authType }) =>
                                zones.map(z => ({ ...z, _sessionIdx: si, _accountIdx: acc.id, _owner: session.username, _accountType: acc.type || authType, _accountName: acc.name || `Account ${acc.id}`, _tokenHint: acc.hint || '' }))
                            )
                        );
                    }
                }
                promises.push(Promise.all(sessionPromises).then(results => results.flat()));
            }
        }

        const results = await Promise.all(promises);
        for (const zones of results) allZones.push(...zones);

        // If all server-mode fetches got 401 and no zones, session is expired — auto-logout
        if (got401 && allZones.length === 0 && authData.mode === 'server') {
            if (authData.refreshToken) {
                const refreshed = await tryRefreshToken(authData);
                if (refreshed) {
                    setAuth(refreshed);
                    persistAuth(refreshed);
                    setLoading(false);
                    return fetchZones(refreshed);
                }
            }
            showToast(t('sessionExpired'), 'error');
            setLoading(false);
            doLogout();
            return;
        }

        // Show toast for non-401 errors when no zones loaded
        if (gotError && allZones.length === 0) {
            showToast(typeof gotError === 'number' ? `${t('errorOccurred')} (HTTP ${gotError})` : gotError, 'error');
        }

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

        // Filter out hidden (unbound) zones
        const hiddenZones = JSON.parse(localStorage.getItem('hidden_zones') || '[]');
        const visibleZones = hiddenZones.length > 0 ? uniqueZones.filter(z => !hiddenZones.includes(z.id)) : uniqueZones;

        const sortedZones = visibleZones.sort((a, b) => new Date(b.modified_on) - new Date(a.modified_on));
        setZones(sortedZones);

        // Fetch DNS record counts from server (fire-and-forget)
        if (sortedZones.length > 0 && authData.mode === 'server') {
            authFetch('/api/dns-counts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ zoneIds: sortedZones.map(z => z.id) })
            }).then(r => r.json()).then(data => {
                if (data.success && data.counts) {
                    setDnsRecordCounts(prev => {
                        const merged = { ...prev, ...data.counts };
                        try { localStorage.setItem('dns_record_counts', JSON.stringify(merged)); } catch {}
                        return merged;
                    });
                }
            }).catch(() => {});
        }

        if (sortedZones.length > 0) {
            // Check for pending route from URL hash
            const pending = pendingRouteRef.current;
            if (pending && pending.zoneName) {
                const match = sortedZones.find(z => z.name === pending.zoneName);
                pendingRouteRef.current = null;
                if (match) {
                    selectZone(match, authData);
                    setActiveTab(pending.tab || 'dns');
                } else {
                    selectZone(sortedZones[0], authData);
                }
            } else if (selectedZone) {
                const stillExists = sortedZones.find(z => z.id === selectedZone.id && z._owner === selectedZone._owner);
                if (stillExists) {
                    selectZone(stillExists, authData);
                } else {
                    selectZone(sortedZones[0], authData);
                }
            } else {
                // No pending route and no selected zone — check current hash
                const route = parseHash();
                if (route.zoneName) {
                    const match = sortedZones.find(z => z.name === route.zoneName);
                    if (match) {
                        selectZone(match, authData);
                        setActiveTab(route.tab || 'dns');
                    } else {
                        selectZone(sortedZones[0], authData);
                    }
                } else {
                    selectZone(sortedZones[0], authData);
                }
            }
        } else {
            setSelectedZone(null);
        }
        setLoading(false);
    };

    useEffect(() => {
        const saved = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session');
        if (saved) {
            try {
                const credentials = JSON.parse(saved);
                // If we have a refresh token, refresh immediately to get a fresh access token
                if (credentials.refreshToken && credentials.mode === 'server') {
                    tryRefreshToken(credentials).then(async (updated) => {
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

    // Wrap the context handleLogout to also clear local zone state
    const doLogout = () => {
        handleLogout();
        setZones([]);
        setSelectedZone(null);
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

    const [confirmGroupDelete, setConfirmGroupDelete] = useState(null);

    const handleUnbindZone = (zoneId) => {
        const hidden = JSON.parse(localStorage.getItem('hidden_zones') || '[]');
        if (!hidden.includes(zoneId)) {
            hidden.push(zoneId);
            localStorage.setItem('hidden_zones', JSON.stringify(hidden));
        }
        // Remove from current zones list and deselect
        const remaining = zones.filter(z => z.id !== zoneId);
        setZones(remaining);
        if (selectedZone?.id === zoneId) {
            setSelectedZone(remaining.length > 0 ? remaining[0] : null);
            if (remaining.length > 0) selectZone(remaining[0], auth);
        }
        showToast(t('zoneUnbound'), 'success');
    };

    const handleUnbindZoneFromDropdown = (e, zoneId) => {
        e.stopPropagation();
        if (!confirm(t('unbindZoneConfirmShort'))) return;
        handleUnbindZone(zoneId);
    };

    const handleDeleteGroup = async (group) => {
        setConfirmGroupDelete(null);
        setZoneDropdownOpen(false);
        if (group.localKey) {
            // Local token: remove from localStorage
            const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
            delete localTokens[group.localKey];
            localStorage.setItem('local_cf_tokens', JSON.stringify(localTokens));
            if (selectedZone && selectedZone._localKey === group.localKey) setSelectedZone(null);
            showToast(t('localTokenRemoved'), 'success');
            fetchZones(auth);
        } else if (group.sessionIdx != null && group.accountIdx != null) {
            // Server account: delete from server
            try {
                const freshAuth = await ensureFreshAuth();
                const adminHeaders = { 'Authorization': `Bearer ${freshAuth.token}`, 'Content-Type': 'application/json' };
                const res = await fetch(`/api/admin/settings?index=${group.accountIdx}`, {
                    method: 'DELETE', headers: adminHeaders
                });
                if (res.ok) {
                    showToast(t('accountRemoved'), 'success');
                    const newAuth = await refreshAuthAccounts(freshAuth);
                    if (selectedZone && selectedZone._sessionIdx === group.sessionIdx && selectedZone._accountIdx === group.accountIdx) {
                        setSelectedZone(null);
                    }
                    fetchZones(newAuth);
                } else {
                    showToast(t('errorOccurred'), 'error');
                }
            } catch (err) {
                console.error('Failed to delete group:', err);
                showToast(t('errorOccurred'), 'error');
            }
        }
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
            doLogout();
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
        <AuthProvider auth={auth} setAuth={setAuth}>
        <ToastProvider showToast={showToast}>
        <ThemeProvider t={t} lang={lang} changeLang={changeLang} toggleLang={toggleLang} darkMode={darkMode} setDarkMode={setDarkMode}>
        <Suspense fallback={<div className="lazy-loading" />}>
        <div className="fade-in">
            {isOffline && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 10000,
                    background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                    color: '#fff',
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}>
                    <WifiOff size={16} />
                    <span>{t('offlineMessage')}</span>
                </div>
            )}
            {/* Toast Stack */}
            {toasts.length > 0 && (
                <div className="toast-stack" aria-live="polite" role="status">
                    {toasts.map((toastItem) => (
                        <div key={toastItem.id} className={`toast-item ${toastItem.exiting ? 'toast-exit' : 'toast-enter'}`} style={{
                            color: toastItem.type === 'success' ? 'var(--text)' : 'var(--error)',
                        }}>
                            {toastItem.type === 'success' ? <CheckCircle size={18} color="var(--success)" /> : <AlertCircle size={18} color="var(--error)" />}
                            <span style={{ fontSize: '0.875rem', fontWeight: '600', whiteSpace: 'nowrap', flex: 1 }}>{toastItem.message}</span>
                            <button onClick={() => dismissToast(toastItem.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', marginLeft: '4px', flexShrink: 0 }} aria-label="Close notification">
                                <X size={14} color="var(--text-muted)" />
                            </button>
                            <div className="toast-progress" style={{ animationDuration: '3s' }} />
                        </div>
                    ))}
                </div>
            )}

            {/* Keyboard Shortcuts Help Modal */}
            {showShortcutsHelp && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'var(--modal-overlay)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn 0.2s ease-out'
                }} onClick={() => setShowShortcutsHelp(false)}>
                    <div className="glass-card fade-in" style={{
                        width: '380px', maxWidth: '90vw', padding: '1.5rem',
                        position: 'relative'
                    }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Keyboard size={18} color="var(--primary)" />
                                {t('keyboardShortcuts')}
                            </h3>
                            <button onClick={() => setShowShortcutsHelp(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }} aria-label="Close">
                                <X size={16} color="var(--text-muted)" />
                            </button>
                        </div>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>{t('shortcutGeneral')}</p>
                        {[
                            { keys: ['Ctrl', 'K'], altKeys: ['\u2318', 'K'], label: t('shortcutFocusSearch') },
                            { keys: ['Ctrl', 'N'], altKeys: ['\u2318', 'N'], label: t('shortcutNewRecord') },
                            { keys: ['Esc'], label: t('shortcutCloseModal') },
                            { keys: ['?'], label: t('shortcutShowHelp') },
                        ].map((shortcut, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '0.5rem 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none'
                            }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>{shortcut.label}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {shortcut.keys.map((key, ki) => (
                                        <React.Fragment key={ki}>
                                            {ki > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>+</span>}
                                            <kbd style={{
                                                display: 'inline-block', padding: '2px 6px',
                                                fontSize: '0.7rem', fontFamily: 'inherit', fontWeight: 600,
                                                background: 'var(--hover-bg)', border: '1px solid var(--border)',
                                                borderRadius: '4px', color: 'var(--text-muted)',
                                                minWidth: '22px', textAlign: 'center',
                                                boxShadow: '0 1px 0 var(--border)'
                                            }}>{key}</kbd>
                                        </React.Fragment>
                                    ))}
                                    {shortcut.altKeys && (
                                        <>
                                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', margin: '0 2px' }}>{t('shortcutOr')}</span>
                                            {shortcut.altKeys.map((key, ki) => (
                                                <React.Fragment key={ki}>
                                                    {ki > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>+</span>}
                                                    <kbd style={{
                                                        display: 'inline-block', padding: '2px 6px',
                                                        fontSize: '0.7rem', fontFamily: 'inherit', fontWeight: 600,
                                                        background: 'var(--hover-bg)', border: '1px solid var(--border)',
                                                        borderRadius: '4px', color: 'var(--text-muted)',
                                                        minWidth: '22px', textAlign: 'center',
                                                        boxShadow: '0 1px 0 var(--border)'
                                                    }}>{key}</kbd>
                                                </React.Fragment>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <header>
                <button className="sidebar-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={t('toggleSidebar')}>
                    <Menu size={20} />
                </button>
                <button className="unstyled logo" onClick={() => window.location.reload()} aria-label="DNS Manager - Reload">
                    <Zap size={22} color="var(--primary)" />
                    DNS <span>Manager</span>
                </button>

                <div className="header-right" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {/* Search — desktop only */}
                    {auth.mode === 'server' && (
                        <div ref={searchRef} className="header-search-box" style={{ position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--hover-bg)', borderRadius: '8px', padding: '2px 8px', border: '1px solid var(--border)' }}>
                                <Search size={14} color="var(--text-muted)" />
                                <input
                                    ref={searchInputRef}
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

                    {/* Monitors — keep visible (has alert badge) */}
                    {auth.mode === 'server' && (
                        <button
                            onClick={() => setShowMonitorsModal(true)}
                            style={{ border: 'none', background: 'transparent', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--text-muted)', borderRadius: '8px', transition: 'all 0.2s', position: 'relative' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-btn-bg)'; e.currentTarget.style.color = 'var(--primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                            title={t('monitors')}
                            aria-label={t('monitors')}
                        >
                            <Activity size={18} />
                            {failedMonitorCount > 0 && (
                                <span style={{
                                    position: 'absolute', top: '2px', right: '0px',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.55rem', fontWeight: 700, minWidth: '14px', height: '14px',
                                    padding: '0 3px', borderRadius: '7px',
                                    background: 'var(--error)', color: '#fff',
                                    lineHeight: 1
                                }}>
                                    {failedMonitorCount}
                                </span>
                            )}
                        </button>
                    )}

                    {/* Dark mode toggle */}
                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        style={{ border: 'none', background: 'transparent', padding: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)', borderRadius: '8px', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--hover-btn-bg)';
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

                    {/* Account menu — contains all other actions */}
                    <div style={{ position: 'relative' }} ref={accountSelectorRef}>
                        <button
                            onClick={() => setShowAccountSelector(!showAccountSelector)}
                            style={{ border: 'none', background: showAccountSelector ? 'var(--hover-btn-bg)' : 'transparent', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', borderRadius: '8px', transition: 'background 0.2s', fontSize: '0.8rem' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-btn-bg)'}
                            onMouseLeave={(e) => { if (!showAccountSelector) e.currentTarget.style.background = 'transparent'; }}
                            title={t('switchAccount')}
                            aria-label={t('switchAccount')}
                            aria-expanded={showAccountSelector}
                            aria-haspopup="true"
                        >
                            <User size={16} />
                            <span className="hide-mobile" style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{auth.username || 'admin'}</span>
                            <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: showAccountSelector ? 'rotate(180deg)' : 'none' }} />
                        </button>
                        {showAccountSelector && (
                            <div className="glass-card fade-in" role="menu" aria-label={t('switchAccount')} style={{
                                position: 'absolute',
                                top: '120%',
                                right: 0,
                                width: '240px',
                                padding: '0.25rem',
                                zIndex: 100,
                                maxHeight: '80vh',
                                overflowY: 'auto'
                            }}>
                                {/* Sessions */}
                                {auth.mode === 'server' && (auth.sessions || []).map((session, si) => (
                                    <div key={session.username} style={{
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '6px',
                                        fontSize: '0.8125rem',
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
                                            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', width: '100%' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--select-active-bg)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <Plus size={14} />
                                            {t('loginAnotherAccount')}
                                        </button>
                                    </>
                                )}

                                <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }}></div>

                                {/* Tools & Settings — moved from header */}
                                <button
                                    className="unstyled"
                                    role="menuitem"
                                    onClick={() => { setShowAccountSelector(false); toggleLang(); }}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Languages size={14} />
                                    {{ zh: 'English', en: '日本語', ja: '한국어', ko: '中文' }[lang]}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{lang.toUpperCase()}</span>
                                </button>

                                <button
                                    className="unstyled"
                                    role="menuitem"
                                    onClick={() => { setShowAccountSelector(false); setShowShortcutsHelp(true); }}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Keyboard size={14} />
                                    {t('keyboardShortcuts')}
                                </button>

                                {auth.mode === 'server' && (
                                    <button
                                        className="unstyled"
                                        role="menuitem"
                                        onClick={() => { setShowAccountSelector(false); handleToggleStorage(); }}
                                        disabled={storageToggleLoading}
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px', color: isLocalMode ? 'var(--primary)' : 'var(--text)', width: '100%' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        {storageToggleLoading ? <RefreshCw className="spin" size={14} /> : <Server size={14} />}
                                        {isLocalMode ? t('storageLocal') : t('storageServer')}
                                        <span style={{ marginLeft: 'auto', fontSize: '0.6rem', padding: '1px 6px', borderRadius: '9999px', background: isLocalMode ? 'var(--select-active-bg)' : 'var(--hover-bg)', color: isLocalMode ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                                            {isLocalMode ? 'LOCAL' : 'SERVER'}
                                        </span>
                                    </button>
                                )}

                                {auth.mode === 'server' && !isLocalMode && (
                                    <button
                                        className="unstyled"
                                        role="menuitem"
                                        onClick={() => { setShowAccountSelector(false); setShowBulkModal(true); }}
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <Layers size={14} />
                                        {t('bulkOperations')}
                                    </button>
                                )}

                                {auth.role === 'admin' && (
                                    <button
                                        className="unstyled"
                                        role="menuitem"
                                        onClick={() => { setShowAccountSelector(false); setShowUserManagement(true); }}
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <Settings size={14} />
                                        {t('usersManagement')}
                                    </button>
                                )}

                                <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }}></div>

                                {/* Security */}
                                {auth.mode === 'server' && auth.username !== 'admin' && (
                                    <button
                                        className="unstyled"
                                        role="menuitem"
                                        onClick={() => { setShowAccountSelector(false); setShowChangePassword(true); }}
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
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
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
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
                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', width: '100%' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <Shield size={14} />
                                        {t('totpManage')}
                                    </button>
                                )}

                                <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }}></div>

                                <button
                                    className="unstyled"
                                    role="menuitem"
                                    onClick={doLogout}
                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)', width: '100%' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--error-bg)'}
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
            <ErrorBoundary t={t}>
                <AddAccountModal show={showAddAccount} onClose={() => setShowAddAccount(false)} auth={auth} t={t} showToast={showToast} onAccountAdded={handleAccountAdded} />
                <AddSessionModal show={showAddSession} onClose={() => setShowAddSession(false)} auth={auth} t={t} showToast={showToast} onSessionAdded={handleSessionAdded} />
                <ChangePasswordModal show={showChangePassword} onClose={() => setShowChangePassword(false)} auth={auth} t={t} showToast={showToast} />
                <PasskeyModal show={showPasskeyModal} onClose={() => setShowPasskeyModal(false)} auth={auth} t={t} showToast={showToast} />
                <TotpModal show={showTotpModal} onClose={() => setShowTotpModal(false)} auth={auth} t={t} showToast={showToast} />
                <BulkOperationsModal show={showBulkModal} onClose={() => setShowBulkModal(false)} auth={auth} authFetch={authFetch} t={t} showToast={showToast} zones={zones} />
                <MonitorsModal show={showMonitorsModal} onClose={() => setShowMonitorsModal(false)} zones={zones} />
                <UserManagement show={showUserManagement} onClose={() => setShowUserManagement(false)} auth={auth} t={t} showToast={showToast} />
            </ErrorBoundary>

            <a href="#main-content" className="skip-link">{t('skipToContent') || 'Skip to content'}</a>
            <div className="app-layout" id="main-content">
                {/* Sidebar */}
                <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
                    <div className="sidebar-header">
                        <span className="sidebar-header-title">{t('yourDomains')}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                                className="sidebar-close"
                                style={{ display: 'flex', alignItems: 'center', padding: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: '6px' }}
                                onClick={() => fetchZones(auth)}
                                title={t('refresh')}
                            >
                                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                            </button>
                            <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label={t('toggleSidebar')}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Custom zone dropdown */}
                    <div className="sidebar-zone-selector" ref={zoneDropdownRef}>
                        <button
                            className={`zone-dropdown${zoneDropdownOpen ? ' open' : ''}`}
                            onClick={() => { setZoneDropdownOpen(!zoneDropdownOpen); setZoneSearchFilter(''); }}
                        >
                            <span className="zone-dropdown-dot" style={{ background: selectedZone ? 'var(--success)' : 'var(--text-muted)' }} />
                            <span className="zone-dropdown-name">{selectedZone ? selectedZone.name : t('selectZone')}</span>
                            <ChevronDown size={14} className="zone-dropdown-chevron" />
                        </button>
                        {zoneDropdownOpen && (
                            <div className="zone-dropdown-menu">
                                {zones.length > 5 && (
                                    <div className="zone-dropdown-search">
                                        <div style={{ position: 'relative' }}>
                                            <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                            <input
                                                type="text"
                                                placeholder={t('searchZones')}
                                                value={zoneSearchFilter}
                                                onChange={(e) => setZoneSearchFilter(e.target.value)}
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                    </div>
                                )}
                                {(() => {
                                    const filtered = zones.filter(z => !zoneSearchFilter || z.name.toLowerCase().includes(zoneSearchFilter.toLowerCase()));
                                    // Group zones by account credential
                                    const groups = [];
                                    const groupMap = new Map();
                                    for (const z of filtered) {
                                        const gk = `${z._sessionIdx ?? 'L'}_${z._accountIdx ?? z._localKey ?? 0}`;
                                        if (!groupMap.has(gk)) {
                                            // Resolve type from current auth state (safety net for stale zone data)
                                            let resolvedType = z._accountType;
                                            if (z._sessionIdx != null && auth.sessions?.[z._sessionIdx]?.accounts) {
                                                const acc = auth.sessions[z._sessionIdx].accounts.find(a => a.id === z._accountIdx);
                                                if (acc?.type) resolvedType = acc.type;
                                            }
                                            const group = { key: gk, type: resolvedType, name: z._accountName, tokenHint: z._tokenHint, sessionIdx: z._sessionIdx, accountIdx: z._accountIdx, localKey: z._localKey, zones: [] };
                                            groupMap.set(gk, group);
                                            groups.push(group);
                                        }
                                        groupMap.get(gk).zones.push(z);
                                    }
                                    const needsGrouping = groups.length > 1;
                                    return groups.map((group, gi) => (
                                        <React.Fragment key={group.key}>
                                            <div style={{
                                                padding: '0.35rem 0.75rem', fontSize: '0.65rem', fontWeight: 700,
                                                color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                borderTop: gi > 0 ? '1px solid var(--border)' : 'none',
                                                marginTop: gi > 0 ? '0.25rem' : 0,
                                                paddingTop: gi > 0 ? '0.5rem' : '0.35rem'
                                            }}>
                                                <span style={{
                                                    padding: '1px 5px', borderRadius: '3px', fontSize: '0.6rem', fontWeight: 700,
                                                    background: group.type === 'global_key' ? 'rgba(139, 92, 246, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                                    color: group.type === 'global_key' ? '#7c3aed' : '#2563eb'
                                                }}>
                                                    {group.type === 'global_key' ? 'GK' : 'AT'}
                                                </span>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{group.name}</span>
                                                {group.tokenHint && (
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', opacity: 0.5, flexShrink: 0 }}>{group.tokenHint}</span>
                                                )}
                                                <span style={{ opacity: 0.5, flexShrink: 0 }}>{group.zones.length}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        (async () => {
                                                            try {
                                                                if (group.localKey) {
                                                                    const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
                                                                    const entry = localTokens[group.localKey];
                                                                    const val = typeof entry === 'string' ? entry : (entry?.token || entry?.key || '');
                                                                    if (val) { await navigator.clipboard.writeText(val); showToast(t('tokenCopied')); }
                                                                    else showToast(t('errorOccurred'), 'error');
                                                                } else {
                                                                    const session = auth.sessions?.[group.sessionIdx];
                                                                    if (!session) return;
                                                                    const res = await fetch(`/api/admin/settings?retrieve=${group.accountIdx}`, { headers: { 'Authorization': `Bearer ${session.token}` } });
                                                                    const data = await res.json();
                                                                    if (data.token) { await navigator.clipboard.writeText(data.token); showToast(t('tokenCopied')); }
                                                                    else showToast(data.error || t('errorOccurred'), 'error');
                                                                }
                                                            } catch { showToast(t('errorOccurred'), 'error'); }
                                                        })();
                                                    }}
                                                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)', borderRadius: '3px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                                    title={t('copyToken')}
                                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                                >
                                                    <Copy size={11} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setConfirmGroupDelete(group); }}
                                                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)', borderRadius: '3px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                                    title={t('deleteGroup')}
                                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                            {group.zones.map(z => (
                                                <div
                                                    key={`${z._owner}_${z.id}`}
                                                    className={`zone-dropdown-item${selectedZone?.id === z.id ? ' selected' : ''}`}
                                                    style={{ display: 'flex', alignItems: 'center' }}
                                                >
                                                    <button
                                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, border: 'none', background: 'none', cursor: 'pointer', padding: '0', color: 'inherit', font: 'inherit', textAlign: 'left' }}
                                                        onClick={() => {
                                                            selectZone(z, auth);
                                                            setZoneDropdownOpen(false);
                                                            setZoneSearchFilter('');
                                                            if (activeTab === 'overview') setActiveTab('dns');
                                                        }}
                                                    >
                                                        <span className="zone-dropdown-dot" style={{ background: 'var(--success)' }} />
                                                        <span className="zone-dropdown-item-name">{z.name}</span>
                                                        {dnsRecordCounts[z.id] != null && (
                                                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{dnsRecordCounts[z.id]}</span>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleUnbindZoneFromDropdown(e, z.id)}
                                                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-muted)', borderRadius: '3px', display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 'auto' }}
                                                        title={t('unbindZone')}
                                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </React.Fragment>
                                    ));
                                })()}
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <nav className="sidebar-nav" onKeyDown={(e) => {
                        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
                        e.preventDefault();
                        const items = Array.from(e.currentTarget.querySelectorAll('.sidebar-nav-item'));
                        const idx = items.indexOf(document.activeElement);
                        let next;
                        if (e.key === 'ArrowDown') next = items[(idx + 1) % items.length];
                        else if (e.key === 'ArrowUp') next = items[(idx - 1 + items.length) % items.length];
                        else if (e.key === 'Home') next = items[0];
                        else if (e.key === 'End') next = items[items.length - 1];
                        if (next) next.focus();
                    }}>
                        <button
                            className={`sidebar-nav-item${activeTab === 'overview' ? ' active' : ''}`}
                            onClick={() => { setActiveTab('overview'); setSidebarOpen(false); }}
                        >
                            <BarChart3 size={16} /> {t('overview')}
                        </button>

                        {selectedZone && (
                            <>
                                <div className="sidebar-separator" />
                                <button
                                    className={`sidebar-nav-item${activeTab === 'dns' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('dns'); setSidebarOpen(false); }}
                                >
                                    <Globe size={16} /> {t('dnsRecords')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'saas' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('saas'); setSidebarOpen(false); }}
                                >
                                    <Layers size={16} /> {t('saasHostnames')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'dnssettings' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('dnssettings'); setSidebarOpen(false); }}
                                >
                                    <Settings size={16} /> {t('dnsSettingsTab')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'dnsanalytics' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('dnsanalytics'); setSidebarOpen(false); }}
                                >
                                    <BarChart2 size={16} /> {t('dnsAnalyticsTab')}
                                </button>
                                {/* Performance */}
                                <div className="sidebar-separator" />
                                <span className="sidebar-section-label">{t('sidebarPerformance') || 'Performance'}</span>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'cache' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('cache'); setSidebarOpen(false); }}
                                >
                                    <Database size={16} /> {t('cacheTab')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'speed' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('speed'); setSidebarOpen(false); }}
                                >
                                    <Zap size={16} /> {t('speedTab')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'network' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('network'); setSidebarOpen(false); }}
                                >
                                    <Wifi size={16} /> {t('networkTab')}
                                </button>

                                {/* Security */}
                                <div className="sidebar-separator" />
                                <span className="sidebar-section-label">{t('sidebarSecurity') || 'Security'}</span>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'ssl' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('ssl'); setSidebarOpen(false); }}
                                >
                                    <Shield size={16} /> {t('sslTab')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'security' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('security'); setSidebarOpen(false); }}
                                >
                                    <ShieldAlert size={16} /> {t('securityTab')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'scrapeshield' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('scrapeshield'); setSidebarOpen(false); }}
                                >
                                    <Eye size={16} /> {t('scrapeShieldTab')}
                                </button>

                                {/* Configuration */}
                                <div className="sidebar-separator" />
                                <span className="sidebar-section-label">{t('sidebarConfig') || 'Configuration'}</span>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'pagerules' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('pagerules'); setSidebarOpen(false); }}
                                >
                                    <FileText size={16} /> {t('pageRulesTab')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'workers' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('workers'); setSidebarOpen(false); }}
                                >
                                    <Code size={16} /> {t('workersTab')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'rules' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('rules'); setSidebarOpen(false); }}
                                >
                                    <ArrowRightLeft size={16} /> {t('rulesTab')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'transform' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('transform'); setSidebarOpen(false); }}
                                >
                                    <Repeat size={16} /> {t('transformTab')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'origin' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('origin'); setSidebarOpen(false); }}
                                >
                                    <Server size={16} /> {t('originTab')}
                                </button>

                                {/* Email & Pages */}
                                <div className="sidebar-separator" />
                                <span className="sidebar-section-label">{t('sidebarEmail') || 'Email & Pages'}</span>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'email' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('email'); setSidebarOpen(false); }}
                                >
                                    <Mail size={16} /> {t('emailTab')}
                                </button>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'custompages' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('custompages'); setSidebarOpen(false); }}
                                >
                                    <FileWarning size={16} /> {t('customPagesTab')}
                                </button>

                                {/* Monitoring */}
                                <div className="sidebar-separator" />
                                <span className="sidebar-section-label">{t('sidebarMonitoring') || 'Monitoring'}</span>
                                <button
                                    className={`sidebar-nav-item${activeTab === 'analytics' ? ' active' : ''}`}
                                    onClick={() => { setActiveTab('analytics'); setSidebarOpen(false); }}
                                >
                                    <BarChart2 size={16} /> {t('analyticsTab')}
                                </button>
                            </>
                        )}
                    </nav>

                    <div className="sidebar-footer">
                        {auth.mode === 'server' && (
                            <button className="sidebar-footer-btn" onClick={() => { setSidebarOpen(false); setShowAddAccount(true); }}>
                                <Plus size={14} />
                                {t('addNewToken')}
                            </button>
                        )}
                        {auth.mode === 'server' && (
                            <button className="sidebar-footer-btn muted" onClick={() => { setSidebarOpen(false); setShowAddSession(true); }}>
                                <User size={14} />
                                {t('loginAnotherAccount')}
                            </button>
                        )}
                        <a
                            href="https://github.com/C-NF/cloudflare-dns-manager"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sidebar-footer-btn muted"
                            style={{ textDecoration: 'none', justifyContent: 'center', fontSize: '0.65rem', opacity: 0.5, marginTop: '0.25rem' }}
                        >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                            GitHub
                        </a>
                    </div>
                </aside>
                <div className={`sidebar-backdrop${sidebarOpen ? ' sidebar-backdrop--visible' : ''}`} onClick={() => setSidebarOpen(false)} />

                <div className="app-content">
            <main style={{ paddingBottom: '3rem' }}>
                {loading && zones.length === 0 ? (
                    <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '4rem' }}>
                        <RefreshCw className="spin" size={32} style={{ color: 'var(--primary)' }} />
                        <p style={{ color: 'var(--text-muted)' }}>{t('statusInitializing')}</p>
                    </div>
                ) : zones.length === 0 ? (
                    /* === NO ZONES === */
                    <div className="container" style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-muted)' }}>
                        <div className="glass-card fade-in" style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', padding: '0.75rem', background: 'var(--error-bg)', borderRadius: '12px', marginBottom: '1rem' }}>
                                <AlertCircle size={32} color="var(--error)" />
                            </div>
                            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>{t('noZonesFound')}</h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                {auth.mode === 'server' ? t('noZonesServerExplanation') : t('noZonesClientExplanation')}
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
                                <button className="btn btn-outline" onClick={doLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                    </div>
                ) : activeTab === 'overview' ? (
                    /* === OVERVIEW / DASHBOARD === */
                    <div className="container page-enter" key="overview" style={{ paddingBottom: 0 }}>
                        <ErrorBoundary t={t}>
                            <Dashboard zones={zones} dnsRecordCounts={dnsRecordCounts} />
                        </ErrorBoundary>
                    </div>
                ) : selectedZone ? (
                    /* === ZONE DETAIL (DNS/SaaS/Cache/Speed/SSL) === */
                    <div className="page-enter" key={`${selectedZone.id}-${activeTab}`}>
                    <ErrorBoundary t={t}>
                        <ZoneDetail
                            ref={zoneDetailRef}
                            zone={selectedZone}
                            auth={auth}
                            authFetch={authFetch}
                            tab={activeTab}
                            onBack={() => { }}
                            t={t}
                            showToast={showToast}
                            onToggleZoneStorage={auth.mode === 'server' ? handleToggleZoneStorage : null}
                            zoneStorageLoading={zoneStorageLoading}
                            onUnbindZone={handleUnbindZone}
                            onRefreshZones={() => fetchZones(auth)}
                            onDnsCountUpdate={(zoneId, count) => setDnsRecordCounts(prev => ({ ...prev, [zoneId]: count }))}
                        />
                    </ErrorBoundary>
                    </div>
                ) : (
                    /* === NO ZONE SELECTED but zones exist — prompt to select === */
                    <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
                        <div className="glass-card fade-in" style={{ maxWidth: '400px', margin: '0 auto', padding: '2rem' }}>
                            <Globe size={32} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                            <h3 style={{ marginBottom: '0.5rem' }}>{t('selectZone')}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('domainSubtitle')}</p>
                        </div>
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
                    Cloudflare DNS Manager &mdash; {{ zh: '您的数据安全是我们的首要任务', en: 'Your data security is our top priority', ja: 'お客様のデータセキュリティは最優先事項です', ko: '여러분의 데이터 보안은 최우선 과제입니다' }[lang]}
                </p>
                <a
                    href="https://github.com/C-NF/cloudflare-dns-manager"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.65rem', color: 'var(--text-muted)', textDecoration: 'none', opacity: 0.5, transition: 'opacity 0.2s', marginTop: '0.5rem' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                    GitHub
                </a>
            </footer>
                </div>{/* end app-content */}
            </div>{/* end app-layout */}

            {/* Group Delete Confirmation Modal */}
            {confirmGroupDelete && (
                <div className="modal-overlay" style={{ zIndex: 10000 }}
                    onClick={(e) => { if (e.target === e.currentTarget) setConfirmGroupDelete(null); }}>
                    <div className="glass-card fade-in modal-content" role="dialog" aria-label={t('deleteGroup')} style={{ padding: '2rem', maxWidth: '440px', width: '90%', textAlign: 'center' }}>
                        <div style={{ marginBottom: '1rem' }}>
                            <Trash2 size={28} color="var(--danger)" />
                        </div>
                        <h2 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>{t('deleteGroup')}</h2>
                        <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            <span style={{
                                padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                                background: confirmGroupDelete.type === 'global_key' ? 'rgba(139, 92, 246, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                color: confirmGroupDelete.type === 'global_key' ? '#7c3aed' : '#2563eb'
                            }}>
                                {confirmGroupDelete.type === 'global_key' ? 'GK' : 'AT'}
                            </span>
                            <span style={{ fontWeight: 600 }}>{confirmGroupDelete.name}</span>
                            {confirmGroupDelete.tokenHint && (
                                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{confirmGroupDelete.tokenHint}</span>
                            )}
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            {t('deleteGroupDesc').replace('{count}', confirmGroupDelete.zones.length)}
                        </p>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', maxHeight: '100px', overflowY: 'auto', textAlign: 'left', padding: '0.5rem', background: 'var(--bg)', borderRadius: '6px' }}>
                            {confirmGroupDelete.zones.map(z => (
                                <div key={z.id} style={{ padding: '2px 0' }}>{z.name}</div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setConfirmGroupDelete(null)}>{t('cancel')}</button>
                            <button
                                className="btn"
                                style={{ flex: 1, background: 'var(--danger)', borderColor: 'var(--danger)' }}
                                onClick={() => handleDeleteGroup(confirmGroupDelete)}
                            >
                                {t('deleteGroup')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Onboarding Tour */}
            <OnboardingTour t={t} />
        </div >
        </Suspense>
        </ThemeProvider>
        </ToastProvider>
        </AuthProvider>
    );
};

export default App;
