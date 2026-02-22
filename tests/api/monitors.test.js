import { onRequestGet, onRequestPost, onRequestDelete } from '../../functions/api/monitors.js';
import { createMockKV, createMockContext, getResponseJson } from './_helpers.js';

/**
 * Helper: build a context for monitor endpoints with a given user.
 */
function createMonitorContext(overrides = {}) {
    const store = overrides.store || {};
    const kv = createMockKV(store);
    const request = overrides.request || new Request('http://localhost/api/monitors', { method: 'GET' });

    return createMockContext({
        kv,
        request,
        data: {
            user: { username: overrides.username || 'testuser', role: 'user' },
            ...overrides.data,
        },
        ...overrides,
    });
}

/**
 * Helper: build a POST request with JSON body for monitors.
 */
function makeMonitorPostRequest(body) {
    return new Request('http://localhost/api/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/**
 * Helper: build a DELETE request with an ID query param.
 */
function makeMonitorDeleteRequest(id) {
    const url = id ? `http://localhost/api/monitors?id=${id}` : 'http://localhost/api/monitors';
    return new Request(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
    });
}

// ---------------------------------------------------------------------------

describe('GET /api/monitors', () => {
    it('returns empty array when no monitors exist', async () => {
        const ctx = createMonitorContext();

        const res = await onRequestGet(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.monitors).toEqual([]);
    });

    it('returns existing monitors for the user', async () => {
        const monitors = [
            { id: 'mon-1', zoneId: 'z1', recordType: 'A', recordName: 'test.example.com', expectedContent: '1.2.3.4' },
        ];
        const ctx = createMonitorContext({
            store: { 'DNS_MONITORS:testuser': JSON.stringify(monitors) },
        });

        const res = await onRequestGet(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(200);
        expect(json.monitors).toHaveLength(1);
        expect(json.monitors[0].id).toBe('mon-1');
    });

    it('returns 500 when KV is not configured', async () => {
        const ctx = createMockContext({
            request: new Request('http://localhost/api/monitors', { method: 'GET' }),
            env: { CF_DNS_KV: undefined },
            data: { user: { username: 'testuser' } },
        });

        const res = await onRequestGet(ctx);
        expect(res.status).toBe(500);
    });
});

describe('POST /api/monitors', () => {
    const validMonitorBody = {
        zoneId: 'zone-abc',
        zoneName: 'example.com',
        recordType: 'A',
        recordName: 'www.example.com',
        expectedContent: '93.184.216.34',
    };

    it('creates a monitor with valid data', async () => {
        const ctx = createMonitorContext({
            request: makeMonitorPostRequest(validMonitorBody),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(201);
        expect(json.success).toBe(true);
        expect(json.monitor).toBeDefined();
        expect(json.monitor.zoneId).toBe('zone-abc');
        expect(json.monitor.recordType).toBe('A');
        expect(json.monitor.recordName).toBe('www.example.com');
        expect(json.monitor.expectedContent).toBe('93.184.216.34');
        expect(json.monitor.enabled).toBe(true);
        expect(json.monitor.lastStatus).toBe('unknown');
        expect(json.monitor.id).toBeDefined();
        expect(json.monitor.createdAt).toBeDefined();
    });

    it('uppercases the recordType', async () => {
        const ctx = createMonitorContext({
            request: makeMonitorPostRequest({ ...validMonitorBody, recordType: 'cname' }),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(201);
        expect(json.monitor.recordType).toBe('CNAME');
    });

    it('returns 400 when zoneId is missing', async () => {
        const { zoneId, ...bodyWithout } = validMonitorBody;
        const ctx = createMonitorContext({
            request: makeMonitorPostRequest(bodyWithout),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/missing required field/i);
    });

    it('returns 400 when recordType is missing', async () => {
        const { recordType, ...bodyWithout } = validMonitorBody;
        const ctx = createMonitorContext({
            request: makeMonitorPostRequest(bodyWithout),
        });

        const res = await onRequestPost(ctx);
        expect(res.status).toBe(400);
    });

    it('returns 400 when recordName is missing', async () => {
        const { recordName, ...bodyWithout } = validMonitorBody;
        const ctx = createMonitorContext({
            request: makeMonitorPostRequest(bodyWithout),
        });

        const res = await onRequestPost(ctx);
        expect(res.status).toBe(400);
    });

    it('returns 400 when expectedContent is missing', async () => {
        const { expectedContent, ...bodyWithout } = validMonitorBody;
        const ctx = createMonitorContext({
            request: makeMonitorPostRequest(bodyWithout),
        });

        const res = await onRequestPost(ctx);
        expect(res.status).toBe(400);
    });

    it('enforces 50 monitor limit', async () => {
        // Pre-populate 50 monitors
        const existingMonitors = Array.from({ length: 50 }, (_, i) => ({
            id: `mon-${i}`,
            zoneId: 'z1',
            recordType: 'A',
            recordName: `r${i}.example.com`,
            expectedContent: '1.2.3.4',
        }));

        const ctx = createMonitorContext({
            store: { 'DNS_MONITORS:testuser': JSON.stringify(existingMonitors) },
            request: makeMonitorPostRequest(validMonitorBody),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/maximum 50 monitors/i);
    });

    it('allows creation when under the limit (49 existing)', async () => {
        const existingMonitors = Array.from({ length: 49 }, (_, i) => ({
            id: `mon-${i}`,
            zoneId: 'z1',
            recordType: 'A',
            recordName: `r${i}.example.com`,
            expectedContent: '1.2.3.4',
        }));

        const ctx = createMonitorContext({
            store: { 'DNS_MONITORS:testuser': JSON.stringify(existingMonitors) },
            request: makeMonitorPostRequest(validMonitorBody),
        });

        const res = await onRequestPost(ctx);
        expect(res.status).toBe(201);
    });

    it('returns 500 when KV is not configured', async () => {
        const ctx = createMockContext({
            request: makeMonitorPostRequest(validMonitorBody),
            env: { CF_DNS_KV: undefined },
            data: { user: { username: 'testuser' } },
        });

        const res = await onRequestPost(ctx);
        expect(res.status).toBe(500);
    });
});

describe('DELETE /api/monitors', () => {
    it('deletes a monitor by ID', async () => {
        const monitors = [
            { id: 'mon-1', zoneId: 'z1', recordType: 'A', recordName: 'a.example.com', expectedContent: '1.2.3.4' },
            { id: 'mon-2', zoneId: 'z2', recordType: 'A', recordName: 'b.example.com', expectedContent: '5.6.7.8' },
        ];
        const store = { 'DNS_MONITORS:testuser': JSON.stringify(monitors) };
        const kv = createMockKV(store);

        const ctx = createMockContext({
            kv,
            request: makeMonitorDeleteRequest('mon-1'),
            data: { user: { username: 'testuser' } },
        });

        const res = await onRequestDelete(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);

        // Verify KV was updated: only mon-2 should remain
        const putCall = kv.put.mock.calls.find(([key]) => key === 'DNS_MONITORS:testuser');
        expect(putCall).toBeDefined();
        const remaining = JSON.parse(putCall[1]);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe('mon-2');
    });

    it('returns 404 when monitor ID does not exist', async () => {
        const monitors = [
            { id: 'mon-1', zoneId: 'z1', recordType: 'A', recordName: 'a.example.com', expectedContent: '1.2.3.4' },
        ];
        const ctx = createMonitorContext({
            store: { 'DNS_MONITORS:testuser': JSON.stringify(monitors) },
            request: makeMonitorDeleteRequest('non-existent-id'),
        });

        const res = await onRequestDelete(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(404);
        expect(json.error).toMatch(/not found/i);
    });

    it('returns 400 when id parameter is missing', async () => {
        const ctx = createMonitorContext({
            request: makeMonitorDeleteRequest(null),
        });

        const res = await onRequestDelete(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/missing id/i);
    });

    it('returns 500 when KV is not configured', async () => {
        const ctx = createMockContext({
            request: makeMonitorDeleteRequest('mon-1'),
            env: { CF_DNS_KV: undefined },
            data: { user: { username: 'testuser' } },
        });

        const res = await onRequestDelete(ctx);
        expect(res.status).toBe(500);
    });
});
