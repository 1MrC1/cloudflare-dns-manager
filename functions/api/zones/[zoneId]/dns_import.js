import { logAudit } from '../../_audit.js';
import { saveSnapshot } from '../../_snapshot.js';
import { fireWebhook } from '../../_webhook.js';

const VALID_DNS_TYPES = new Set([
    'A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA', 'PTR', 'SPF',
    'LOC', 'NAPTR', 'CERT', 'DNSKEY', 'DS', 'HTTPS', 'SSHFP', 'SVCB', 'TLSA', 'URI'
]);

function validateDnsRecord(record) {
    const errors = [];

    if (!record.type || !VALID_DNS_TYPES.has(record.type)) {
        errors.push(`Invalid record type: "${record.type || ''}". Must be one of: ${[...VALID_DNS_TYPES].join(', ')}`);
    }

    if (!record.name || typeof record.name !== 'string' || record.name.trim().length === 0) {
        errors.push('Record name is required.');
    } else if (record.name.length > 253) {
        errors.push(`Record name exceeds maximum length of 253 characters (got ${record.name.length}).`);
    }

    if (!record.content || typeof record.content !== 'string' || record.content.trim().length === 0) {
        errors.push('Record content is required.');
    } else if (record.content.length > 4096) {
        errors.push(`Record content exceeds maximum length of 4096 characters (got ${record.content.length}).`);
    }

    if (record.ttl !== undefined && record.ttl !== null) {
        const ttl = Number(record.ttl);
        if (!Number.isInteger(ttl) || ttl < 1) {
            errors.push('TTL must be a positive integer (use 1 for automatic).');
        }
    }

    if (record.priority !== undefined && record.priority !== null) {
        const priority = Number(record.priority);
        if (!Number.isInteger(priority) || priority < 0 || priority > 65535) {
            errors.push('Priority must be an integer between 0 and 65535.');
        }
    }

    return errors;
}

export async function onRequestPost(context) {
    const { cfToken } = context.data;
    const { zoneId } = context.params;
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;

    // Check Content-Type to determine mode
    const contentType = context.request.headers.get('Content-Type') || '';

    // JSON bulk import mode
    if (contentType.includes('application/json')) {
        let body;
        try {
            body = await context.request.json();
        } catch {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid JSON body'
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const records = body.records;
        if (!Array.isArray(records) || records.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No records provided. Expected { records: [...] }'
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        if (records.length > 100) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Maximum 100 records per import'
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // Snapshot before mutation
        await saveSnapshot(kv, zoneId, username, 'dns.bulk_import', cfToken);

        let created = 0;
        const errors = [];

        // Create records in sequence to avoid rate limits
        for (let i = 0; i < records.length; i++) {
            const record = records[i];

            // Validate
            const validationErrors = validateDnsRecord(record);
            if (validationErrors.length > 0) {
                errors.push({ index: i, error: validationErrors.join('; ') });
                continue;
            }

            // Build payload
            const payload = {
                type: record.type,
                name: record.name,
                content: record.content,
                ttl: record.ttl || 1
            };

            if (record.priority !== undefined && record.priority !== null) {
                payload.priority = Number(record.priority);
            }

            if (record.proxied !== undefined) {
                // Only A, AAAA, CNAME support proxied
                if (['A', 'AAAA', 'CNAME'].includes(record.type)) {
                    payload.proxied = Boolean(record.proxied);
                }
            }

            if (record.comment) {
                payload.comment = record.comment;
            }

            try {
                const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${cfToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                if (data.success) {
                    created++;
                } else {
                    const errMsg = data.errors?.map(e => e.message).join('; ') || 'Unknown error';
                    errors.push({ index: i, error: errMsg });
                }
            } catch (err) {
                errors.push({ index: i, error: err.message || 'Network error' });
            }
        }

        // Audit log
        await logAudit(kv, username, 'dns.bulk_import', `Imported ${created}/${records.length} records (zone: ${zoneId})`);
        await fireWebhook(kv, {
            type: 'dns.bulk_import',
            username,
            detail: `Imported ${created}/${records.length} records (zone: ${zoneId})`
        });

        return new Response(JSON.stringify({
            success: true,
            created,
            total: records.length,
            errors
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Fallback: Proxy the multipart form data request (existing BIND file import)
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/import`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${cfToken}`
            // Don't set Content-Type, let the browser/fetch handle it for multipart
        },
        body: context.request.body
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
    });
}
