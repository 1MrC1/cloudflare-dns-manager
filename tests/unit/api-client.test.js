import { ApiClient, ApiError, createApiClient } from '../../src/utils/api.js';

// Mock global fetch for all tests
beforeEach(() => {
    vi.restoreAllMocks();
});

/**
 * Helper: create a mock Response object.
 */
function mockResponse(body, { status = 200, contentType = 'application/json' } = {}) {
    const headers = new Headers();
    if (contentType) headers.set('content-type', contentType);
    return new Response(JSON.stringify(body), { status, headers });
}

// ---------------------------------------------------------------------------

describe('ApiError', () => {
    it('creates an error with status, message, and data', () => {
        const err = new ApiError(404, 'Not found', { detail: 'zone missing' });

        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.name).toBe('ApiError');
        expect(err.status).toBe(404);
        expect(err.message).toBe('Not found');
        expect(err.data).toEqual({ detail: 'zone missing' });
    });

    it('works without data parameter', () => {
        const err = new ApiError(500, 'Internal Server Error');
        expect(err.status).toBe(500);
        expect(err.data).toBeUndefined();
    });
});

describe('ApiClient: auto auth header injection', () => {
    it('injects X-Cloudflare-Token for _localToken auth', async () => {
        const auth = { _localToken: 'my-local-token' };
        const client = new ApiClient(() => auth);

        globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse({ ok: true })));

        await client.get('/api/zones');

        const [, fetchOptions] = globalThis.fetch.mock.calls[0];
        const headers = fetchOptions.headers;
        expect(headers.get('X-Cloudflare-Token')).toBe('my-local-token');
    });

    it('injects Authorization and X-Managed-Account-Index for server mode', async () => {
        const auth = { mode: 'server', token: 'jwt-token-123', currentAccountIndex: 3 };
        const client = new ApiClient(() => auth);

        globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse({ ok: true })));

        await client.get('/api/zones');

        const [, fetchOptions] = globalThis.fetch.mock.calls[0];
        const headers = fetchOptions.headers;
        expect(headers.get('Authorization')).toBe('Bearer jwt-token-123');
        expect(headers.get('X-Managed-Account-Index')).toBe('3');
    });

    it('injects X-Cloudflare-Token for client mode', async () => {
        const auth = { mode: 'client', token: 'cf-token-abc' };
        const client = new ApiClient(() => auth);

        globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse({ ok: true })));

        await client.get('/api/zones');

        const [, fetchOptions] = globalThis.fetch.mock.calls[0];
        const headers = fetchOptions.headers;
        expect(headers.get('X-Cloudflare-Token')).toBe('cf-token-abc');
    });

    it('does not inject auth headers when getAuth returns null', async () => {
        const client = new ApiClient(() => null);

        globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse({ ok: true })));

        await client.get('/api/health');

        const [, fetchOptions] = globalThis.fetch.mock.calls[0];
        const headers = fetchOptions.headers;
        expect(headers.has('Authorization')).toBe(false);
        expect(headers.has('X-Cloudflare-Token')).toBe(false);
    });
});

describe('ApiClient: auto Content-Type', () => {
    it('sets Content-Type to application/json when body is present', async () => {
        const client = new ApiClient(() => null);
        globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse({ ok: true })));

        await client.post('/api/test', { foo: 'bar' });

        const [, fetchOptions] = globalThis.fetch.mock.calls[0];
        const headers = fetchOptions.headers;
        expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('does not set Content-Type when body is absent (GET)', async () => {
        const client = new ApiClient(() => null);
        globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse({ ok: true })));

        await client.get('/api/test');

        const [, fetchOptions] = globalThis.fetch.mock.calls[0];
        const headers = fetchOptions.headers;
        // For GET requests with no body, Content-Type should not be auto-set
        expect(headers.has('Content-Type')).toBe(false);
    });
});

describe('ApiClient: JSON parsing', () => {
    it('parses JSON response with application/json content-type', async () => {
        const client = new ApiClient(() => null);
        globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse({ zones: [1, 2, 3] })));

        const result = await client.get('/api/zones');
        expect(result).toEqual({ zones: [1, 2, 3] });
    });

    it('attempts JSON parse for non-JSON content type if text is valid JSON', async () => {
        const client = new ApiClient(() => null);
        const body = JSON.stringify({ data: 'hello' });
        globalThis.fetch = vi.fn(() => Promise.resolve(
            new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } })
        ));

        const result = await client.get('/api/test');
        expect(result).toEqual({ data: 'hello' });
    });

    it('returns text when response is not JSON', async () => {
        const client = new ApiClient(() => null);
        globalThis.fetch = vi.fn(() => Promise.resolve(
            new Response('plain text', { status: 200, headers: { 'content-type': 'text/plain' } })
        ));

        const result = await client.get('/api/test');
        expect(result).toBe('plain text');
    });

    it('throws ApiError for non-ok responses', async () => {
        const client = new ApiClient(() => null);
        globalThis.fetch = vi.fn(() => Promise.resolve(
            mockResponse({ error: 'Not found' }, { status: 404 })
        ));

        await expect(client.get('/api/missing')).rejects.toThrow(ApiError);
        try {
            await client.get('/api/missing');
        } catch (err) {
            expect(err.status).toBe(404);
            expect(err.message).toBe('Not found');
        }
    });

    it('uses generic message when error response has no error field', async () => {
        const client = new ApiClient(() => null);
        globalThis.fetch = vi.fn(() => Promise.resolve(
            mockResponse({}, { status: 500 })
        ));

        await expect(client.get('/api/fail')).rejects.toThrow(/Request failed with status 500/);
    });
});

