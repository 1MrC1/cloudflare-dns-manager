import type { AuthState } from '../types';

export const getAuthHeaders = (auth: AuthState | null, withType = false): Record<string, string> => {
    if (!auth) return {};

    // If a local token is set on auth (local mode), use it directly
    if (auth._localToken) {
        const h: Record<string, string> = { 'X-Cloudflare-Token': auth._localToken };
        if (withType) h['Content-Type'] = 'application/json';
        return h;
    }

    const h: Record<string, string> = auth.mode === 'server'
        ? {
            'Authorization': `Bearer ${auth.token}`,
            'X-Managed-Account-Index': String(auth.currentAccountIndex || 0)
        }
        : auth.email
            ? { 'X-Cloudflare-Token': auth.token, 'X-Cloudflare-Email': auth.email }
            : { 'X-Cloudflare-Token': auth.token };
    if (withType) h['Content-Type'] = 'application/json';
    return h;
};

export const hashPassword = async (pwd: string): Promise<string> => {
    const msgUint8 = new TextEncoder().encode(pwd);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const isPasswordStrong = (pwd: string): boolean => pwd.length >= 8 && /[a-zA-Z]/.test(pwd) && /[0-9]/.test(pwd);
