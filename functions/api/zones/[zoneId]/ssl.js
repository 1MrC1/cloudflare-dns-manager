import { logAudit } from '../../_audit.js';
import { fireWebhook } from '../../_webhook.js';

export async function onRequestGet(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;

    const headers = {
        ...cfHeaders,
        'Content-Type': 'application/json'
    };

    const [sslRes, httpsRes, tlsRes, rewritesRes] = await Promise.all([
        fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`, { headers }),
        fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/always_use_https`, { headers }),
        fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/min_tls_version`, { headers }),
        fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/automatic_https_rewrites`, { headers }),
    ]);

    const [sslData, httpsData, tlsData, rewritesData] = await Promise.all([
        sslRes.json(),
        httpsRes.json(),
        tlsRes.json(),
        rewritesRes.json(),
    ]);

    return new Response(JSON.stringify({
        success: sslData.success && httpsData.success && tlsData.success && rewritesData.success,
        ssl: sslData.result ? { value: sslData.result.value } : null,
        always_use_https: httpsData.result ? { value: httpsData.result.value } : null,
        min_tls_version: tlsData.result ? { value: tlsData.result.value } : null,
        automatic_https_rewrites: rewritesData.result ? { value: rewritesData.result.value } : null,
        errors: [
            ...(sslData.errors || []),
            ...(httpsData.errors || []),
            ...(tlsData.errors || []),
            ...(rewritesData.errors || []),
        ]
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestPost(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const body = await context.request.json();
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;

    const { setting, value } = body;

    const validSettings = {
        ssl_mode: {
            endpoint: 'ssl',
            valid: ['off', 'flexible', 'full', 'strict'],
            label: 'SSL mode',
        },
        always_use_https: {
            endpoint: 'always_use_https',
            valid: ['on', 'off'],
            label: 'Always Use HTTPS',
        },
        min_tls_version: {
            endpoint: 'min_tls_version',
            valid: ['1.0', '1.1', '1.2', '1.3'],
            label: 'Minimum TLS version',
        },
        automatic_https_rewrites: {
            endpoint: 'automatic_https_rewrites',
            valid: ['on', 'off'],
            label: 'Automatic HTTPS Rewrites',
        },
    };

    const config = validSettings[setting];
    if (!config) {
        return new Response(JSON.stringify({
            success: false,
            errors: [{ message: `Unknown setting: "${setting}". Valid settings: ${Object.keys(validSettings).join(', ')}` }]
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!config.valid.includes(value)) {
        return new Response(JSON.stringify({
            success: false,
            errors: [{ message: `Invalid value "${value}" for ${setting}. Valid values: ${config.valid.join(', ')}` }]
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${config.endpoint}`, {
        method: 'PATCH',
        headers: {
            ...cfHeaders,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value })
    });

    const data = await response.json();

    if (data.success) {
        await logAudit(kv, username, `ssl.${setting}`, `${config.label} set to ${value} (zone: ${zoneId})`);
        await fireWebhook(kv, {
            type: `ssl.${setting}`,
            username,
            detail: `${config.label} set to ${value} (zone: ${zoneId})`
        });
    }

    return new Response(JSON.stringify({
        success: data.success,
        result: data.result ? { value: data.result.value } : null,
        errors: data.errors || []
    }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}
