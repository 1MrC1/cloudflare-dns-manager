import { logAudit } from '../../_audit.js';

const PHASE = 'http_request_origin';
const ENTRYPOINT = (zoneId) => `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`;

async function fetchRuleset(cfHeaders, zoneId) {
    try {
        const res = await fetch(ENTRYPOINT(zoneId), {
            headers: { ...cfHeaders, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) return data.result;
        return null;
    } catch {
        return null;
    }
}

async function putRules(cfHeaders, zoneId, ruleset, rules) {
    const url = ruleset?.id
        ? `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/${ruleset.id}`
        : ENTRYPOINT(zoneId);
    const res = await fetch(url, {
        method: 'PUT',
        headers: { ...cfHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules })
    });
    return res.json();
}

export async function onRequestGet(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    try {
        const res = await fetch(ENTRYPOINT(zoneId), {
            headers: { ...cfHeaders, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            return new Response(JSON.stringify({
                success: true,
                rules: data.result?.rules || [],
                rulesetId: data.result?.id || null,
                errors: []
            }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (!data.success && data.errors?.some(e => e.code === 10000 || e.message?.includes('not found'))) {
            return new Response(JSON.stringify({ success: true, rules: [], rulesetId: null, errors: [] }), { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: false, errors: data.errors || [] }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, errors: [{ message: e.message || 'Failed to fetch origin rules' }] }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

export async function onRequestPost(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const body = await context.request.json();
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;
    const { action } = body;

    try {
        if (action === 'toggle_rule') {
            const { ruleIndex, enabled } = body;
            const ruleset = await fetchRuleset(cfHeaders, zoneId);
            if (!ruleset) return jsonErr('Could not fetch ruleset');
            const rules = ruleset.rules || [];
            if (ruleIndex < 0 || ruleIndex >= rules.length) return jsonErr('Invalid rule index');
            rules[ruleIndex] = { ...rules[ruleIndex], enabled };
            const putData = await putRules(cfHeaders, zoneId, ruleset, rules);
            if (putData.success) {
                await logAudit(kv, username, 'origin.toggle', `${enabled ? 'Enabled' : 'Disabled'} origin rule #${ruleIndex + 1} (zone: ${zoneId})`);
            }
            return jsonRes(putData);
        }

        if (action === 'create_rule') {
            const { rule } = body;
            const ruleset = await fetchRuleset(cfHeaders, zoneId);
            const rules = ruleset?.rules || [];
            rules.push({ ...rule, action: rule.action || 'route' });
            const putData = await putRules(cfHeaders, zoneId, ruleset, rules);
            if (putData.success) {
                await logAudit(kv, username, 'origin.create', `Created origin rule "${rule.description || ''}" (zone: ${zoneId})`);
            }
            return jsonRes(putData);
        }

        if (action === 'update_rule') {
            const { ruleIndex, rule } = body;
            const ruleset = await fetchRuleset(cfHeaders, zoneId);
            if (!ruleset) return jsonErr('Could not fetch ruleset');
            const rules = ruleset.rules || [];
            if (ruleIndex < 0 || ruleIndex >= rules.length) return jsonErr('Invalid rule index');
            rules[ruleIndex] = { ...rules[ruleIndex], ...rule, action: rule.action || 'route' };
            const putData = await putRules(cfHeaders, zoneId, ruleset, rules);
            if (putData.success) {
                await logAudit(kv, username, 'origin.update', `Updated origin rule #${ruleIndex + 1} (zone: ${zoneId})`);
            }
            return jsonRes(putData);
        }

        if (action === 'delete_rule') {
            const { ruleIndex } = body;
            const ruleset = await fetchRuleset(cfHeaders, zoneId);
            if (!ruleset) return jsonErr('Could not fetch ruleset');
            const rules = ruleset.rules || [];
            if (ruleIndex < 0 || ruleIndex >= rules.length) return jsonErr('Invalid rule index');
            const deleted = rules.splice(ruleIndex, 1)[0];
            const putData = await putRules(cfHeaders, zoneId, ruleset, rules);
            if (putData.success) {
                await logAudit(kv, username, 'origin.delete', `Deleted origin rule "${deleted.description || '#' + (ruleIndex + 1)}" (zone: ${zoneId})`);
            }
            return jsonRes(putData);
        }

        return jsonErr(`Unknown action: "${action}"`);
    } catch (e) {
        return new Response(JSON.stringify({ success: false, errors: [{ message: e.message }] }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

function jsonRes(data) {
    return new Response(JSON.stringify({ success: data.success, errors: data.errors || [] }), {
        status: data.success ? 200 : 400, headers: { 'Content-Type': 'application/json' }
    });
}
function jsonErr(msg) {
    return new Response(JSON.stringify({ success: false, errors: [{ message: msg }] }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
    });
}
