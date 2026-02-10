import { logAudit } from '../../_audit.js';

export async function onRequestGet(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames?per_page=100`, {
        headers: {
            ...cfHeaders,
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
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const body = await context.request.json();

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames`, {
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
        await logAudit(context.env.CF_DNS_KV, username, 'hostname.create', `${body.hostname} (zone: ${zoneId})`);
    }
    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestDelete(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const url = new URL(context.request.url);
    const hostnameId = url.searchParams.get('id');

    if (!hostnameId) return new Response('Missing ID', { status: 400 });

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/${hostnameId}`, {
        method: 'DELETE',
        headers: {
            ...cfHeaders,
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();
    if (data.success) {
        const username = context.data.user?.username || 'client';
        await logAudit(context.env.CF_DNS_KV, username, 'hostname.delete', `hostname: ${hostnameId} (zone: ${zoneId})`);
    }
    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestPatch(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const url = new URL(context.request.url);
    const hostnameId = url.searchParams.get('id');
    const body = await context.request.json();

    if (!hostnameId) return new Response('Missing ID', { status: 400 });

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/${hostnameId}`, {
        method: 'PATCH',
        headers: {
            ...cfHeaders,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.success) {
        const username = context.data.user?.username || 'client';
        await logAudit(context.env.CF_DNS_KV, username, 'hostname.update', `hostname: ${hostnameId} (zone: ${zoneId})`);
    }
    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}
