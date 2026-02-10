const MAX_SNAPSHOTS = 20;
const TTL_SECONDS = 86400 * 30; // 30 days

export async function saveSnapshot(kv, zoneId, username, action, cfHeaders) {
    if (!kv) return;
    try {
        const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=1000`, {
            headers: { ...cfHeaders, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!data.success) return;
        const timestamp = new Date().toISOString();
        const snapshotKey = `DNS_SNAPSHOT:${zoneId}:${timestamp}`;
        const snapshot = { timestamp, username, action, records: data.result || [] };
        await kv.put(snapshotKey, JSON.stringify(snapshot), { expirationTtl: TTL_SECONDS });

        // Update the snapshot list index
        const listKey = `DNS_SNAPSHOTS:${zoneId}`;
        let snapshotList = [];
        try {
            const raw = await kv.get(listKey);
            if (raw) snapshotList = JSON.parse(raw);
        } catch (e) { snapshotList = []; }

        snapshotList.push({ key: snapshotKey, timestamp, username, action });

        // Cap at MAX_SNAPSHOTS — remove oldest entries
        if (snapshotList.length > MAX_SNAPSHOTS) {
            const toRemove = snapshotList.splice(0, snapshotList.length - MAX_SNAPSHOTS);
            for (const entry of toRemove) {
                await kv.delete(entry.key);
            }
        }

        await kv.put(listKey, JSON.stringify(snapshotList), { expirationTtl: TTL_SECONDS });
    } catch (e) { console.error('Failed to save DNS snapshot:', e.message); }
}
