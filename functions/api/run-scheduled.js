// Run Scheduled DNS Changes
// POST /api/run-scheduled — execute pending scheduled changes that are due
// Can be called by a Cron Trigger or manually by an admin

export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const now = Date.now();
    const results = [];
    const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

    // List all SCHEDULED_CHANGES:* keys
    const listResult = await kv.list({ prefix: 'SCHEDULED_CHANGES:' });
    const keys = listResult.keys || [];

    for (const keyEntry of keys) {
        const key = keyEntry.name;
        const username = key.replace('SCHEDULED_CHANGES:', '');

        const raw = await kv.get(key);
        if (!raw) continue;

        let changes;
        try {
            changes = JSON.parse(raw);
        } catch {
            continue;
        }

        let modified = false;

        for (const change of changes) {
            if (change.status !== 'pending') continue;

            const scheduledTime = new Date(change.scheduledAt).getTime();
            if (isNaN(scheduledTime) || scheduledTime > now) continue;

            // Time to execute this change
            // Resolve the CF token for this user
            let cfToken = null;
            const accountIndex = change.accountIndex || 0;

            const tokensJson = await kv.get(`USER_TOKENS:${username}`);
            if (tokensJson) {
                const tokens = JSON.parse(tokensJson);
                const entry = tokens.find(t => t.id === accountIndex);
                if (entry) cfToken = entry.token;
            }

            // Fallback: env vars (for admin)
            if (!cfToken && username === 'admin') {
                cfToken = accountIndex > 0 ? env[`CF_API_TOKEN${accountIndex}`] : env.CF_API_TOKEN;
            }

            if (!cfToken) {
                change.status = 'failed';
                change.error = 'Could not resolve CF API token for this user/account.';
                change.executedAt = new Date().toISOString();
                modified = true;
                results.push({ id: change.id, username, status: 'failed', error: change.error });
                continue;
            }

            try {
                let apiResult;

                if (change.action === 'create') {
                    apiResult = await executeCfApi(
                        `https://api.cloudflare.com/client/v4/zones/${change.zoneId}/dns_records`,
                        'POST',
                        cfToken,
                        change.record
                    );
                } else if (change.action === 'update') {
                    apiResult = await executeCfApi(
                        `https://api.cloudflare.com/client/v4/zones/${change.zoneId}/dns_records/${change.recordId}`,
                        'PATCH',
                        cfToken,
                        change.record
                    );
                } else if (change.action === 'delete') {
                    apiResult = await executeCfApi(
                        `https://api.cloudflare.com/client/v4/zones/${change.zoneId}/dns_records/${change.recordId}`,
                        'DELETE',
                        cfToken,
                        null
                    );
                }

                if (apiResult.success) {
                    change.status = 'completed';
                    change.executedAt = new Date().toISOString();
                    results.push({ id: change.id, username, status: 'completed' });
                } else {
                    change.status = 'failed';
                    change.error = apiResult.errors?.[0]?.message || 'Cloudflare API error';
                    change.executedAt = new Date().toISOString();
                    results.push({ id: change.id, username, status: 'failed', error: change.error });
                }
            } catch (err) {
                change.status = 'failed';
                change.error = err.message || 'Unknown execution error';
                change.executedAt = new Date().toISOString();
                results.push({ id: change.id, username, status: 'failed', error: change.error });
            }

            modified = true;
        }

        // Clean up completed/failed entries older than 24h
        const before = changes.length;
        const filtered = changes.filter(c => {
            if (c.status === 'pending') return true;
            if (c.executedAt) {
                const executedTime = new Date(c.executedAt).getTime();
                if (now - executedTime > CLEANUP_AGE_MS) return false;
            }
            return true;
        });

        if (filtered.length !== before) modified = true;

        if (modified) {
            if (filtered.length === 0) {
                await kv.delete(key);
            } else {
                await kv.put(key, JSON.stringify(filtered));
            }
        }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

async function executeCfApi(url, method, cfToken, body) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${cfToken}`,
            'Content-Type': 'application/json'
        }
    };
    if (body && method !== 'DELETE') {
        options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    return await res.json();
}
