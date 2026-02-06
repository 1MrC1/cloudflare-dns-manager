export async function onRequestGet(context) {
    const { cfToken } = context.data;
    const { zoneId } = context.params;

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/fallback_origin`, {
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

export async function onRequestPut(context) {
    const { cfToken } = context.data;
    const { zoneId } = context.params;
    const body = await context.request.json();

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/fallback_origin`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${cfToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}
