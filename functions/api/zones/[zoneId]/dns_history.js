import { logAudit } from '../../_audit.js';
import { saveSnapshot } from '../../_snapshot.js';
import { fireWebhook } from '../../_webhook.js';

// Compute diff between two sets of DNS records.
// Records are keyed by type+name. Returns { added, removed, modified }.
function computeDiff(fromRecords, toRecords) {
    const makeKey = (r) => `${r.type}::${r.name}`;

    // Build maps: key -> array of records (multiple records can share type+name)
    const fromMap = new Map();
    for (const rec of fromRecords) {
        const k = makeKey(rec);
        if (!fromMap.has(k)) fromMap.set(k, []);
        fromMap.get(k).push(rec);
    }

    const toMap = new Map();
    for (const rec of toRecords) {
        const k = makeKey(rec);
        if (!toMap.has(k)) toMap.set(k, []);
        toMap.get(k).push(rec);
    }

    const added = [];
    const removed = [];
    const modified = [];

    const allKeys = new Set([...fromMap.keys(), ...toMap.keys()]);

    for (const key of allKeys) {
        const fromRecs = fromMap.get(key) || [];
        const toRecs = toMap.get(key) || [];

        if (fromRecs.length === 0) {
            // All records with this key are new
            for (const rec of toRecs) {
                added.push({ type: rec.type, name: rec.name, content: rec.content, ttl: rec.ttl, proxied: rec.proxied, priority: rec.priority });
            }
        } else if (toRecs.length === 0) {
            // All records with this key were removed
            for (const rec of fromRecs) {
                removed.push({ type: rec.type, name: rec.name, content: rec.content, ttl: rec.ttl, proxied: rec.proxied, priority: rec.priority });
            }
        } else {
            // Match records by content to find modifications
            const fromContents = new Map();
            for (const rec of fromRecs) {
                fromContents.set(rec.content, rec);
            }
            const toContents = new Map();
            for (const rec of toRecs) {
                toContents.set(rec.content, rec);
            }

            // Records in 'to' but not in 'from' by content
            for (const [content, rec] of toContents) {
                if (!fromContents.has(content)) {
                    // Check if there's an unmatched 'from' record to pair as modified
                    let paired = false;
                    for (const [fContent, fRec] of fromContents) {
                        if (!toContents.has(fContent)) {
                            // Pair as modified
                            const pick = (r) => ({ type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: r.proxied, priority: r.priority });
                            modified.push({ before: pick(fRec), after: pick(rec) });
                            fromContents.delete(fContent);
                            paired = true;
                            break;
                        }
                    }
                    if (!paired) {
                        added.push({ type: rec.type, name: rec.name, content: rec.content, ttl: rec.ttl, proxied: rec.proxied, priority: rec.priority });
                    }
                } else {
                    // Same content exists in both — check if ttl/proxied differ
                    const fRec = fromContents.get(content);
                    if (fRec.ttl !== rec.ttl || fRec.proxied !== rec.proxied || fRec.priority !== rec.priority) {
                        const pick = (r) => ({ type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: r.proxied, priority: r.priority });
                        modified.push({ before: pick(fRec), after: pick(rec) });
                    }
                    // else identical, skip
                }
            }

            // Records in 'from' not matched at all
            for (const [fContent, fRec] of fromContents) {
                if (!toContents.has(fContent)) {
                    // Check it wasn't already paired above
                    const alreadyPaired = modified.some(m => m.before.content === fContent && m.before.type === fRec.type && m.before.name === fRec.name);
                    if (!alreadyPaired) {
                        removed.push({ type: fRec.type, name: fRec.name, content: fRec.content, ttl: fRec.ttl, proxied: fRec.proxied, priority: fRec.priority });
                    }
                }
            }
        }
    }

    return { added, removed, modified };
}

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
    const action = url.searchParams.get('action');

    // Handle diff action: ?action=diff&from=KEY1&to=KEY2
    // 'to' can be the literal string "live" to compare against current live records
    if (action === 'diff') {
        const fromKey = url.searchParams.get('from');
        const toKey = url.searchParams.get('to');

        if (!fromKey || !toKey) {
            return new Response(JSON.stringify({ error: 'Both "from" and "to" parameters are required.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Load 'from' snapshot
        const fromRaw = await kv.get(fromKey);
        if (!fromRaw) {
            return new Response(JSON.stringify({ error: 'Source snapshot not found.' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const fromSnapshot = JSON.parse(fromRaw);
        const fromRecords = fromSnapshot.records || [];

        let toRecords;
        if (toKey === 'live') {
            // Fetch current live DNS records from Cloudflare
            const { cfToken } = context.data;
            const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=1000`, {
                headers: {
                    'Authorization': `Bearer ${cfToken}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();
            if (!data.success) {
                return new Response(JSON.stringify({ error: 'Failed to fetch current DNS records.', details: data.errors }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            toRecords = data.result || [];
        } else {
            const toRaw = await kv.get(toKey);
            if (!toRaw) {
                return new Response(JSON.stringify({ error: 'Target snapshot not found.' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            const toSnapshot = JSON.parse(toRaw);
            toRecords = toSnapshot.records || [];
        }

        const diff = computeDiff(fromRecords, toRecords);

        return new Response(JSON.stringify({ diff }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

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

    // Parse pagination params
    const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
    const per_page = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page')) || 10));

    // Try to read from the snapshot list index first
    const listKey = `DNS_SNAPSHOTS:${zoneId}`;
    let snapshots = [];
    const rawList = await kv.get(listKey);

    if (rawList) {
        try {
            snapshots = JSON.parse(rawList);
        } catch (e) { snapshots = []; }
    }

    // Fallback: if no index exists, build from KV prefix scan
    if (snapshots.length === 0) {
        const list = await kv.list({ prefix: `DNS_SNAPSHOT:${zoneId}:` });
        for (const key of list.keys) {
            const parts = key.name.split(':');
            const timestamp = parts.slice(2).join(':');
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
                    snapshots.push({ key: key.name, timestamp, username: 'unknown', action: 'unknown' });
                }
            }
        }
    }

    // Sort by timestamp descending (newest first)
    snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const total = snapshots.length;
    const total_pages = Math.max(1, Math.ceil(total / per_page));
    const start = (page - 1) * per_page;
    const paginated = snapshots.slice(start, start + per_page);

    return new Response(JSON.stringify({ snapshots: paginated, total, page, per_page, total_pages }), {
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
