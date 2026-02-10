export interface AuthState {
    mode: 'server' | 'client';
    token: string;
    refreshToken?: string | null;
    username?: string;
    role?: string;
    accounts?: Account[];
    currentAccountIndex?: number;
    sessions?: Session[];
    activeSessionIndex?: number;
    remember?: boolean;
    _localToken?: string | null;
}

export interface Account {
    id: number;
    name: string;
}

export interface Session {
    token: string;
    username: string;
    role: string;
    accounts: Account[];
}

export interface Zone {
    id: string;
    name: string;
    status: string;
    modified_on: string;
    _localKey?: string;
    _sessionIdx?: number;
    _accountIdx?: number;
    _owner?: string;
}

export interface DnsRecord {
    id: string;
    type: string;
    name: string;
    content: string;
    ttl: number;
    proxied?: boolean;
    priority?: number;
    data?: Record<string, unknown>;
}

export interface Toast {
    message: string;
    type: 'success' | 'error';
    id: number;
}

export type TranslateFn = (key: string) => string;
