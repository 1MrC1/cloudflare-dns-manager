// KV-based rate limiting with TTL auto-expiry
// Key format: RATELIMIT:{ip}:{endpoint}
// Value: JSON { count, windowStart }

// Exact path matches
const EXACT_LIMITS = {
    '/api/login': { max: 10, windowSec: 60 },
    '/api/register': { max: 5, windowSec: 60 },
    '/api/setup-account': { max: 5, windowSec: 60 },
    '/api/refresh': { max: 20, windowSec: 60 },
    '/api/verify-totp': { max: 5, windowSec: 60 },
};

// Prefix-based matches (checked in order, first match wins)
const PREFIX_LIMITS = [
    { prefix: '/api/zones/', key: '/api/zones', max: 120, windowSec: 60 },
    { prefix: '/api/admin/', key: '/api/admin', max: 40, windowSec: 60 },
    { prefix: '/api/passkey/', key: '/api/passkey', max: 10, windowSec: 60 },
];

function findLimit(pathname) {
    // Check exact matches first
    if (EXACT_LIMITS[pathname]) {
        return { limit: EXACT_LIMITS[pathname], key: pathname };
    }

    // Check prefix matches — also match the prefix path exactly (e.g. '/api/zones')
    for (const entry of PREFIX_LIMITS) {
        if (pathname === entry.prefix.slice(0, -1) || pathname.startsWith(entry.prefix)) {
            return { limit: { max: entry.max, windowSec: entry.windowSec }, key: entry.key };
        }
    }

    return null;
}

export async function checkRateLimit(kv, ip, pathname) {
    if (!kv) return null; // No KV, skip rate limiting

    const match = findLimit(pathname);
    if (!match) return null; // No limit for this endpoint

    const { limit, key: limitKey } = match;
    const key = `RATELIMIT:${ip}:${limitKey}`;
    const now = Date.now();

    const raw = await kv.get(key);
    let data = raw ? JSON.parse(raw) : null;

    // If no record or window expired, start fresh
    if (!data || (now - data.windowStart) > limit.windowSec * 1000) {
        data = { count: 1, windowStart: now };
        await kv.put(key, JSON.stringify(data), { expirationTtl: limit.windowSec * 2 });
        return null;
    }

    data.count++;

    if (data.count > limit.max) {
        const retryAfter = Math.ceil((data.windowStart + limit.windowSec * 1000 - now) / 1000);
        await kv.put(key, JSON.stringify(data), { expirationTtl: limit.windowSec * 2 });
        return retryAfter > 0 ? retryAfter : 1;
    }

    await kv.put(key, JSON.stringify(data), { expirationTtl: limit.windowSec * 2 });
    return null;
}
