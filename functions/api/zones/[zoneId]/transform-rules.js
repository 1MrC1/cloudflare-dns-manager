import { logAudit } from '../../_audit.js';

const PHASES = {
    url_rewrite: 'http_request_transform',
    header_mod: 'http_request_late_transform'
};

function entrypoint(zoneId, phase) {
    return `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`;
}

async function fetchRuleset(cfHeaders, zoneId, phase) {
    try {
        const res = await fetch(entrypoint(zoneId, phase), {
            headers: { ...cfHeaders, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) return data.result;
        return null;
    } catch {
        return null;
    }
}

async function putRules(cfHeaders, zoneId, ruleset, rules, cfPhase) {
    const url = ruleset?.id
        ? `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/${ruleset.id}`
        : entrypoint(zoneId, cfPhase);
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
        const [urlRewrite, headerMod] = await Promise.all([
            fetchRuleset(cfHeaders, zoneId, PHASES.url_rewrite),
            fetchRuleset(cfHeaders, zoneId, PHASES.header_mod),
        ]);

        return new Response(JSON.stringify({
            success: true,
            url_rewrite_rules: urlRewrite?.rules || [],
            url_rewrite_ruleset_id: urlRewrite?.id || null,
            header_mod_rules: headerMod?.rules || [],
            header_mod_ruleset_id: headerMod?.id || null,
            errors: []
        }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, errors: [{ message: e.message || 'Failed to fetch transform rules' }] }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

export async function onRequestPost(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const body = await context.request.json();
    const username = context.data.user?.username || 'client';
    const kv = context.env.CF_DNS_KV;
    const { action, phase } = body;
    const cfPhase = PHASES[phase];

    if (!cfPhase) return jsonErr(`Invalid phase: "${phase}"`);

    try {
        if (action === 'toggle_rule') {
            const { ruleIndex, enabled } = body;
            const ruleset = await fetchRuleset(cfHeaders, zoneId, cfPhase);
            if (!ruleset) return jsonErr('Could not fetch ruleset');
            const rules = ruleset.rules || [];
            if (ruleIndex < 0 || ruleIndex >= rules.length) return jsonErr('Invalid rule index');
            rules[ruleIndex] = { ...rules[ruleIndex], enabled };
            const putData = await putRules(cfHeaders, zoneId, ruleset, rules, cfPhase);
            if (putData.success) {
                await logAudit(kv, username, 'transform.toggle', `${enabled ? 'Enabled' : 'Disabled'} ${phase} rule #${ruleIndex + 1} (zone: ${zoneId})`);
            }
            return jsonRes(putData);
        }

        if (action === 'create_rule') {
            const { rule } = body;
            const ruleset = await fetchRuleset(cfHeaders, zoneId, cfPhase);
            const rules = ruleset?.rules || [];
            rules.push({ ...rule, action: rule.action || 'rewrite' });
            const putData = await putRules(cfHeaders, zoneId, ruleset, rules, cfPhase);
            if (putData.success) {
                await logAudit(kv, username, 'transform.create', `Created ${phase} rule "${rule.description || ''}" (zone: ${zoneId})`);
            }
            return jsonRes(putData);
        }

        if (action === 'update_rule') {
            const { ruleIndex, rule } = body;
            const ruleset = await fetchRuleset(cfHeaders, zoneId, cfPhase);
            if (!ruleset) return jsonErr('Could not fetch ruleset');
            const rules = ruleset.rules || [];
            if (ruleIndex < 0 || ruleIndex >= rules.length) return jsonErr('Invalid rule index');
            rules[ruleIndex] = { ...rules[ruleIndex], ...rule, action: rule.action || 'rewrite' };
            const putData = await putRules(cfHeaders, zoneId, ruleset, rules, cfPhase);
            if (putData.success) {
                await logAudit(kv, username, 'transform.update', `Updated ${phase} rule #${ruleIndex + 1} (zone: ${zoneId})`);
            }
            return jsonRes(putData);
        }

        if (action === 'delete_rule') {
            const { ruleIndex } = body;
            const ruleset = await fetchRuleset(cfHeaders, zoneId, cfPhase);
            if (!ruleset) return jsonErr('Could not fetch ruleset');
            const rules = ruleset.rules || [];
            if (ruleIndex < 0 || ruleIndex >= rules.length) return jsonErr('Invalid rule index');
            const deleted = rules.splice(ruleIndex, 1)[0];
            const putData = await putRules(cfHeaders, zoneId, ruleset, rules, cfPhase);
            if (putData.success) {
                await logAudit(kv, username, 'transform.delete', `Deleted ${phase} rule "${deleted.description || '#' + (ruleIndex + 1)}" (zone: ${zoneId})`);
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
