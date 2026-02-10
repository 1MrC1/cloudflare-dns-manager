// Run DNS Monitors
// POST /api/run-monitors — check all enabled monitors and update statuses
// Can be called by a Cron Trigger or manually by an admin

import { fireWebhook } from './_webhook.js';
import { buildCfHeaders } from './_cf-api.js';

export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const now = new Date().toISOString();
    const results = [];

    // List all DNS_MONITORS:* keys
    const listResult = await kv.list({ prefix: 'DNS_MONITORS:' });
    const keys = listResult.keys || [];

    for (const keyEntry of keys) {
        const key = keyEntry.name;
        const username = key.replace('DNS_MONITORS:', '');

        const raw = await kv.get(key);
        if (!raw) continue;

        let monitors;
        try {
            monitors = JSON.parse(raw);
        } catch {
            continue;
        }

        let modified = false;

        // Resolve the CF token/key for this user
        let cfHeaders = null;
        let tokenEntry = null;
        const tokensJson = await kv.get(`USER_TOKENS:${username}`);
        if (tokensJson) {
            const tokens = JSON.parse(tokensJson);
            // Use the first available token (account index 0)
            tokenEntry = tokens.find(t => t.id === 0) || tokens[0];
        }

        // Fallback: env vars (for admin)
        if (!tokenEntry && username === 'admin' && env.CF_API_TOKEN) {
            tokenEntry = { token: env.CF_API_TOKEN };
        }

        if (tokenEntry) {
            cfHeaders = buildCfHeaders(tokenEntry);
        }

        if (!cfHeaders) {
            // Mark all monitors as failed due to missing token
            for (const monitor of monitors) {
                if (!monitor.enabled) continue;
                const prevStatus = monitor.lastStatus;
                monitor.lastCheck = now;
                monitor.lastStatus = 'fail';
                monitor.lastError = 'Could not resolve CF API token for this user.';
                modified = true;
                results.push({ id: monitor.id, username, status: 'fail', error: monitor.lastError });

                if (prevStatus === 'ok') {
                    await fireWebhook(kv, {
                        type: 'monitor_alert',
                        username,
                        monitor: {
                            id: monitor.id,
                            zoneName: monitor.zoneName,
                            recordType: monitor.recordType,
                            recordName: monitor.recordName,
                            expectedContent: monitor.expectedContent,
                            error: monitor.lastError
                        }
                    });
                }
            }

            if (modified) {
                await kv.put(key, JSON.stringify(monitors));
            }
            continue;
        }

        for (const monitor of monitors) {
            if (!monitor.enabled) continue;

            const prevStatus = monitor.lastStatus;

            try {
                // Fetch DNS records of the specified type and name from Cloudflare API
                const apiUrl = `https://api.cloudflare.com/client/v4/zones/${monitor.zoneId}/dns_records?type=${encodeURIComponent(monitor.recordType)}&name=${encodeURIComponent(monitor.recordName)}`;
                const res = await fetch(apiUrl, {
                    headers: {
                        ...cfHeaders,
                        'Content-Type': 'application/json'
                    }
                });

                const data = await res.json();

                if (!data.success) {
                    monitor.lastCheck = now;
                    monitor.lastStatus = 'fail';
                    monitor.lastError = data.errors?.[0]?.message || 'Cloudflare API error';
                    modified = true;
                    results.push({ id: monitor.id, username, status: 'fail', error: monitor.lastError });
                } else {
                    const records = data.result || [];
                    // Check if any record matches the expected content
                    const match = records.some(r => r.content === monitor.expectedContent);

                    monitor.lastCheck = now;
                    if (match) {
                        monitor.lastStatus = 'ok';
                        monitor.lastError = null;
                        results.push({ id: monitor.id, username, status: 'ok' });
                    } else {
                        const actualContents = records.map(r => r.content).join(', ');
                        monitor.lastStatus = 'fail';
                        monitor.lastError = records.length === 0
                            ? 'No matching DNS records found'
                            : `Expected "${monitor.expectedContent}", got "${actualContents}"`;
                        results.push({ id: monitor.id, username, status: 'fail', error: monitor.lastError });
                    }
                    modified = true;
                }

                // Fire webhook if status changed from ok to fail
                if (prevStatus === 'ok' && monitor.lastStatus === 'fail') {
                    await fireWebhook(kv, {
                        type: 'monitor_alert',
                        username,
                        monitor: {
                            id: monitor.id,
                            zoneName: monitor.zoneName,
                            recordType: monitor.recordType,
                            recordName: monitor.recordName,
                            expectedContent: monitor.expectedContent,
                            actualContent: monitor.lastError,
                            error: monitor.lastError
                        }
                    });
                }
            } catch (err) {
                monitor.lastCheck = now;
                monitor.lastStatus = 'fail';
                monitor.lastError = err.message || 'Unknown error during check';
                modified = true;
                results.push({ id: monitor.id, username, status: 'fail', error: monitor.lastError });

                if (prevStatus === 'ok') {
                    await fireWebhook(kv, {
                        type: 'monitor_alert',
                        username,
                        monitor: {
                            id: monitor.id,
                            zoneName: monitor.zoneName,
                            recordType: monitor.recordType,
                            recordName: monitor.recordName,
                            expectedContent: monitor.expectedContent,
                            error: monitor.lastError
                        }
                    });
                }
            }
        }

        if (modified) {
            await kv.put(key, JSON.stringify(monitors));
        }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}
