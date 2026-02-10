import { hashPassword, verifyPassword, isLegacyHash } from '../../functions/api/_crypto.js';

describe('hashPassword', () => {
    it('returns format "uuid:hex"', async () => {
        const result = await hashPassword('abc123');
        expect(result).toMatch(/^[0-9a-f-]+:[0-9a-f]+$/);
        const [salt, hash] = result.split(':');
        // Salt should be a UUID format
        expect(salt).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        // Hash should be 64-char hex (SHA-256 output = 256 bits = 64 hex chars)
        expect(hash).toHaveLength(64);
    });
});

describe('verifyPassword', () => {
    it('returns true for matching password', async () => {
        const clientHash = 'e3b0c44298fc1c149afbf4c8996fb924';
        const stored = await hashPassword(clientHash);
        const result = await verifyPassword(clientHash, stored);
        expect(result).toBe(true);
    });

    it('returns false for wrong password', async () => {
        const stored = await hashPassword('correcthash');
        const result = await verifyPassword('wronghash', stored);
        expect(result).toBe(false);
    });

    it('returns false for empty stored hash', async () => {
        expect(await verifyPassword('anything', '')).toBe(false);
    });

    it('returns false for null stored hash', async () => {
        expect(await verifyPassword('anything', null)).toBe(false);
    });
});

describe('isLegacyHash', () => {
    it('returns true for 64-char hex string', () => {
        const hex64 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        expect(isLegacyHash(hex64)).toBe(true);
    });

    it('returns false for PBKDF2 format (contains colon)', () => {
        const pbkdf2 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
        expect(isLegacyHash(pbkdf2)).toBe(false);
    });

    it('returns false for null', () => {
        expect(isLegacyHash(null)).toBeFalsy();
    });

    it('returns false for empty string', () => {
        expect(isLegacyHash('')).toBeFalsy();
    });
});
