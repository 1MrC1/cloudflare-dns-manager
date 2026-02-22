import { checkRateLimit } from './_rate-limit.js';
import { getUserAllowedZones, isZoneAllowed } from './_permissions.js';
import { buildCfHeaders } from './_cf-api.js';

// Endpoints that accept non-JSON content types (e.g. multipart form data for file uploads)
const NON_JSON_ENDPOINTS = [
    /^\/api\/zones\/[^/]+\/dns_import$/
];

function isNonJsonEndpoint(pathname) {
    return NON_JSON_ENDPOINTS.some(re => re.test(pathname));
}

// Add security headers to a response
function withSecurityHeaders(headers) {
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.cloudflare.com; font-src 'self'");
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-XSS-Protection', '0');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

// Add CORS and security headers to a response
function withCorsHeaders(response, origin) {
    const headers = new Headers(response.headers);
    if (origin) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Allow-Credentials', 'true');
        headers.set('Vary', 'Origin');
    }
    withSecurityHeaders(headers);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const origin = request.headers.get('Origin');

    // --- CORS: Handle preflight OPTIONS requests ---
    if (method === 'OPTIONS') {
        const headers = {
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cloudflare-Token, X-Cloudflare-Email, X-Managed-Account-Index',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '86400'
        };
        if (origin) {
            headers['Access-Control-Allow-Origin'] = origin;
            headers['Vary'] = 'Origin';
        }
        return new Response(null, { status: 204, headers });
    }

    // --- CSRF: Content-Type check for state-changing requests ---
    const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (MUTATION_METHODS.includes(method) && !isNonJsonEndpoint(url.pathname)) {
        const contentType = request.headers.get('Content-Type') || '';
        if (!contentType.includes('application/json')) {
            const resp = new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
            return withCorsHeaders(resp, origin);
        }
    }

    // Rate limiting on auth endpoints (before any processing)
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const retryAfter = await checkRateLimit(env.CF_DNS_KV, ip, url.pathname);
    if (retryAfter) {
        const resp = new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) }
        });
        return withCorsHeaders(resp, origin);
    }

    // Skip auth for public APIs
    if (url.pathname === '/api/login' || url.pathname === '/api/setup-account' || url.pathname === '/api/register' || url.pathname === '/api/public-settings'
        || url.pathname === '/api/passkey/login-options' || url.pathname === '/api/passkey/login-verify'
        || url.pathname === '/api/refresh' || url.pathname === '/api/verify-totp' || url.pathname === '/api/health') {
        const response = await next();
        return withCorsHeaders(response, origin);
    }

    // Skip auth for shared snapshot GET requests with a token parameter
    if (method === 'GET' && /^\/api\/zones\/[^/]+\/share-snapshot$/.test(url.pathname) && url.searchParams.get('token')) {
        const response = await next();
        return withCorsHeaders(response, origin);
    }

    // Get tokens from headers
    const clientToken = request.headers.get('X-Cloudflare-Token');
    const clientEmail = request.headers.get('X-Cloudflare-Email');
    const authHeader = request.headers.get('Authorization');

    // Priority 1: Client Mode (Token provided directly by user)
    if (clientToken) {
        if (clientEmail) {
            // Global API Key mode
            context.data.cfHeaders = buildCfHeaders({ type: 'global_key', email: clientEmail, key: clientToken });
            context.data.authType = 'global_key';
        } else {
            // API Token mode
            context.data.cfHeaders = buildCfHeaders({ token: clientToken });
            context.data.authType = 'api_token';
        }
        context.data.cfToken = clientToken; // backward compat
        const response = await next();
        return withCorsHeaders(response, origin);
    }

    // Priority 2: Server Mode (JWT provided)
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const serverSecret = env.APP_PASSWORD;

        if (!serverSecret) {
            return withCorsHeaders(new Response(JSON.stringify({ error: 'Server-side Managed Mode is not configured (missing APP_PASSWORD).' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            }), origin);
        }

        try {
            const { jwtVerify } = await import('jose');
            const secret = new TextEncoder().encode(serverSecret);
            const { payload } = await jwtVerify(token, secret);

            // Extract user info from JWT
            const username = payload.sub || 'admin';
            const role = payload.role || (payload.admin ? 'admin' : 'user');
            context.data.user = { username, role };

            // Admin-only routes: /api/admin/users (settings is accessible by all users for their own tokens)
            if (url.pathname.startsWith('/api/admin/') && url.pathname !== '/api/admin/settings') {
                if (role !== 'admin') {
                    return withCorsHeaders(new Response(JSON.stringify({ error: 'Admin access required.' }), {
                        status: 403,
                        headers: { 'Content-Type': 'application/json' }
                    }), origin);
                }
            }

            // Admin routes, settings, account management, passkey management, scheduled changes, monitors, and logout don't need a CF token
            if (url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/account/') || url.pathname.startsWith('/api/passkey/') || url.pathname === '/api/logout' || url.pathname === '/api/scheduled-changes' || url.pathname === '/api/run-scheduled' || url.pathname === '/api/monitors' || url.pathname === '/api/run-monitors') {
                const response = await next();
                return withCorsHeaders(response, origin);
            }

            // Resolve CF token from per-user storage
            const accountIndex = parseInt(request.headers.get('X-Managed-Account-Index') || '0');
            let tokenEntry = null;

            if (env.CF_DNS_KV) {
                const tokensJson = await env.CF_DNS_KV.get(`USER_TOKENS:${username}`);
                if (tokensJson) {
                    const tokens = JSON.parse(tokensJson);
                    tokenEntry = tokens.find(t => t.id === accountIndex);
                }
            }

            // Fallback: env vars (for backward compat, admin only)
            if (!tokenEntry && username === 'admin') {
                const envEmail = accountIndex > 0 ? env[`CF_API_EMAIL${accountIndex}`] : env.CF_API_EMAIL;
                const envKey = accountIndex > 0 ? env[`CF_GLOBAL_API_KEY${accountIndex}`] : env.CF_GLOBAL_API_KEY;
                const envToken = accountIndex > 0 ? env[`CF_API_TOKEN${accountIndex}`] : env.CF_API_TOKEN;
                if (envEmail && (envKey || envToken)) {
                    tokenEntry = { type: 'global_key', email: envEmail, key: envKey || envToken };
                } else if (envToken) {
                    tokenEntry = { token: envToken };
                }
            }

            if (!tokenEntry) {
                return withCorsHeaders(new Response(JSON.stringify({ error: 'Selected managed account is not configured.' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' }
                }), origin);
            }

            context.data.cfHeaders = buildCfHeaders(tokenEntry);
            context.data.cfToken = tokenEntry.token || tokenEntry.key; // backward compat
            context.data.authType = tokenEntry.type === 'global_key' ? 'global_key' : 'api_token';

            // Zone-level access control for non-admin users
            const zoneMatch = url.pathname.match(/^\/api\/zones\/([^/]+)/);
            if (zoneMatch && role !== 'admin' && env.CF_DNS_KV) {
                const allowedZones = await getUserAllowedZones(env.CF_DNS_KV, username);
                if (allowedZones.length > 0) {
                    const zoneId = zoneMatch[1];
                    const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
                        headers: { ...context.data.cfHeaders, 'Content-Type': 'application/json' }
                    });
                    const zoneData = await zoneRes.json();
                    if (zoneData.success && zoneData.result) {
                        if (!isZoneAllowed(allowedZones, zoneData.result.name)) {
                            return withCorsHeaders(new Response(JSON.stringify({ error: 'You do not have access to this zone.' }), {
                                status: 403,
                                headers: { 'Content-Type': 'application/json' }
                            }), origin);
                        }
                    }
                }
            }

            const response = await next();
            return withCorsHeaders(response, origin);
        } catch (e) {
            return withCorsHeaders(new Response(JSON.stringify({ error: 'Invalid or expired session.', message: e.message }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            }), origin);
        }
    }

    // No valid auth method found
    return withCorsHeaders(new Response(JSON.stringify({
        error: 'Authentication Required',
        message: 'Please provide either X-Cloudflare-Token or a valid Authorization header.'
    }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
    }), origin);
}
