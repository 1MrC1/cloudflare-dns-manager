export async function onRequestGet(context) {
    const { cfHeaders } = context.data;
    const { zoneId } = context.params;
    const url = new URL(context.request.url);
    const sinceMinutes = parseInt(url.searchParams.get('since') || '-1440');

    const now = new Date();
    const sinceDate = new Date(now.getTime() + sinceMinutes * 60 * 1000);

    // Use daily groups for 30d, hourly for shorter ranges
    const useDaily = sinceMinutes <= -10080;
    const node = useDaily ? 'httpRequests1dGroups' : 'httpRequests1hGroups';
    const dateFilter = useDaily
        ? { date_geq: sinceDate.toISOString().split('T')[0], date_lt: now.toISOString().split('T')[0] }
        : { datetime_geq: sinceDate.toISOString(), datetime_lt: now.toISOString() };

    const query = `query {
        viewer {
            zones(filter: { zoneTag: "${zoneId}" }) {
                ${node}(filter: ${JSON.stringify(dateFilter).replace(/"([^"]+)":/g, '$1:')}, limit: 10000) {
                    sum {
                        requests
                        cachedRequests
                        bytes
                        cachedBytes
                        threats
                        pageViews
                        countryMap { clientCountryName requests threats }
                        responseStatusMap { edgeResponseStatus requests }
                    }
                    uniq { uniques }
                }
            }
        }
    }`;

    try {
        const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
            method: 'POST',
            headers: { ...cfHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const result = await res.json();

        if (result.errors && result.errors.length > 0) {
            return new Response(JSON.stringify({ success: false, errors: result.errors.map(e => ({ message: e.message })) }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        const groups = result.data?.viewer?.zones?.[0]?.[node] || [];

        // Aggregate all groups into totals matching the old dashboard API format
        const totals = {
            requests: { all: 0, cached: 0, http_status: {}, country: {} },
            bandwidth: { all: 0, cached: 0 },
            threats: { all: 0, country: {} },
            uniques: { all: 0 },
            pageviews: { all: 0 }
        };

        for (const g of groups) {
            const s = g.sum || {};
            totals.requests.all += s.requests || 0;
            totals.requests.cached += s.cachedRequests || 0;
            totals.bandwidth.all += s.bytes || 0;
            totals.bandwidth.cached += s.cachedBytes || 0;
            totals.threats.all += s.threats || 0;
            totals.pageviews.all += s.pageViews || 0;
            totals.uniques.all += g.uniq?.uniques || 0;

            for (const c of (s.countryMap || [])) {
                totals.requests.country[c.clientCountryName] = (totals.requests.country[c.clientCountryName] || 0) + c.requests;
                if (c.threats > 0) {
                    totals.threats.country[c.clientCountryName] = (totals.threats.country[c.clientCountryName] || 0) + c.threats;
                }
            }
            for (const r of (s.responseStatusMap || [])) {
                const status = String(r.edgeResponseStatus);
                totals.requests.http_status[status] = (totals.requests.http_status[status] || 0) + r.requests;
            }
        }

        return new Response(JSON.stringify({ success: true, data: { totals }, errors: [] }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, errors: [{ message: e.message || 'Failed to fetch analytics' }] }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}
