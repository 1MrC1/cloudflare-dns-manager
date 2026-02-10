export async function saveSnapshot(kv, zoneId, username, action, cfToken) {
    if (!kv) return;
    try {
        const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=1000`, {
            headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!data.success) return;
        const timestamp = new Date().toISOString();
        const snapshot = { timestamp, username, action, records: data.result || [] };
        await kv.put(`DNS_SNAPSHOT:${zoneId}:${timestamp}`, JSON.stringify(snapshot), { expirationTtl: 86400 * 30 }); // 30 days
        // Clean up old snapshots (keep max 20)
        const list = await kv.list({ prefix: `DNS_SNAPSHOT:${zoneId}:` });
        if (list.keys.length > 20) {
            const toDelete = list.keys.slice(0, list.keys.length - 20);
            for (const k of toDelete) await kv.delete(k.name);
        }
    } catch (e) { }
}
