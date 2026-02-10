export async function onRequestGet(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/export`, {
        headers: cfHeaders
    });

    if (!response.ok) {
        return new Response(await response.text(), { status: response.status });
    }

    const data = await response.text();
    return new Response(data, {
        headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="dns_records_${zoneId}.txt"`
        }
    });
}
