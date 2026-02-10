// Scheduled DNS Changes API
// GET  /api/scheduled-changes — list pending scheduled changes
// POST /api/scheduled-changes — create a new scheduled change
// DELETE /api/scheduled-changes?id=CHANGE_ID — cancel a scheduled change

export async function onRequestGet(context) {
    const { env } = context;
    const username = context.data.user?.username || 'client';
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const raw = await kv.get(`SCHEDULED_CHANGES:${username}`);
    const changes = raw ? JSON.parse(raw) : [];

    // Return only pending changes (filter out old completed/failed)
    const pending = changes.filter(c => c.status === 'pending');

    return new Response(JSON.stringify({ success: true, changes: pending }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestPost(context) {
    const { env, request } = context;
    const username = context.data.user?.username || 'client';
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const body = await request.json();
    const { zoneId, zoneName, action, record, recordId, scheduledAt, accountIndex } = body;

    // Validate required fields
    if (!zoneId || !action || !scheduledAt) {
        return new Response(JSON.stringify({ error: 'Missing required fields: zoneId, action, scheduledAt' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!['create', 'update', 'delete'].includes(action)) {
        return new Response(JSON.stringify({ error: 'Invalid action. Must be create, update, or delete.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
        return new Response(JSON.stringify({ error: 'Invalid scheduledAt date format.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (scheduledDate.getTime() <= Date.now()) {
        return new Response(JSON.stringify({ error: 'scheduledAt must be in the future.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if ((action === 'create' || action === 'update') && !record) {
        return new Response(JSON.stringify({ error: 'Record data is required for create/update actions.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if ((action === 'update' || action === 'delete') && !recordId) {
        return new Response(JSON.stringify({ error: 'recordId is required for update/delete actions.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Generate a unique ID
    const id = crypto.randomUUID();

    const change = {
        id,
        zoneId,
        zoneName: zoneName || '',
        action,
        record: record || null,
        recordId: recordId || null,
        scheduledAt: scheduledDate.toISOString(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        accountIndex: accountIndex !== undefined ? accountIndex : 0
    };

    // Load existing changes
    const raw = await kv.get(`SCHEDULED_CHANGES:${username}`);
    const changes = raw ? JSON.parse(raw) : [];
    changes.push(change);

    await kv.put(`SCHEDULED_CHANGES:${username}`, JSON.stringify(changes));

    return new Response(JSON.stringify({ success: true, change }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestDelete(context) {
    const { env, request } = context;
    const username = context.data.user?.username || 'client';
    const kv = env.CF_DNS_KV;

    if (!kv) {
        return new Response(JSON.stringify({ error: 'KV not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const url = new URL(request.url);
    const changeId = url.searchParams.get('id');

    if (!changeId) {
        return new Response(JSON.stringify({ error: 'Missing id parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const raw = await kv.get(`SCHEDULED_CHANGES:${username}`);
    const changes = raw ? JSON.parse(raw) : [];

    const idx = changes.findIndex(c => c.id === changeId);
    if (idx === -1) {
        return new Response(JSON.stringify({ error: 'Scheduled change not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (changes[idx].status !== 'pending') {
        return new Response(JSON.stringify({ error: 'Only pending changes can be cancelled' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    changes.splice(idx, 1);
    await kv.put(`SCHEDULED_CHANGES:${username}`, JSON.stringify(changes));

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}
