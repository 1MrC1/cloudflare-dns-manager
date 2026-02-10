import { onRequestGet, onRequestPost, onRequestDelete } from '../../functions/api/scheduled-changes.js';
import { createMockKV, createMockContext, getResponseJson } from './_helpers.js';

/**
 * Helper: build a context for scheduled-changes endpoints.
 */
function createScheduledContext(overrides = {}) {
    const store = overrides.store || {};
    const kv = createMockKV(store);
    const request = overrides.request || new Request('http://localhost/api/scheduled-changes', { method: 'GET' });

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
 * Helper: build a POST request with JSON body.
 */
function makeScheduledPostRequest(body) {
    return new Request('http://localhost/api/scheduled-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/**
 * Helper: build a DELETE request with an ID query param.
 */
function makeScheduledDeleteRequest(id) {
    const url = id
        ? `http://localhost/api/scheduled-changes?id=${id}`
        : 'http://localhost/api/scheduled-changes';
    return new Request(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Returns a date string that is guaranteed to be in the future.
 */
function futureDate(minutesFromNow = 60) {
    return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
}

/**
 * Returns a date string that is guaranteed to be in the past.
 */
function pastDate(minutesAgo = 60) {
    return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------

describe('GET /api/scheduled-changes', () => {
    it('returns empty array when no changes exist', async () => {
        const ctx = createScheduledContext();

        const res = await onRequestGet(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.changes).toEqual([]);
    });

    it('returns only pending changes', async () => {
        const changes = [
            { id: 'c1', status: 'pending', zoneId: 'z1', action: 'create', scheduledAt: futureDate() },
            { id: 'c2', status: 'completed', zoneId: 'z1', action: 'create', scheduledAt: pastDate() },
            { id: 'c3', status: 'failed', zoneId: 'z1', action: 'create', scheduledAt: pastDate() },
        ];
        const ctx = createScheduledContext({
            store: { 'SCHEDULED_CHANGES:testuser': JSON.stringify(changes) },
        });

        const res = await onRequestGet(ctx);
        const json = await getResponseJson(res);

        expect(json.changes).toHaveLength(1);
        expect(json.changes[0].id).toBe('c1');
    });

    it('returns 500 when KV is not configured', async () => {
        const ctx = createMockContext({
            request: new Request('http://localhost/api/scheduled-changes', { method: 'GET' }),
            env: { CF_DNS_KV: undefined },
            data: { user: { username: 'testuser' } },
        });

        const res = await onRequestGet(ctx);
        expect(res.status).toBe(500);
    });
});

describe('POST /api/scheduled-changes', () => {
    const validBody = {
        zoneId: 'zone-abc',
        zoneName: 'example.com',
        action: 'create',
        record: { type: 'A', name: 'test.example.com', content: '1.2.3.4', ttl: 1 },
        scheduledAt: futureDate(120),
    };

    it('creates a scheduled change with a future date', async () => {
        const ctx = createScheduledContext({
            request: makeScheduledPostRequest(validBody),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(201);
        expect(json.success).toBe(true);
        expect(json.change).toBeDefined();
        expect(json.change.zoneId).toBe('zone-abc');
        expect(json.change.action).toBe('create');
        expect(json.change.status).toBe('pending');
        expect(json.change.id).toBeDefined();
        expect(json.change.createdAt).toBeDefined();
        expect(json.change.record).toEqual(validBody.record);
    });

    it('rejects a scheduled change with a past date', async () => {
        const ctx = createScheduledContext({
            request: makeScheduledPostRequest({
                ...validBody,
                scheduledAt: pastDate(10),
            }),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/must be in the future/i);
    });

    it('rejects a scheduled change with missing zoneId', async () => {
        const { zoneId, ...bodyWithout } = validBody;
        const ctx = createScheduledContext({
            request: makeScheduledPostRequest(bodyWithout),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/missing required fields/i);
    });

    it('rejects a scheduled change with missing action', async () => {
        const { action, ...bodyWithout } = validBody;
        const ctx = createScheduledContext({
            request: makeScheduledPostRequest(bodyWithout),
        });

        const res = await onRequestPost(ctx);
        expect(res.status).toBe(400);
    });

    it('rejects a scheduled change with missing scheduledAt', async () => {
        const { scheduledAt, ...bodyWithout } = validBody;
        const ctx = createScheduledContext({
            request: makeScheduledPostRequest(bodyWithout),
        });

        const res = await onRequestPost(ctx);
        expect(res.status).toBe(400);
    });

    it('rejects an invalid action value', async () => {
        const ctx = createScheduledContext({
            request: makeScheduledPostRequest({ ...validBody, action: 'invalid' }),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/invalid action/i);
    });

    it('rejects an invalid scheduledAt date format', async () => {
        const ctx = createScheduledContext({
            request: makeScheduledPostRequest({ ...validBody, scheduledAt: 'not-a-date' }),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/invalid.*date/i);
    });

    it('requires record data for create action', async () => {
        const ctx = createScheduledContext({
            request: makeScheduledPostRequest({
                zoneId: 'z1',
                action: 'create',
                scheduledAt: futureDate(120),
                // no record field
            }),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/record data is required/i);
    });

    it('requires recordId for delete action', async () => {
        const ctx = createScheduledContext({
            request: makeScheduledPostRequest({
                zoneId: 'z1',
                action: 'delete',
                scheduledAt: futureDate(120),
                // no recordId
            }),
        });

        const res = await onRequestPost(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/recordId is required/i);
    });

    it('allows delete action with recordId', async () => {
        const ctx = createScheduledContext({
            request: makeScheduledPostRequest({
                zoneId: 'z1',
                action: 'delete',
                recordId: 'rec-123',
                scheduledAt: futureDate(120),
            }),
        });

        const res = await onRequestPost(ctx);
        expect(res.status).toBe(201);
    });

    it('returns 500 when KV is not configured', async () => {
        const ctx = createMockContext({
            request: makeScheduledPostRequest(validBody),
            env: { CF_DNS_KV: undefined },
            data: { user: { username: 'testuser' } },
        });

        const res = await onRequestPost(ctx);
        expect(res.status).toBe(500);
    });
});

describe('DELETE /api/scheduled-changes', () => {
    it('cancels a pending change', async () => {
        const changes = [
            { id: 'c1', status: 'pending', zoneId: 'z1', action: 'create', scheduledAt: futureDate() },
            { id: 'c2', status: 'pending', zoneId: 'z2', action: 'delete', scheduledAt: futureDate() },
        ];
        const store = { 'SCHEDULED_CHANGES:testuser': JSON.stringify(changes) };
        const kv = createMockKV(store);

        const ctx = createMockContext({
            kv,
            request: makeScheduledDeleteRequest('c1'),
            data: { user: { username: 'testuser' } },
        });

        const res = await onRequestDelete(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);

        // Verify KV was updated: only c2 should remain
        const putCall = kv.put.mock.calls.find(([key]) => key === 'SCHEDULED_CHANGES:testuser');
        expect(putCall).toBeDefined();
        const remaining = JSON.parse(putCall[1]);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe('c2');
    });

    it('returns 404 when change ID does not exist', async () => {
        const changes = [
            { id: 'c1', status: 'pending', zoneId: 'z1', action: 'create', scheduledAt: futureDate() },
        ];
        const ctx = createScheduledContext({
            store: { 'SCHEDULED_CHANGES:testuser': JSON.stringify(changes) },
            request: makeScheduledDeleteRequest('non-existent'),
        });

        const res = await onRequestDelete(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(404);
        expect(json.error).toMatch(/not found/i);
    });

    it('returns 400 when trying to cancel a non-pending change', async () => {
        const changes = [
            { id: 'c1', status: 'completed', zoneId: 'z1', action: 'create', scheduledAt: pastDate() },
        ];
        const ctx = createScheduledContext({
            store: { 'SCHEDULED_CHANGES:testuser': JSON.stringify(changes) },
            request: makeScheduledDeleteRequest('c1'),
        });

        const res = await onRequestDelete(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/only pending/i);
    });

    it('returns 400 when id parameter is missing', async () => {
        const ctx = createScheduledContext({
            request: makeScheduledDeleteRequest(null),
        });

        const res = await onRequestDelete(ctx);
        const json = await getResponseJson(res);

        expect(res.status).toBe(400);
        expect(json.error).toMatch(/missing id/i);
    });

    it('returns 500 when KV is not configured', async () => {
        const ctx = createMockContext({
            request: makeScheduledDeleteRequest('c1'),
            env: { CF_DNS_KV: undefined },
            data: { user: { username: 'testuser' } },
        });

        const res = await onRequestDelete(ctx);
        expect(res.status).toBe(500);
    });
});
