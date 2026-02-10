import { checkRateLimit } from './_rate-limit.js';

export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // Rate limiting on auth endpoints (before any processing)
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const retryAfter = await checkRateLimit(env.CF_DNS_KV, ip, url.pathname);
    if (retryAfter) {
        return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) }
        });
    }

    // Skip auth for public APIs
    if (url.pathname === '/api/login' || url.pathname === '/api/setup-account' || url.pathname === '/api/register' || url.pathname === '/api/public-settings'
        || url.pathname === '/api/passkey/login-options' || url.pathname === '/api/passkey/login-verify'
        || url.pathname === '/api/refresh' || url.pathname === '/api/verify-totp') {
        return next();
    }

    // Get tokens from headers
    const clientToken = request.headers.get('X-Cloudflare-Token');
    const authHeader = request.headers.get('Authorization');

    // Priority 1: Client Mode (Token provided directly by user)
    if (clientToken) {
        context.data.cfToken = clientToken;
        return next();
    }

    // Priority 2: Server Mode (JWT provided)
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const serverSecret = env.APP_PASSWORD;

        if (!serverSecret) {
            return new Response(JSON.stringify({ error: 'Server-side Managed Mode is not configured (missing APP_PASSWORD).' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
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
                    return new Response(JSON.stringify({ error: 'Admin access required.' }), {
                        status: 403,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }

            // Admin routes, settings, account management, and passkey management don't need a CF token
            if (url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/account/') || url.pathname.startsWith('/api/passkey/')) {
                return next();
            }

            // Resolve CF token from per-user storage
            const accountIndex = parseInt(request.headers.get('X-Managed-Account-Index') || '0');
            let serverToken = null;

            if (env.CF_DNS_KV) {
                const tokensJson = await env.CF_DNS_KV.get(`USER_TOKENS:${username}`);
                if (tokensJson) {
                    const tokens = JSON.parse(tokensJson);
                    const entry = tokens.find(t => t.id === accountIndex);
                    if (entry) serverToken = entry.token;
                }
            }

            // Fallback: env vars (for backward compat, admin only)
            if (!serverToken && username === 'admin') {
                serverToken = accountIndex > 0 ? env[`CF_API_TOKEN${accountIndex}`] : env.CF_API_TOKEN;
            }

            if (!serverToken) {
                return new Response(JSON.stringify({ error: 'Selected managed account is not configured.' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            context.data.cfToken = serverToken;
            return next();
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Invalid or expired session.', message: e.message }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // No valid auth method found
    return new Response(JSON.stringify({
        error: 'Authentication Required',
        message: 'Please provide either X-Cloudflare-Token or a valid Authorization header.'
    }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
    });
}
