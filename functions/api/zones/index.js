import { getUserAllowedZones, isZoneAllowed } from '../_permissions.js';

export async function onRequestGet(context) {
    const { cfHeaders } = context.data;

    const response = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=50', {
        headers: {
            ...cfHeaders,
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();

    // Filter zones based on user permissions
    const user = context.data.user;
    if (data.success && data.result && user && user.role !== 'admin') {
        const allowedZones = await getUserAllowedZones(context.env.CF_DNS_KV, user.username);
        if (allowedZones.length > 0) {
            data.result = data.result.filter(zone => isZoneAllowed(allowedZones, zone.name));
            if (data.result_info) {
                data.result_info.count = data.result.length;
                data.result_info.total_count = data.result.length;
            }
        }
    }

    // Include auth type so frontend knows if this is AT or GK
    if (data.success) {
        data._authType = context.data.authType || 'api_token';
    }

    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}
