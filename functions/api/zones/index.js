export async function onRequestGet(context) {
    const { cfToken } = context.data;

    const response = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=50', {
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
