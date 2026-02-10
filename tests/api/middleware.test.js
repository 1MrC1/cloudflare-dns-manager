import { onRequest } from '../../functions/api/_middleware.js';
import { createMockKV, createMockContext } from './_helpers.js';

// Mock the _rate-limit module so we can control its behavior
vi.mock('../../functions/api/_rate-limit.js', () => ({
    checkRateLimit: vi.fn(async () => null),
}));

// Mock the _permissions module
vi.mock('../../functions/api/_permissions.js', () => ({
    getUserAllowedZones: vi.fn(async () => []),
    isZoneAllowed: vi.fn(() => true),
}));

/**
 * Helper: build a middleware context with the given request and optional overrides.
 * The `next` callback simulates a downstream handler that returns 200 OK.
 */
function createMiddlewareContext(requestInit = {}, overrides = {}) {
    const kv = overrides.kv || createMockKV();
    const url = requestInit.url || 'http://localhost/api/health';
    const request = new Request(url, {
        method: requestInit.method || 'GET',
        headers: requestInit.headers || {},
        ...(requestInit.body !== undefined ? { body: requestInit.body } : {}),
    });

    return {
        request,
        env: {
            CF_DNS_KV: kv,
            APP_PASSWORD: overrides.appPassword || 'test-password',
            ...overrides.env,
        },
        params: overrides.params || {},
        data: overrides.data || {},
        next: overrides.next || vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })),
    };
}

describe('Middleware: Content-Type enforcement (CSRF)', () => {
    it('returns 400 when POST request lacks application/json Content-Type', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/login',
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: '{}',
        });

        const res = await onRequest(ctx);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/Content-Type must be application\/json/i);
    });

    it('returns 400 when PUT request has no Content-Type header', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/login',
            method: 'PUT',
            body: '{}',
        });

        const res = await onRequest(ctx);
        expect(res.status).toBe(400);
    });

    it('allows POST request with application/json Content-Type', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'test', password: 'test' }),
        });

        const res = await onRequest(ctx);
        // Should not be 400 — it will proceed to the handler (login is public)
        expect(res.status).not.toBe(400);
    });

    it('GET requests bypass Content-Type check', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/health',
            method: 'GET',
        });

        const res = await onRequest(ctx);
        // GET requests do not require Content-Type; downstream handler is called
        expect(res.status).toBe(200);
    });

    it('returns 400 for DELETE without application/json Content-Type', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/monitors',
            method: 'DELETE',
            headers: {},
            body: '{}',
        });

        const res = await onRequest(ctx);
        expect(res.status).toBe(400);
    });

    it('returns 400 for PATCH without application/json Content-Type', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/zones/abc123/dns_records',
            method: 'PATCH',
            headers: { 'Content-Type': 'text/html' },
            body: '{}',
        });

        const res = await onRequest(ctx);
        expect(res.status).toBe(400);
    });
});

describe('Middleware: CORS headers', () => {
    it('includes Access-Control-Allow-Origin when Origin header is present', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/health',
            method: 'GET',
            headers: { 'Origin': 'http://localhost' },
        });

        const res = await onRequest(ctx);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost');
    });

    it('includes security headers on responses', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/health',
            method: 'GET',
            headers: { 'Origin': 'http://localhost' },
        });

        const res = await onRequest(ctx);
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('X-Frame-Options')).toBe('DENY');
        expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('handles OPTIONS preflight requests with 204', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/health',
            method: 'OPTIONS',
            headers: { 'Origin': 'http://localhost' },
        });

        const res = await onRequest(ctx);
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
        expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
        expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });

    it('includes Vary: Origin header when Origin is present', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/health',
            method: 'GET',
            headers: { 'Origin': 'http://localhost' },
        });

        const res = await onRequest(ctx);
        expect(res.headers.get('Vary')).toBe('Origin');
    });

    it('includes Access-Control-Allow-Credentials header', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/health',
            method: 'GET',
            headers: { 'Origin': 'http://localhost' },
        });

        const res = await onRequest(ctx);
        expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });
});

describe('Middleware: public endpoints bypass auth', () => {
    it('allows GET /api/health without authentication', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/health',
            method: 'GET',
        });

        const res = await onRequest(ctx);
        expect(res.status).toBe(200);
        // next() should have been called
        expect(ctx.next).toHaveBeenCalled();
    });

    it('returns 401 for non-public endpoints without auth', async () => {
        const ctx = createMiddlewareContext({
            url: 'http://localhost/api/zones',
            method: 'GET',
        });

        const res = await onRequest(ctx);
        expect(res.status).toBe(401);
    });
});
