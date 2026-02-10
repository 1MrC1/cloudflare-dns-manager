import { logAudit } from './_audit.js';
import { validateDnsRecord } from './_validate.js';
import { getUserAllowedZones, isZoneAllowed } from './_permissions.js';

export async function onRequestPost(context) {
    const { cfHeaders } = context.data;
    const username = context.data.user?.username || 'client';
    const env = context.env;

    const headers = {
        ...cfHeaders,
        'Content-Type': 'application/json'
    };

    let body;
    try {
        body = await context.request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    const { operation, zones, record } = body;

    // Validate operation
    if (!operation || !['create', 'delete_matching'].includes(operation)) {
        return new Response(JSON.stringify({ error: "operation must be 'create' or 'delete_matching'." }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    // Validate zones
    if (!zones || (zones !== 'all' && !Array.isArray(zones))) {
        return new Response(JSON.stringify({ error: "zones must be 'all' or an array of zone IDs." }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    // Limit zones array size to prevent abuse
    if (Array.isArray(zones) && zones.length > 100) {
        return new Response(JSON.stringify({ error: 'zones array must not exceed 100 items.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    // Validate record
    if (!record || typeof record !== 'object') {
        return new Response(JSON.stringify({ error: 'record object is required.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    if (operation === 'create' && (!record.type || !record.name || !record.content)) {
        return new Response(JSON.stringify({ error: "record must include type, name, and content for 'create' operation." }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    // Validate DNS record fields
    const requireAll = operation === 'create';
    const recordErrors = validateDnsRecord(record, requireAll);
    if (recordErrors.length > 0) {
        return new Response(JSON.stringify({ error: 'Invalid record fields.', details: recordErrors }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Resolve target zones
        let targetZones;

        if (zones === 'all') {
            const allZones = [];
            let page = 1;
            let totalPages = 1;

            while (page <= totalPages) {
                const zonesRes = await fetch(
                    `https://api.cloudflare.com/client/v4/zones?per_page=50&page=${page}`,
                    { headers }
                );
                const zonesData = await zonesRes.json();

                if (!zonesData.success) {
                    return new Response(JSON.stringify({ error: 'Failed to fetch zones from Cloudflare API.', details: zonesData.errors }), {
                        status: 502, headers: { 'Content-Type': 'application/json' }
                    });
                }

                allZones.push(...(zonesData.result || []));
                totalPages = zonesData.result_info?.total_pages || 1;
                page++;
            }

            targetZones = allZones.map(z => ({ id: z.id, name: z.name }));
        } else {
            // Fetch zone details for each provided zone ID to get zone names
            const zonePromises = zones.map(async (zoneId) => {
                const zoneRes = await fetch(
                    `https://api.cloudflare.com/client/v4/zones/${zoneId}`,
                    { headers }
                );
                const zoneData = await zoneRes.json();
                if (zoneData.success && zoneData.result) {
                    return { id: zoneData.result.id, name: zoneData.result.name };
                }
                return { id: zoneId, name: null };
            });
            targetZones = await Promise.all(zonePromises);
        }

        // Filter target zones based on user permissions
        const user = context.data.user;
        if (user && user.role !== 'admin') {
            const allowedZones = await getUserAllowedZones(env.CF_DNS_KV, user.username);
            if (allowedZones.length > 0) {
                targetZones = targetZones.filter(z => z.name && isZoneAllowed(allowedZones, z.name));
            }
        }

        if (targetZones.length === 0) {
            return new Response(JSON.stringify({ results: [], message: 'No zones found.' }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // Execute operation across all target zones in parallel
        const resultPromises = targetZones.map(async (zone) => {
            const result = { zoneId: zone.id, zoneName: zone.name, success: true, count: 0, errors: [] };

            if (!zone.name) {
                result.success = false;
                result.errors.push('Failed to resolve zone details.');
                return result;
            }

            try {
                if (operation === 'create') {
                    return await createRecord(zone, record, headers, result);
                } else {
                    return await deleteMatchingRecords(zone, record, headers, result);
                }
            } catch (e) {
                result.success = false;
                result.errors.push(e.message);
                return result;
            }
        });

        const results = await Promise.all(resultPromises);

        // Audit log
        const totalCount = results.reduce((sum, r) => sum + r.count, 0);
        const successCount = results.filter(r => r.success).length;
        await logAudit(
            env.CF_DNS_KV,
            username,
            `dns.bulk.${operation}`,
            `Bulk ${operation}: ${totalCount} records across ${successCount}/${results.length} zones`
        );

        return new Response(JSON.stringify({ results }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Bulk operation failed.', message: e.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Build the fully qualified domain name for a record.
 * If the record name already ends with the zone name, use it as-is.
 * Otherwise, append the zone name (e.g. `_dmarc` -> `_dmarc.example.com`).
 */
function resolveFQDN(name, zoneName) {
    if (name === '@' || name === zoneName) {
        return zoneName;
    }
    if (name.endsWith(`.${zoneName}`)) {
        return name;
    }
    return `${name}.${zoneName}`;
}

/**
 * Create a single DNS record in a zone.
 */
async function createRecord(zone, record, headers, result) {
    const fqdn = resolveFQDN(record.name, zone.name);

    const payload = {
        type: record.type,
        name: fqdn,
        content: record.content,
    };

    if (record.ttl !== undefined) {
        payload.ttl = record.ttl;
    }

    if (record.proxied !== undefined) {
        payload.proxied = record.proxied;
    }

    const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        }
    );

    const data = await res.json();

    if (data.success) {
        result.count = 1;
    } else {
        result.success = false;
        result.errors = (data.errors || []).map(e => e.message || JSON.stringify(e));
    }

    return result;
}

/**
 * Delete all DNS records in a zone that match the given criteria.
 * Any field (type, name, content) can be omitted to match all.
 */
async function deleteMatchingRecords(zone, record, headers, result) {
    // Fetch all DNS records for the zone (paginated)
    const allRecords = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?per_page=100&page=${page}`,
            { headers }
        );
        const data = await res.json();

        if (!data.success) {
            result.success = false;
            result.errors.push('Failed to fetch DNS records for zone.');
            return result;
        }

        allRecords.push(...(data.result || []));
        totalPages = data.result_info?.total_pages || 1;
        page++;
    }

    // Filter records by matching criteria
    const matchName = record.name ? resolveFQDN(record.name, zone.name) : null;

    const matches = allRecords.filter(r => {
        if (record.type && r.type !== record.type) return false;
        if (matchName && r.name !== matchName) return false;
        if (record.content && r.content !== record.content) return false;
        return true;
    });

    // Delete each matching record
    const deletePromises = matches.map(async (r) => {
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/${r.id}`,
            { method: 'DELETE', headers }
        );
        const data = await res.json();
        if (!data.success) {
            result.errors.push(`Failed to delete ${r.type} ${r.name}: ${(data.errors || []).map(e => e.message).join(', ')}`);
        }
        return data.success;
    });

    const deleteResults = await Promise.all(deletePromises);
    const deletedCount = deleteResults.filter(Boolean).length;

    result.count = deletedCount;
    if (result.errors.length > 0) {
        result.success = false;
    }

    return result;
}
