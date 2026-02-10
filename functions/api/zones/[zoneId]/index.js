export async function onRequestDelete(context) {
    const { cfHeaders } = context.data;
    const zoneId = context.params.zoneId;

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
        method: 'DELETE',
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
