// User management API (admin only, enforced by middleware)
import { logAudit } from '../_audit.js';
import { fireWebhook } from '../_webhook.js';

function generateSetupToken() {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// GET: List all users
export async function onRequestGet(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const users = [{ username: 'admin', role: 'admin', status: 'active', createdAt: null }];

    const listJson = await kv.get('USER_LIST');
    const userList = listJson ? JSON.parse(listJson) : [];

    for (const uname of userList) {
        const dataJson = await kv.get(`USER:${uname}`);
        if (dataJson) {
            const data = JSON.parse(dataJson);
            users.push({
                username: data.username,
                role: data.role,
                status: data.status || 'active',
                createdAt: data.createdAt,
                hasSetupToken: !!data.setupToken
            });
        }
    }

    return new Response(JSON.stringify({ users }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// POST: Create a new user (no password — generates setup token)
export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const body = await context.request.json();
    const { username, role } = body;

    if (!username || !username.trim()) {
        return new Response(JSON.stringify({ error: 'Username is required.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const cleanUsername = username.trim().toLowerCase();

    if (cleanUsername === 'admin') {
        return new Response(JSON.stringify({ error: 'Cannot create user with username "admin".' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!/^[a-z0-9_-]+$/.test(cleanUsername)) {
        return new Response(JSON.stringify({ error: 'Username must contain only lowercase letters, numbers, hyphens, and underscores.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const existing = await kv.get(`USER:${cleanUsername}`);
    if (existing) {
        return new Response(JSON.stringify({ error: 'User already exists.' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const setupToken = generateSetupToken();
    const userData = {
        username: cleanUsername,
        passwordHash: null,
        setupToken,
        status: 'pending',
        role: role === 'admin' ? 'admin' : 'user',
        createdAt: new Date().toISOString()
    };

    await kv.put(`USER:${cleanUsername}`, JSON.stringify(userData));
    await kv.put(`USER_TOKENS:${cleanUsername}`, JSON.stringify([]));

    const listJson = await kv.get('USER_LIST');
    const userList = listJson ? JSON.parse(listJson) : [];
    if (!userList.includes(cleanUsername)) {
        userList.push(cleanUsername);
        await kv.put('USER_LIST', JSON.stringify(userList));
    }

    const adminUser = context.data.user?.username || 'admin';
    await logAudit(kv, adminUser, 'user.create', `Created user: ${cleanUsername} (role: ${userData.role})`);
    await fireWebhook(kv, {
        type: 'user.create',
        username: adminUser,
        detail: `Created user: ${cleanUsername} (role: ${userData.role})`
    });

    return new Response(JSON.stringify({ success: true, username: cleanUsername, setupToken }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// PUT: Update a user (role only — admin cannot change passwords)
export async function onRequestPut(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const body = await context.request.json();
    const { username, role, resetSetupToken } = body;

    if (!username || username === 'admin') {
        return new Response(JSON.stringify({ error: 'Cannot modify the admin user.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const dataJson = await kv.get(`USER:${username}`);
    if (!dataJson) {
        return new Response(JSON.stringify({ error: 'User not found.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const userData = JSON.parse(dataJson);

    if (role) {
        userData.role = role === 'admin' ? 'admin' : 'user';
    }

    // Admin can regenerate setup token (resets user to pending)
    let newSetupToken = null;
    if (resetSetupToken) {
        newSetupToken = generateSetupToken();
        userData.setupToken = newSetupToken;
        userData.passwordHash = null;
        userData.status = 'pending';
    }

    await kv.put(`USER:${username}`, JSON.stringify(userData));

    const adminUser = context.data.user?.username || 'admin';
    await logAudit(kv, adminUser, 'user.update', `Updated user: ${username}${role ? ' role=' + userData.role : ''}${resetSetupToken ? ' (reset setup token)' : ''}`);

    const resp = { success: true };
    if (newSetupToken) resp.setupToken = newSetupToken;
    return new Response(JSON.stringify(resp), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// DELETE: Delete a user
export async function onRequestDelete(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const url = new URL(context.request.url);
    const username = url.searchParams.get('username');

    if (!username || username === 'admin') {
        return new Response(JSON.stringify({ error: 'Cannot delete the admin user.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    await kv.delete(`USER:${username}`);
    await kv.delete(`USER_TOKENS:${username}`);

    const listJson = await kv.get('USER_LIST');
    const userList = listJson ? JSON.parse(listJson) : [];
    const filtered = userList.filter(u => u !== username);
    await kv.put('USER_LIST', JSON.stringify(filtered));

    const adminUser = context.data.user?.username || 'admin';
    await logAudit(kv, adminUser, 'user.delete', `Deleted user: ${username}`);
    await fireWebhook(kv, {
        type: 'user.delete',
        username: adminUser,
        detail: `Deleted user: ${username}`
    });

    return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
