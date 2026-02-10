import { logAudit } from '../../_audit.js';
import { saveSnapshot } from '../../_snapshot.js';
import { fireWebhook } from '../../_webhook.js';

export async function onRequestGet(context) {
    const { cfToken } = context.data;
    const { zoneId } = context.params;

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100`, {
        headers: {
            'Authorization': `Bearer ${cfToken}`,
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestPost(context) {
    const { cfToken } = context.data;
    const { zoneId } = context.params;
    const body = await context.request.json();
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;

    // Snapshot before mutation
    await saveSnapshot(kv, zoneId, username, 'dns.create', cfToken);

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${cfToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.success) {
        await logAudit(kv, username, 'dns.create', `${body.type} ${body.name} → ${body.content} (zone: ${zoneId})`);
        await fireWebhook(kv, {
            type: 'dns.create',
            username,
            detail: `${body.type} ${body.name} → ${body.content} (zone: ${zoneId})`
        });
    }
    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestPatch(context) {
    const { cfToken } = context.data;
    const { zoneId } = context.params;
    const url = new URL(context.request.url);
    const recordId = url.searchParams.get('id');
    const body = await context.request.json();
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;

    if (!recordId) return new Response('Missing ID', { status: 400 });

    // Snapshot before mutation
    await saveSnapshot(kv, zoneId, username, 'dns.update', cfToken);

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${cfToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.success) {
        await logAudit(kv, username, 'dns.update', `${body.type || ''} ${body.name || ''} (zone: ${zoneId}, record: ${recordId})`);
        await fireWebhook(kv, {
            type: 'dns.update',
            username,
            detail: `${body.type || ''} ${body.name || ''} (zone: ${zoneId}, record: ${recordId})`
        });
    }
    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestDelete(context) {
    const { cfToken } = context.data;
    const { zoneId } = context.params;
    const url = new URL(context.request.url);
    const recordId = url.searchParams.get('id');
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;

    if (!recordId) return new Response('Missing ID', { status: 400 });

    // Snapshot before mutation
    await saveSnapshot(kv, zoneId, username, 'dns.delete', cfToken);

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${cfToken}`,
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();
    if (data.success) {
        await logAudit(kv, username, 'dns.delete', `record: ${recordId} (zone: ${zoneId})`);
        await fireWebhook(kv, {
            type: 'dns.delete',
            username,
            detail: `record: ${recordId} (zone: ${zoneId})`
        });
    }
    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}
