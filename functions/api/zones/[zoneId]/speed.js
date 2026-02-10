import { logAudit } from '../../_audit.js';
import { fireWebhook } from '../../_webhook.js';

const SPEED_SETTINGS = ['rocket_loader', 'minify', 'brotli', 'early_hints', 'h2_prioritization', '0rtt'];

async function cfGet(cfHeaders, zoneId, setting) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${setting}`, {
        headers: {
            ...cfHeaders,
            'Content-Type': 'application/json'
        }
    });
    return res.json();
}

async function cfPatch(cfHeaders, zoneId, setting, value) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${setting}`, {
        method: 'PATCH',
        headers: {
            ...cfHeaders,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value })
    });
    return res.json();
}

export async function onRequestGet(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;

    try {
        const results = await Promise.all(
            SPEED_SETTINGS.map(setting => cfGet(cfHeaders, zoneId, setting))
        );

        const settings = {};
        SPEED_SETTINGS.forEach((key, i) => {
            const data = results[i];
            if (data.success && data.result) {
                settings[key] = data.result.value;
            } else {
                settings[key] = null;
            }
        });

        return new Response(JSON.stringify({
            success: true,
            settings,
            errors: []
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({
            success: false,
            errors: [{ message: e.message || 'Failed to fetch speed settings' }]
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function onRequestPost(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const body = await context.request.json();
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;

    const { action } = body;

    if (action === 'enable_all') {
        const enableValues = {
            rocket_loader: 'on',
            minify: { js: true, css: true, html: true },
            brotli: 'on',
            early_hints: 'on',
            h2_prioritization: 'on',
            '0rtt': 'on'
        };

        try {
            const patchResults = await Promise.all(
                SPEED_SETTINGS.map(setting => cfPatch(cfHeaders, zoneId, setting, enableValues[setting]))
            );

            const results = {};
            const errors = [];
            SPEED_SETTINGS.forEach((key, i) => {
                const data = patchResults[i];
                if (data.success && data.result) {
                    results[key] = data.result.value;
                } else {
                    results[key] = null;
                    errors.push({ setting: key, message: data.errors?.[0]?.message || 'Failed to enable' });
                }
            });

            await logAudit(kv, username, 'speed.enable_all', `Enabled all speed optimizations (zone: ${zoneId})`);
            await fireWebhook(kv, {
                type: 'speed.enable_all',
                username,
                detail: `Enabled all speed optimizations (zone: ${zoneId})`
            });

            return new Response(JSON.stringify({
                success: true,
                results,
                errors
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {
            return new Response(JSON.stringify({
                success: false,
                errors: [{ message: e.message || 'Failed to enable all speed settings' }]
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    if (action === 'disable_all') {
        const disableValues = {
            rocket_loader: 'off',
            minify: { js: false, css: false, html: false },
            brotli: 'off',
            early_hints: 'off',
            h2_prioritization: 'off',
            '0rtt': 'off'
        };

        try {
            const patchResults = await Promise.all(
                SPEED_SETTINGS.map(setting => cfPatch(cfHeaders, zoneId, setting, disableValues[setting]))
            );

            const results = {};
            const errors = [];
            SPEED_SETTINGS.forEach((key, i) => {
                const data = patchResults[i];
                if (data.success && data.result) {
                    results[key] = data.result.value;
                } else {
                    results[key] = null;
                    errors.push({ setting: key, message: data.errors?.[0]?.message || 'Failed to disable' });
                }
            });

            await logAudit(kv, username, 'speed.disable_all', `Disabled all speed optimizations (zone: ${zoneId})`);
            await fireWebhook(kv, {
                type: 'speed.disable_all',
                username,
                detail: `Disabled all speed optimizations (zone: ${zoneId})`
            });

            return new Response(JSON.stringify({
                success: true,
                results,
                errors
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {
            return new Response(JSON.stringify({
                success: false,
                errors: [{ message: e.message || 'Failed to disable all speed settings' }]
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    if (action === 'update') {
        const { setting, value } = body;

        if (!SPEED_SETTINGS.includes(setting)) {
            return new Response(JSON.stringify({
                success: false,
                errors: [{ message: `Invalid setting: "${setting}". Valid settings: ${SPEED_SETTINGS.join(', ')}` }]
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        try {
            const data = await cfPatch(cfHeaders, zoneId, setting, value);

            if (data.success) {
                const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;
                await logAudit(kv, username, `speed.${setting}`, `Set ${setting} to ${valueStr} (zone: ${zoneId})`);
                await fireWebhook(kv, {
                    type: `speed.${setting}`,
                    username,
                    detail: `Set ${setting} to ${valueStr} (zone: ${zoneId})`
                });
            }

            return new Response(JSON.stringify({
                success: data.success,
                result: data.result?.value ?? null,
                errors: data.errors || []
            }), {
                status: data.success ? 200 : 400,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {
            return new Response(JSON.stringify({
                success: false,
                errors: [{ message: e.message || `Failed to update ${setting}` }]
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    return new Response(JSON.stringify({
        success: false,
        errors: [{ message: `Unknown action: "${action}". Valid actions: enable_all, disable_all, update` }]
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}
