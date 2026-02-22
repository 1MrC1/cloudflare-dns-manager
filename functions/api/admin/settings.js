// Per-user token management (accessible by all authenticated users)

// GET: List user's configured token slots, or retrieve a specific token value
export async function onRequestGet(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;
    const url = new URL(context.request.url);
    const retrieveIndex = url.searchParams.get('retrieve');

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Determine target user (admin can query other users)
    const user = context.data.user || { username: 'admin', role: 'admin' };
    const targetUser = url.searchParams.get('user');
    const username = (targetUser && user.role === 'admin') ? targetUser : user.username;

    const tokensJson = await kv.get(`USER_TOKENS:${username}`);
    const tokens = tokensJson ? JSON.parse(tokensJson) : [];

    // If ?retrieve=N is set, return the actual token value
    if (retrieveIndex !== null) {
        const idx = parseInt(retrieveIndex);
        const entry = tokens.find(t => t.id === idx);
        if (!entry) {
            return new Response(JSON.stringify({ error: 'Token not found.' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response(JSON.stringify({ token: entry.token }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Otherwise list all accounts (without actual token values)
    const accounts = tokens.map(t => {
        const tp = t.type || (t.email ? 'global_key' : 'api_token');
        return { id: t.id, name: t.name, type: tp, source: 'kv', hint: tp === 'global_key' ? (t.email || '') : (t.token ? '…' + t.token.slice(-4) : '') };
    });

    // Fallback: if no KV tokens and user is admin, auto-detect env var accounts
    if (accounts.length === 0 && username === 'admin') {
        for (let i = 0; i < 10; i++) {
            const envToken = i === 0 ? env.CF_API_TOKEN : env[`CF_API_TOKEN${i}`];
            const envEmail = i === 0 ? env.CF_API_EMAIL : env[`CF_API_EMAIL${i}`];
            const envKey = i === 0 ? env.CF_GLOBAL_API_KEY : env[`CF_GLOBAL_API_KEY${i}`];
            if (envEmail && (envKey || envToken)) {
                accounts.push({ id: i, name: envEmail, type: 'global_key', source: 'env', hint: envEmail });
            } else if (envToken) {
                accounts.push({ id: i, name: `API Token ${i}`, type: 'api_token', source: 'env', hint: '…' + envToken.slice(-4) });
            } else {
                break;
            }
        }
    }

    return new Response(JSON.stringify({ accounts }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// POST: Save a CF API Token or Global API Key to user's token list
export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const user = context.data.user || { username: 'admin', role: 'admin' };
    const body = await context.request.json();
    const { token, accountIndex, name, type, email, key } = body;

    // Admin can manage other users' tokens
    const targetUser = body.user;
    const username = (targetUser && user.role === 'admin') ? targetUser : user.username;

    const isGlobalKey = type === 'global_key';

    if (isGlobalKey) {
        // Global API Key requires email and key
        if (!email || email.trim() === '' || !key || key.trim() === '') {
            return new Response(JSON.stringify({ error: 'Email and Global API Key are required.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Verify the Global API Key via user endpoint
        const verifyRes = await fetch('https://api.cloudflare.com/client/v4/user', {
            headers: {
                'X-Auth-Email': email,
                'X-Auth-Key': key,
                'Content-Type': 'application/json'
            }
        });
        const verifyData = await verifyRes.json();

        if (!verifyData.success) {
            return new Response(JSON.stringify({ error: 'Invalid Global API Key or email.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } else {
        // API Token mode
        if (!token || token.trim() === '') {
            return new Response(JSON.stringify({ error: 'Token is required.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Verify the token is valid before saving
        const verifyRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const verifyData = await verifyRes.json();

        if (!verifyData.success || !verifyData.result || verifyData.result.status !== 'active') {
            return new Response(JSON.stringify({ error: 'Invalid or inactive token.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // Read existing tokens
    const tokensJson = await kv.get(`USER_TOKENS:${username}`);
    const tokens = tokensJson ? JSON.parse(tokensJson) : [];

    const idx = accountIndex != null ? parseInt(accountIndex) : 0;
    const entryName = (name && name.trim()) ? name.trim() : `Account ${idx}`;

    // Build the entry based on type
    let newEntry;
    if (isGlobalKey) {
        newEntry = { id: idx, name: entryName, email, key, type: 'global_key' };
    } else {
        newEntry = { id: idx, name: entryName, token, type: 'api_token' };
    }

    // Update existing or add new
    const existing = tokens.findIndex(t => t.id === idx);
    if (existing >= 0) {
        tokens[existing] = newEntry;
    } else {
        tokens.push(newEntry);
    }

    await kv.put(`USER_TOKENS:${username}`, JSON.stringify(tokens));

    return new Response(JSON.stringify({ success: true, message: 'Token saved.', id: idx }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// DELETE: Remove a token from user's token list
export async function onRequestDelete(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const user = context.data.user || { username: 'admin', role: 'admin' };
    const url = new URL(context.request.url);
    const accountIndex = parseInt(url.searchParams.get('index') || '0');

    // Admin can manage other users' tokens
    const targetUser = url.searchParams.get('user');
    const username = (targetUser && user.role === 'admin') ? targetUser : user.username;

    const tokensJson = await kv.get(`USER_TOKENS:${username}`);
    const tokens = tokensJson ? JSON.parse(tokensJson) : [];

    const filtered = tokens.filter(t => t.id !== accountIndex);
    await kv.put(`USER_TOKENS:${username}`, JSON.stringify(filtered));

    return new Response(JSON.stringify({ success: true, message: 'Token removed.' }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