describe('ApiClient: 401 retry logic', () => {
    it('retries once on 401 when onRefreshToken is provided', async () => {
        const auth = { mode: 'server', token: 'old-token', currentAccountIndex: 0 };
        const refreshedAuth = { mode: 'server', token: 'new-token', currentAccountIndex: 0 };

        const onRefreshToken = vi.fn(async () => refreshedAuth);
        const client = new ApiClient(() => auth, onRefreshToken);

        let callCount = 0;
        globalThis.fetch = vi.fn(() => {
            callCount++;
            if (callCount === 1) {
                // First call returns 401
                return Promise.resolve(mockResponse({ error: 'Unauthorized' }, { status: 401 }));
            }
            // Retry returns success
            return Promise.resolve(mockResponse({ success: true }));
        });

        const result = await client.get('/api/zones');

        expect(onRefreshToken).toHaveBeenCalledTimes(1);
        expect(onRefreshToken).toHaveBeenCalledWith(auth);
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ success: true });
    });

    it('throws ApiError if retry still returns 401', async () => {
        const auth = { mode: 'server', token: 'token', currentAccountIndex: 0 };
        const refreshedAuth = { mode: 'server', token: 'still-bad', currentAccountIndex: 0 };

        const onRefreshToken = vi.fn(async () => refreshedAuth);
        const client = new ApiClient(() => auth, onRefreshToken);

        globalThis.fetch = vi.fn(() => Promise.resolve(
            mockResponse({ error: 'Unauthorized' }, { status: 401 })
        ));

        await expect(client.get('/api/zones')).rejects.toThrow(ApiError);
    });

    it('does not retry on 401 when onRefreshToken is not provided', async () => {
        const client = new ApiClient(() => ({ mode: 'server', token: 't', currentAccountIndex: 0 }));

        globalThis.fetch = vi.fn(() => Promise.resolve(
            mockResponse({ error: 'Unauthorized' }, { status: 401 })
        ));

        await expect(client.get('/api/zones')).rejects.toThrow(ApiError);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 401 when getAuth returns null', async () => {
        const onRefreshToken = vi.fn(async () => null);
        const client = new ApiClient(() => null, onRefreshToken);

        globalThis.fetch = vi.fn(() => Promise.resolve(
            mockResponse({ error: 'Unauthorized' }, { status: 401 })
        ));

        await expect(client.get('/api/zones')).rejects.toThrow(ApiError);
        // onRefreshToken should not be called because auth is null
        expect(onRefreshToken).not.toHaveBeenCalled();
    });

    it('does not retry on non-401 errors', async () => {
        const onRefreshToken = vi.fn(async () => ({ token: 'new' }));
        const client = new ApiClient(() => ({ token: 'old' }), onRefreshToken);

        globalThis.fetch = vi.fn(() => Promise.resolve(
            mockResponse({ error: 'Forbidden' }, { status: 403 })
        ));

        await expect(client.get('/api/admin')).rejects.toThrow(ApiError);
        expect(onRefreshToken).not.toHaveBeenCalled();
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
});

describe('ApiClient: convenience verbs', () => {
    let client;

    beforeEach(() => {
        client = new ApiClient(() => null);
        globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse({ ok: true })));
    });

    it('get() uses GET method', async () => {
        await client.get('/api/test');
        const [, opts] = globalThis.fetch.mock.calls[0];
        expect(opts.method).toBe('GET');
    });

    it('post() uses POST method and stringifies body', async () => {
        await client.post('/api/test', { name: 'test' });
        const [, opts] = globalThis.fetch.mock.calls[0];
        expect(opts.method).toBe('POST');
        expect(opts.body).toBe(JSON.stringify({ name: 'test' }));
    });

    it('put() uses PUT method', async () => {
        await client.put('/api/test', { name: 'update' });
        const [, opts] = globalThis.fetch.mock.calls[0];
        expect(opts.method).toBe('PUT');
    });

    it('patch() uses PATCH method', async () => {
        await client.patch('/api/test', { ttl: 300 });
        const [, opts] = globalThis.fetch.mock.calls[0];
        expect(opts.method).toBe('PATCH');
    });

    it('del() uses DELETE method', async () => {
        await client.del('/api/test');
        const [, opts] = globalThis.fetch.mock.calls[0];
        expect(opts.method).toBe('DELETE');
    });
});

describe('createApiClient', () => {
    it('returns an ApiClient instance', () => {
        const client = createApiClient(() => null);
        expect(client).toBeInstanceOf(ApiClient);
    });

    it('passes getAuth and onRefreshToken to the ApiClient', async () => {
        const getAuth = () => ({ token: 'test' });
        const onRefresh = vi.fn(async () => null);
        const client = createApiClient(getAuth, onRefresh);

        globalThis.fetch = vi.fn(() => Promise.resolve(
            mockResponse({ error: 'Unauthorized' }, { status: 401 })
        ));

        try { await client.get('/api/test'); } catch {}

        expect(onRefresh).toHaveBeenCalled();
    });
});
