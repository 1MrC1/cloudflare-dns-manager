import { onRequestGet } from '../../functions/api/health.js';
import { createMockKV, createMockContext, getResponseJson } from './_helpers.js';

describe('GET /api/health', () => {
    it('returns ok when KV is available and working', async () => {
        const kv = createMockKV();
        const ctx = createMockContext({ kv });

        const res = await onRequestGet(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(200);
        expect(json.status).toBe('ok');
        expect(json.kv).toBe(true);
    });

    it('returns degraded when KV throws an error', async () => {
        const kv = createMockKV();
        kv.get.mockRejectedValue(new Error('KV unavailable'));
        const ctx = createMockContext({ kv });

        const res = await onRequestGet(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(503);
        expect(json.status).toBe('degraded');
        expect(json.kv).toBe(false);
    });

    it('returns degraded when KV is not configured (undefined)', async () => {
        const ctx = createMockContext({
            env: { CF_DNS_KV: undefined },
        });

        const res = await onRequestGet(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(503);
        expect(json.status).toBe('degraded');
        expect(json.kv).toBe(false);
    });

    it('returns correct JSON shape with status, timestamp, version, kv', async () => {
        const kv = createMockKV();
        const ctx = createMockContext({ kv });

        const res = await onRequestGet(ctx);
        const json = await getResponseJson(res);

        expect(json).toHaveProperty('status');
        expect(json).toHaveProperty('timestamp');
        expect(json).toHaveProperty('version');
        expect(json).toHaveProperty('kv');
        // timestamp should be a valid ISO date string
        expect(new Date(json.timestamp).toISOString()).toBe(json.timestamp);
    });

    it('returns a version string', async () => {
        const kv = createMockKV();
        const ctx = createMockContext({ kv });

        const res = await onRequestGet(ctx);
        const json = await getResponseJson(res);

        expect(typeof json.version).toBe('string');
        expect(json.version.length).toBeGreaterThan(0);
    });

    it('uses APP_VERSION from env when available', async () => {
        const kv = createMockKV();
        const ctx = createMockContext({
            kv,
            env: { CF_DNS_KV: kv, APP_VERSION: '99.0.0' },
        });

        const res = await onRequestGet(ctx);
        const json = await getResponseJson(res);

        expect(json.version).toBe('99.0.0');
    });

    it('returns Content-Type application/json', async () => {
        const kv = createMockKV();
        const ctx = createMockContext({ kv });

        const res = await onRequestGet(ctx);
        expect(res.headers.get('Content-Type')).toBe('application/json');
    });
});
