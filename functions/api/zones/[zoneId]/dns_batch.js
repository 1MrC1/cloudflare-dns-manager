export async function onRequestPost(context) {
    const { cfToken } = context.data;
    const { zoneId } = context.params;
    const body = await context.request.json();

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/batch`, {
        method: 'POST',
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
