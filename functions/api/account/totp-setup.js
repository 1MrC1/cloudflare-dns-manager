// TOTP setup / teardown for authenticated users.

import {
    generateTOTPSecret,
    verifyTOTP,
    generateOTPAuthURI
} from '../_totp.js';
import { logAudit } from '../_audit.js';

const ISSUER = 'CF-DNS-Manager';
const PENDING_TTL = 600; // 10 minutes

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function getUser(context) {
    const user = context.data.user;
    if (!user || !user.username) return null;
    return user;
}

// ── GET — generate a new TOTP secret and store it as pending ────────────────

export async function onRequestGet(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) return jsonResponse({ error: 'KV storage not configured.' }, 500);

    const user = getUser(context);
    if (!user) return jsonResponse({ error: 'Authentication required.' }, 401);

    const username = user.username;

    const secret = generateTOTPSecret();

    // Store pending secret with 10-minute TTL
    await kv.put(`TOTP_PENDING:${username}`, secret, { expirationTtl: PENDING_TTL });

    const uri = generateOTPAuthURI(secret, username, ISSUER);

    return jsonResponse({ secret, uri });
}

// ── POST — confirm TOTP setup by verifying the code ─────────────────────────

export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) return jsonResponse({ error: 'KV storage not configured.' }, 500);

    const user = getUser(context);
    if (!user) return jsonResponse({ error: 'Authentication required.' }, 401);

    const username = user.username;

    const body = await context.request.json();
    const { code } = body;

    if (!code) return jsonResponse({ error: 'TOTP code is required.' }, 400);

    // Retrieve pending secret
    const pendingSecret = await kv.get(`TOTP_PENDING:${username}`);
    if (!pendingSecret) {
        return jsonResponse({ error: 'No pending TOTP setup found. Please start setup again.' }, 400);
    }

    // Verify the code
    const valid = await verifyTOTP(pendingSecret, String(code));
    if (!valid) {
        return jsonResponse({ error: 'Invalid TOTP code. Please try again.' }, 400);
    }

    // Persist secret into user data
    if (username === 'admin') {
        // Admin user doesn't have a USER:{username} record by default,
        // so store the TOTP secret in a dedicated key.
        await kv.put('TOTP_SECRET:admin', pendingSecret);
    } else {
        const dataJson = await kv.get(`USER:${username}`);
        if (!dataJson) {
            return jsonResponse({ error: 'User not found.' }, 404);
        }
        const userData = JSON.parse(dataJson);
        userData.totpSecret = pendingSecret;
        await kv.put(`USER:${username}`, JSON.stringify(userData));
    }

    // Clean up pending
    await kv.delete(`TOTP_PENDING:${username}`);

    await logAudit(kv, username, 'totp.enable', 'TOTP two-factor authentication enabled');

    return jsonResponse({ success: true });
}

// ── DELETE — disable TOTP (requires a valid code to confirm) ────────────────

export async function onRequestDelete(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) return jsonResponse({ error: 'KV storage not configured.' }, 500);

    const user = getUser(context);
    if (!user) return jsonResponse({ error: 'Authentication required.' }, 401);

    const username = user.username;

    const body = await context.request.json();
    const { code } = body;

    if (!code) return jsonResponse({ error: 'TOTP code is required.' }, 400);

    // Get the stored TOTP secret
    let totpSecret = null;

    if (username === 'admin') {
        totpSecret = await kv.get('TOTP_SECRET:admin');
    } else {
        const dataJson = await kv.get(`USER:${username}`);
        if (!dataJson) {
            return jsonResponse({ error: 'User not found.' }, 404);
        }
        const userData = JSON.parse(dataJson);
        totpSecret = userData.totpSecret || null;
    }

    if (!totpSecret) {
        return jsonResponse({ error: 'TOTP is not enabled for this account.' }, 400);
    }

    const valid = await verifyTOTP(totpSecret, String(code));
    if (!valid) {
        return jsonResponse({ error: 'Invalid TOTP code.' }, 403);
    }

    // Remove secret from user data
    if (username === 'admin') {
        await kv.delete('TOTP_SECRET:admin');
    } else {
        const dataJson = await kv.get(`USER:${username}`);
        if (dataJson) {
            const userData = JSON.parse(dataJson);
            delete userData.totpSecret;
            await kv.put(`USER:${username}`, JSON.stringify(userData));
        }
    }

    await logAudit(kv, username, 'totp.disable', 'TOTP two-factor authentication disabled');

    return jsonResponse({ success: true });
}
