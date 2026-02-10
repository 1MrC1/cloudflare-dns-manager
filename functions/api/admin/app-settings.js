// App-level settings management (admin only, enforced by middleware)
// Stored in KV as APP_SETTINGS JSON

const DEFAULT_SETTINGS = {
    openRegistration: false,
    webhookUrl: ''
};

// GET: Retrieve app settings
export async function onRequestGet(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const raw = await kv.get('APP_SETTINGS');
    const settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };

    return new Response(JSON.stringify({ settings }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// PUT: Update app settings
export async function onRequestPut(context) {
    const { env } = context;
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV storage not configured.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const body = await context.request.json();

    const raw = await kv.get('APP_SETTINGS');
    const settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };

    // Only allow known keys
    if (body.openRegistration !== undefined) {
        settings.openRegistration = !!body.openRegistration;
    }

    if (body.webhookUrl !== undefined) {
        settings.webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
    }

    await kv.put('APP_SETTINGS', JSON.stringify(settings));

    return new Response(JSON.stringify({ success: true, settings }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
