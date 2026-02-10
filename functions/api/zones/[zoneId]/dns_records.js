import { logAudit } from '../../_audit.js';
import { saveSnapshot } from '../../_snapshot.js';
import { fireWebhook } from '../../_webhook.js';

const VALID_DNS_TYPES = new Set([
    'A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA', 'PTR', 'SPF',
    'LOC', 'NAPTR', 'CERT', 'DNSKEY', 'DS', 'HTTPS', 'SSHFP', 'SVCB', 'TLSA', 'URI'
]);

function validateDnsRecord(body) {
    const errors = [];

    if (!body.type || !VALID_DNS_TYPES.has(body.type)) {
        errors.push(`Invalid record type: "${body.type || ''}". Must be one of: ${[...VALID_DNS_TYPES].join(', ')}`);
    }

    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        errors.push('Record name is required.');
    } else if (body.name.length > 253) {
        errors.push(`Record name exceeds maximum length of 253 characters (got ${body.name.length}).`);
    }

    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
        errors.push('Record content is required.');
    } else if (body.content.length > 4096) {
        errors.push(`Record content exceeds maximum length of 4096 characters (got ${body.content.length}).`);
    }

    if (body.ttl !== undefined && body.ttl !== null) {
        const ttl = Number(body.ttl);
        if (!Number.isInteger(ttl) || ttl < 1) {
            errors.push('TTL must be a positive integer (use 1 for automatic).');
        }
    }

    if (body.priority !== undefined && body.priority !== null) {
        const priority = Number(body.priority);
        if (!Number.isInteger(priority) || priority < 0 || priority > 65535) {
            errors.push('Priority must be an integer between 0 and 65535.');
        }
    }

    return errors;
}

export async function onRequestGet(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100`, {
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
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;

    // Validate input
    const validationErrors = validateDnsRecord(body);
    if (validationErrors.length > 0) {
        return new Response(JSON.stringify({
            success: false,
            errors: validationErrors.map(msg => ({ message: msg })),
            messages: [],
            result: null
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Snapshot before mutation
    await saveSnapshot(kv, zoneId, username, 'dns.create', cfHeaders);

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        method: 'POST',
        headers: {
            ...cfHeaders,
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
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const url = new URL(context.request.url);
    const recordId = url.searchParams.get('id');
    const body = await context.request.json();
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;

    if (!recordId) return new Response('Missing ID', { status: 400 });

    // Validate input
    const validationErrors = validateDnsRecord(body);
    if (validationErrors.length > 0) {
        return new Response(JSON.stringify({
            success: false,
            errors: validationErrors.map(msg => ({ message: msg })),
            messages: [],
            result: null
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Snapshot before mutation
    await saveSnapshot(kv, zoneId, username, 'dns.update', cfHeaders);

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
        method: 'PATCH',
        headers: {
            ...cfHeaders,
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
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const url = new URL(context.request.url);
    const recordId = url.searchParams.get('id');
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;

    if (!recordId) return new Response('Missing ID', { status: 400 });

    // Snapshot before mutation
    await saveSnapshot(kv, zoneId, username, 'dns.delete', cfHeaders);

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
        method: 'DELETE',
        headers: {
            ...cfHeaders,
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
