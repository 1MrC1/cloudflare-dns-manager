export async function fireWebhook(kv, event) {
    if (!kv) return;
    try {
        const raw = await kv.get('APP_SETTINGS');
        if (!raw) return;
        const settings = JSON.parse(raw);
        if (!settings.webhookUrl) return;
        await fetch(settings.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: event.type, timestamp: new Date().toISOString(), ...event })
        });
    } catch (e) { }
}
