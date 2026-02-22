import { SignJWT, jwtVerify } from 'jose';

export async function onRequestPost(context) {
    const { request, env } = context;
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
        return new Response(JSON.stringify({ error: 'Refresh token required.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    const serverPassword = env.APP_PASSWORD;
    if (!serverPassword) {
        return new Response(JSON.stringify({ error: 'Server not configured.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    const kv = env.CF_DNS_KV;

    try {
        const secret = new TextEncoder().encode(serverPassword);
        const { payload } = await jwtVerify(refreshToken, secret);

        if (payload.type !== 'refresh') {
            return new Response(JSON.stringify({ error: 'Invalid token type.' }), {
                status: 401, headers: { 'Content-Type': 'application/json' }
            });
        }

        // Check if refresh token is revoked
        if (kv) {
            const revoked = await kv.get(`REVOKED_RT:${payload.jti}`);
            if (revoked) {
                return new Response(JSON.stringify({ error: 'Token has been revoked.' }), {
                    status: 401, headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Verify user still exists and is active
        const username = payload.sub;
        if (username !== 'admin' && kv) {
            const userData = await kv.get(`USER:${username}`);
            if (!userData) {
                return new Response(JSON.stringify({ error: 'User no longer exists.' }), {
                    status: 401, headers: { 'Content-Type': 'application/json' }
                });
            }
            const user = JSON.parse(userData);
            if (user.status === 'pending') {
                return new Response(JSON.stringify({ error: 'Account not active.' }), {
                    status: 401, headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Issue new access token (15 min)
        const accessToken = await new SignJWT({ sub: username, role: payload.role })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('15m')
            .sign(secret);

        // Load accounts
        let accounts = [];
        if (kv) {
            const tokensJson = await kv.get(`USER_TOKENS:${username}`);
            if (tokensJson) {
                const tokens = JSON.parse(tokensJson);
                accounts = tokens.map(t => { const tp = t.type || (t.email ? 'global_key' : 'api_token'); return { id: t.id, name: t.name, type: tp, hint: tp === 'global_key' ? (t.email || '') : (t.token ? '…' + t.token.slice(-4) : '') }; });
            }
        }

        // Fallback: env var accounts for admin
        if (accounts.length === 0 && username === 'admin') {
            for (let i = 0; i < 10; i++) {
                const envToken = i === 0 ? env.CF_API_TOKEN : env[`CF_API_TOKEN${i}`];
                const envEmail = i === 0 ? env.CF_API_EMAIL : env[`CF_API_EMAIL${i}`];
                const envKey = i === 0 ? env.CF_GLOBAL_API_KEY : env[`CF_GLOBAL_API_KEY${i}`];
                if (envEmail && (envKey || envToken)) {
                    accounts.push({ id: i, name: envEmail, type: 'global_key', hint: envEmail });
                } else if (envToken) {
                    accounts.push({ id: i, name: `API Token ${i}`, type: 'api_token', hint: '…' + envToken.slice(-4) });
                } else {
                    break;
                }
            }
        }

        return new Response(JSON.stringify({
            token: accessToken,
            accounts,
            role: payload.role,
            username
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid or expired refresh token.' }), {
            status: 401, headers: { 'Content-Type': 'application/json' }
        });
    }
}
