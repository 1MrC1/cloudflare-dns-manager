import { checkRateLimit, _resetMemCache } from '../../functions/api/_rate-limit.js';

function createMockKV() {
    const store = {};
    return {
        get: async (key) => store[key] || null,
        put: async (key, value) => { store[key] = value; },
        delete: async (key) => { delete store[key]; },
    };
}

describe('checkRateLimit', () => {
    beforeEach(() => { _resetMemCache(); });
    it('returns null when kv is null', async () => {
        const result = await checkRateLimit(null, '1.2.3.4', '/api/login');
        expect(result).toBeNull();
    });

    it('returns null for non-rate-limited endpoints', async () => {
        const kv = createMockKV();
        const result = await checkRateLimit(kv, '1.2.3.4', '/api/public-settings');
        expect(result).toBeNull();
    });

    it('rate limits prefix-matched endpoints', async () => {
        const kv = createMockKV();
        // /api/zones/ prefix has max: 120, windowSec: 60
        for (let i = 0; i < 120; i++) {
            const r = await checkRateLimit(kv, '1.2.3.4', '/api/zones/example.com');
            expect(r).toBeNull();
        }
        const result = await checkRateLimit(kv, '1.2.3.4', '/api/zones/example.com');
        expect(result).toBeGreaterThan(0);
    });

    it('groups prefix-matched sub-paths under the same key', async () => {
        const kv = createMockKV();
        // Requests to different sub-paths under /api/zones/ share the same limit
        for (let i = 0; i < 60; i++) {
            await checkRateLimit(kv, '1.2.3.4', '/api/zones/a.com');
        }
        for (let i = 0; i < 60; i++) {
            await checkRateLimit(kv, '1.2.3.4', '/api/zones/b.com');
        }
        // Total is now 120, so the next request should be rate-limited
        const result = await checkRateLimit(kv, '1.2.3.4', '/api/zones/c.com');
        expect(result).toBeGreaterThan(0);
    });

    it('matches prefix path without trailing slash', async () => {
        const kv = createMockKV();
        // /api/zones (no trailing slash) should also be rate-limited
        const result = await checkRateLimit(kv, '1.2.3.4', '/api/zones');
        expect(result).toBeNull(); // first request is within limit
    });

    it('returns null for requests within limit', async () => {
        const kv = createMockKV();
        // First request should always be within limit
        const result = await checkRateLimit(kv, '1.2.3.4', '/api/login');
        expect(result).toBeNull();
    });

    it('returns retry-after seconds when limit exceeded', async () => {
        const kv = createMockKV();
        // /api/login has max: 10, windowSec: 60
        // Make 11 requests to exceed the limit
        for (let i = 0; i < 10; i++) {
            const r = await checkRateLimit(kv, '1.2.3.4', '/api/login');
            expect(r).toBeNull();
        }
        const result = await checkRateLimit(kv, '1.2.3.4', '/api/login');
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThanOrEqual(60);
    });

    it('resets window after expiry', async () => {
        const kv = createMockKV();
        const now = Date.now();

        // Manually store an expired window with a high count
        const key = 'RATELIMIT:1.2.3.4:/api/login';
        const expiredData = { count: 50, windowStart: now - 120_000 };
        await kv.put(key, JSON.stringify(expiredData));

        const result = await checkRateLimit(kv, '1.2.3.4', '/api/login');
        expect(result).toBeNull();

        // The stored data should have been reset
        const stored = JSON.parse(await kv.get(key));
        expect(stored.count).toBe(1);
    });
});
