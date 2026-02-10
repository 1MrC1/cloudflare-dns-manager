import { logAudit } from '../../_audit.js';
import { fireWebhook } from '../../_webhook.js';

export async function onRequestGet(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/development_mode`, {
        headers: {
            ...cfHeaders,
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();
    return new Response(JSON.stringify({
        success: data.success,
        development_mode: data.result ? {
            value: data.result.value,
            time_remaining: data.result.time_remaining || 0
        } : null,
        errors: data.errors || []
    }), {
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

    const { action } = body;

    if (action === 'toggle_dev_mode') {
        const newValue = body.value === 'on' ? 'on' : 'off';

        const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/development_mode`, {
            method: 'PATCH',
            headers: {
                ...cfHeaders,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value: newValue })
        });

        const data = await response.json();
        if (data.success) {
            await logAudit(kv, username, 'cache.dev_mode', `Development mode set to ${newValue} (zone: ${zoneId})`);
            await fireWebhook(kv, {
                type: 'cache.dev_mode',
                username,
                detail: `Development mode set to ${newValue} (zone: ${zoneId})`
            });
        }
        return new Response(JSON.stringify({
            success: data.success,
            development_mode: data.result ? {
                value: data.result.value,
                time_remaining: data.result.time_remaining || 0
            } : null,
            errors: data.errors || []
        }), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (action === 'purge_all') {
        const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
            method: 'POST',
            headers: {
                ...cfHeaders,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ purge_everything: true })
        });

        const data = await response.json();
        if (data.success) {
            await logAudit(kv, username, 'cache.purge_all', `Purged all cache (zone: ${zoneId})`);
            await fireWebhook(kv, {
                type: 'cache.purge_all',
                username,
                detail: `Purged all cache (zone: ${zoneId})`
            });
        }
        return new Response(JSON.stringify({
            success: data.success,
            errors: data.errors || []
        }), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (action === 'purge_urls') {
        const urls = body.urls;

        if (!Array.isArray(urls) || urls.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                errors: [{ message: 'URLs array is required and must not be empty.' }]
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        if (urls.length > 30) {
            return new Response(JSON.stringify({
                success: false,
                errors: [{ message: 'Maximum 30 URLs per request (Cloudflare API limit).' }]
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
            method: 'POST',
            headers: {
                ...cfHeaders,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ files: urls })
        });

        const data = await response.json();
        if (data.success) {
            await logAudit(kv, username, 'cache.purge_urls', `Purged ${urls.length} URL(s) (zone: ${zoneId})`);
            await fireWebhook(kv, {
                type: 'cache.purge_urls',
                username,
                detail: `Purged ${urls.length} URL(s) (zone: ${zoneId})`
            });
        }
        return new Response(JSON.stringify({
            success: data.success,
            purged_count: urls.length,
            errors: data.errors || []
        }), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({
        success: false,
        errors: [{ message: `Unknown action: "${action}". Valid actions: toggle_dev_mode, purge_all, purge_urls` }]
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}
