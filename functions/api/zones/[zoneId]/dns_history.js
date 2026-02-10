import { logAudit } from '../../_audit.js';
import { saveSnapshot } from '../../_snapshot.js';
import { fireWebhook } from '../../_webhook.js';

// GET: List snapshots for a zone, or return full snapshot for rollback preview
export async function onRequestGet(context) {
    const { zoneId } = context.params;
    const kv = context.env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const url = new URL(context.request.url);
    const fullKey = url.searchParams.get('full');

    // If ?full={key} is provided, return the complete snapshot with records
    if (fullKey) {
        const raw = await kv.get(fullKey);
        if (!raw) {
            return new Response(JSON.stringify({ error: 'Snapshot not found.' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const snapshot = JSON.parse(raw);
        return new Response(JSON.stringify({ snapshot }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // List all snapshots (metadata only)
    const list = await kv.list({ prefix: `DNS_SNAPSHOT:${zoneId}:` });
    const snapshots = [];

    for (const key of list.keys) {
        // Extract timestamp from key: DNS_SNAPSHOT:{zoneId}:{timestamp}
        const parts = key.name.split(':');
        const timestamp = parts.slice(2).join(':'); // rejoin in case ISO timestamp contains colons

        // We need to read metadata from the snapshot value
        const raw = await kv.get(key.name);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                snapshots.push({
                    key: key.name,
                    timestamp: data.timestamp,
                    username: data.username,
                    action: data.action
                });
            } catch (e) {
                snapshots.push({
                    key: key.name,
                    timestamp,
                    username: 'unknown',
                    action: 'unknown'
                });
            }
        }
    }

    // Sort by timestamp descending (newest first)
    snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return new Response(JSON.stringify({ snapshots }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// POST: Rollback to a snapshot
export async function onRequestPost(context) {
    const { cfToken } = context.data;
    const { zoneId } = context.params;
    const kv = context.env.CF_DNS_KV;
    const username = context.data.user?.username || 'client';

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const body = await context.request.json();
    const { snapshotKey } = body;

    if (!snapshotKey) {
        return new Response(JSON.stringify({ error: 'snapshotKey is required.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Fetch the target snapshot
    const raw = await kv.get(snapshotKey);
    if (!raw) {
        return new Response(JSON.stringify({ error: 'Snapshot not found.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const snapshot = JSON.parse(raw);
    const targetRecords = snapshot.records || [];

    // Snapshot current state before rollback
    await saveSnapshot(kv, zoneId, username, 'dns.rollback', cfToken);

    // Fetch current records
    const currentRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=1000`, {
        headers: {
            'Authorization': `Bearer ${cfToken}`,
            'Content-Type': 'application/json'
        }
    });
    const currentData = await currentRes.json();
    if (!currentData.success) {
        return new Response(JSON.stringify({ error: 'Failed to fetch current DNS records.', details: currentData.errors }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const currentRecords = currentData.result || [];

    // Build maps for diffing
    const currentMap = new Map();
    for (const rec of currentRecords) {
        currentMap.set(rec.id, rec);
    }

    const targetMap = new Map();
    for (const rec of targetRecords) {
        targetMap.set(rec.id, rec);
    }

    const results = { deleted: 0, created: 0, updated: 0, errors: [] };
    const cfHeaders = {
        'Authorization': `Bearer ${cfToken}`,
        'Content-Type': 'application/json'
    };

    // Delete records that exist now but not in the snapshot
    for (const [id, rec] of currentMap) {
        if (!targetMap.has(id)) {
            const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${id}`, {
                method: 'DELETE',
                headers: cfHeaders
            });
            const d = await res.json();
            if (d.success) {
                results.deleted++;
            } else {
                results.errors.push({ action: 'delete', id, errors: d.errors });
            }
        }
    }

    // Create records that exist in snapshot but not currently
    for (const [id, rec] of targetMap) {
        if (!currentMap.has(id)) {
            const createBody = {
                type: rec.type,
                name: rec.name,
                content: rec.content,
                ttl: rec.ttl,
                proxied: rec.proxied
            };
            // Include priority for MX/SRV records
            if (rec.priority !== undefined) {
                createBody.priority = rec.priority;
            }
            // Include data for SRV/CAA/etc records
            if (rec.data) {
                createBody.data = rec.data;
            }
            const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
                method: 'POST',
                headers: cfHeaders,
                body: JSON.stringify(createBody)
            });
            const d = await res.json();
            if (d.success) {
                results.created++;
            } else {
                results.errors.push({ action: 'create', record: createBody, errors: d.errors });
            }
        }
    }

    // Update records that exist in both but differ
    for (const [id, targetRec] of targetMap) {
        if (currentMap.has(id)) {
            const currentRec = currentMap.get(id);
            // Check if record needs updating
            const needsUpdate =
                currentRec.type !== targetRec.type ||
                currentRec.name !== targetRec.name ||
                currentRec.content !== targetRec.content ||
                currentRec.ttl !== targetRec.ttl ||
                currentRec.proxied !== targetRec.proxied ||
                currentRec.priority !== targetRec.priority;

            if (needsUpdate) {
                const updateBody = {
                    type: targetRec.type,
                    name: targetRec.name,
                    content: targetRec.content,
                    ttl: targetRec.ttl,
                    proxied: targetRec.proxied
                };
                if (targetRec.priority !== undefined) {
                    updateBody.priority = targetRec.priority;
                }
                if (targetRec.data) {
                    updateBody.data = targetRec.data;
                }
                const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${id}`, {
                    method: 'PUT',
                    headers: cfHeaders,
                    body: JSON.stringify(updateBody)
                });
                const d = await res.json();
                if (d.success) {
                    results.updated++;
                } else {
                    results.errors.push({ action: 'update', id, errors: d.errors });
                }
            }
        }
    }

    await logAudit(kv, username, 'dns.rollback', `Rolled back zone ${zoneId} to snapshot ${snapshot.timestamp} (deleted: ${results.deleted}, created: ${results.created}, updated: ${results.updated})`);
    await fireWebhook(kv, {
        type: 'dns.rollback',
        username,
        detail: `Rolled back zone ${zoneId} to snapshot ${snapshot.timestamp} (deleted: ${results.deleted}, created: ${results.created}, updated: ${results.updated})`
    });

    return new Response(JSON.stringify({ success: true, results }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
