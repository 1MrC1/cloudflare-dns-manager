import { getAuthHeaders, hashPassword, isPasswordStrong } from '../../src/utils/auth';

describe('getAuthHeaders', () => {
    it('returns empty object for null auth', () => {
        expect(getAuthHeaders(null)).toEqual({});
    });

    it('returns X-Cloudflare-Token header with local token', () => {
        const auth = { _localToken: 'local-tok-123' };
        expect(getAuthHeaders(auth)).toEqual({
            'X-Cloudflare-Token': 'local-tok-123',
        });
    });

    it('returns Authorization and X-Managed-Account-Index for server mode', () => {
        const auth = { mode: 'server', token: 'srv-token', currentAccountIndex: 2 };
        expect(getAuthHeaders(auth)).toEqual({
            'Authorization': 'Bearer srv-token',
            'X-Managed-Account-Index': '2',
        });
    });

    it('returns X-Cloudflare-Token for client mode', () => {
        const auth = { mode: 'client', token: 'my-cf-token' };
        expect(getAuthHeaders(auth)).toEqual({
            'X-Cloudflare-Token': 'my-cf-token',
        });
    });

    it('adds Content-Type when withType is true', () => {
        const auth = { mode: 'client', token: 'tok' };
        const result = getAuthHeaders(auth, true);
        expect(result).toEqual({
            'X-Cloudflare-Token': 'tok',
            'Content-Type': 'application/json',
        });
    });
});

describe('hashPassword', () => {
    it('returns a 64-character hex string', async () => {
        const hash = await hashPassword('testpassword');
        expect(hash).toHaveLength(64);
        expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('is deterministic - same input produces same output', async () => {
        const hash1 = await hashPassword('mypassword123');
        const hash2 = await hashPassword('mypassword123');
        expect(hash1).toBe(hash2);
    });
});

describe('isPasswordStrong', () => {
    it('rejects short passwords', () => {
        expect(isPasswordStrong('abc1')).toBe(false);
        expect(isPasswordStrong('Ab1')).toBe(false);
    });

    it('rejects passwords without letters', () => {
        expect(isPasswordStrong('12345678')).toBe(false);
    });

    it('rejects passwords without numbers', () => {
        expect(isPasswordStrong('abcdefgh')).toBe(false);
    });

    it('accepts valid passwords', () => {
        expect(isPasswordStrong('abcdefg1')).toBe(true);
        expect(isPasswordStrong('Password1')).toBe(true);
        expect(isPasswordStrong('12345678a')).toBe(true);
    });
});
