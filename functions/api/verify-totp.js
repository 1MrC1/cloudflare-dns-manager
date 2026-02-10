// Public endpoint: verify TOTP code after login when 2FA is required.
// Re-authenticates password + TOTP, then issues JWT + refresh token.

import { SignJWT } from 'jose';
import { hashPassword, verifyPassword, isLegacyHash } from './_crypto.js';
import { verifyTOTP } from './_totp.js';
import { logAudit } from './_audit.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SEC = 900; // 15 minutes

async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkLockout(kv, username) {
    if (!kv) return null;
    const raw = await kv.get(`LOGIN_ATTEMPTS:${username}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.count >= MAX_ATTEMPTS) {
        const elapsed = (Date.now() - data.lastAttempt) / 1000;
        if (elapsed < LOCKOUT_SEC) {
            return Math.ceil(LOCKOUT_SEC - elapsed);
        }
        await kv.delete(`LOGIN_ATTEMPTS:${username}`);
        return null;
    }
    return null;
}

async function recordFailedAttempt(kv, username) {
    if (!kv) return;
    const key = `LOGIN_ATTEMPTS:${username}`;
    const raw = await kv.get(key);
    let data = raw ? JSON.parse(raw) : { count: 0 };
    data.count++;
    data.lastAttempt = Date.now();
    await kv.put(key, JSON.stringify(data), { expirationTtl: LOCKOUT_SEC * 2 });
}

async function resetAttempts(kv, username) {
    if (!kv) return;
    await kv.delete(`LOGIN_ATTEMPTS:${username}`);
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const body = await request.json();
    const { username, password, code } = body;

    const serverPassword = env.APP_PASSWORD;
    if (!serverPassword) {
        return new Response(JSON.stringify({ error: 'Server is not configured for password login.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const loginUsername = username || 'admin';
    const kv = env.CF_DNS_KV;

    if (!code) {
        return new Response(JSON.stringify({ error: 'TOTP code is required.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Check account lockout
    const lockoutRemaining = await checkLockout(kv, loginUsername);
    if (lockoutRemaining) {
        return new Response(JSON.stringify({
            error: `Account temporarily locked. Try again in ${Math.ceil(lockoutRemaining / 60)} minute(s).`,
            lockedUntil: lockoutRemaining
        }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': String(lockoutRemaining) }
        });
    }

    // ── Re-authenticate password ────────────────────────────────────────────

    let authenticated = false;
    let role = 'user';
    let totpSecret = null;

    if (loginUsername === 'admin') {
        const serverPasswordHash = await sha256(serverPassword);
        if (password === serverPasswordHash) {
            authenticated = true;
            role = 'admin';
        }
        // Admin TOTP secret is stored in a dedicated key
        if (kv) {
            totpSecret = await kv.get('TOTP_SECRET:admin');
        }
    } else {
        if (kv) {
            const userData = await kv.get(`USER:${loginUsername}`);
            if (userData) {
                const user = JSON.parse(userData);
                if (user.status === 'pending') {
                    return new Response(JSON.stringify({ error: 'Account not set up yet.' }), {
                        status: 403,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                if (isLegacyHash(user.passwordHash)) {
                    if (password === user.passwordHash) {
                        authenticated = true;
                        role = user.role || 'user';
                        // Migrate to PBKDF2
                        user.passwordHash = await hashPassword(password);
                        await kv.put(`USER:${loginUsername}`, JSON.stringify(user));
                    }
                } else {
                    if (await verifyPassword(password, user.passwordHash)) {
                        authenticated = true;
                        role = user.role || 'user';
                    }
                }

                totpSecret = user.totpSecret || null;
            }
        }
    }

    if (!authenticated) {
        await recordFailedAttempt(kv, loginUsername);
        return new Response(JSON.stringify({ error: 'Invalid username or password.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // ── Verify TOTP ─────────────────────────────────────────────────────────

    if (!totpSecret) {
        // TOTP is not enabled — this endpoint should not have been called.
        return new Response(JSON.stringify({ error: 'TOTP is not enabled for this account.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const totpValid = await verifyTOTP(totpSecret, String(code));
    if (!totpValid) {
        await recordFailedAttempt(kv, loginUsername);
        return new Response(JSON.stringify({ error: 'Invalid TOTP code.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // ── Issue tokens (same logic as login.js success path) ──────────────────

    await resetAttempts(kv, loginUsername);

    const secret = new TextEncoder().encode(serverPassword);
    const jti = crypto.randomUUID();

    const jwt = await new SignJWT({ sub: loginUsername, role })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(secret);

    const refreshToken = await new SignJWT({ sub: loginUsername, role, type: 'refresh', jti })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(secret);

    // Load user's accounts
    let accounts = [];

    if (loginUsername === 'admin') {
        // Inline the same migration/fallback logic from login.js
        if (kv) {
            const tokensJson = await kv.get('USER_TOKENS:admin');
            if (tokensJson) {
                const tokens = JSON.parse(tokensJson);
                accounts = tokens.map(t => ({ id: t.id, name: t.name }));
            }
        }
        if (accounts.length === 0) {
            // Fallback: env-based tokens
            const tokens = [];
            if (env.CF_API_TOKEN) {
                tokens.push({ id: 0, name: 'Default Account' });
            }
            let i = 1;
            while (env[`CF_API_TOKEN${i}`]) {
                tokens.push({ id: i, name: `Account ${i}` });
                i++;
            }
            accounts = tokens;
        }
    } else if (kv) {
        const tokensJson = await kv.get(`USER_TOKENS:${loginUsername}`);
        if (tokensJson) {
            const tokens = JSON.parse(tokensJson);
            accounts = tokens.map(t => ({ id: t.id, name: t.name }));
        }
    }

    await logAudit(kv, loginUsername, 'auth.login', 'Logged in successfully (with TOTP)');

    return new Response(JSON.stringify({ token: jwt, refreshToken, accounts, role, username: loginUsername }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
