import { logAudit } from '../../_audit.js';

export async function onRequestPost(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const body = await context.request.json();

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/batch`, {
        method: 'POST',
        headers: {
            ...cfHeaders,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.success) {
        const username = context.data.user?.username || 'client';
        const deleteCount = body.deletes?.length || 0;
        const createCount = body.posts?.length || 0;
        await logAudit(context.env.CF_DNS_KV, username, 'dns.batch', `Batch: ${createCount} created, ${deleteCount} deleted (zone: ${zoneId})`);
    }
    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}
