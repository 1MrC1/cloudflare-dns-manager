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

// In-memory cache: { key → { count, windowStart, lastSync } }
const memCache = new Map();
const MEM_TTL = 5000; // sync to KV every 5 seconds

// Exported for tests
export function _resetMemCache() { memCache.clear(); }

export async function checkRateLimit(kv, ip, pathname) {
    if (!kv) return null; // No KV, skip rate limiting

    const match = findLimit(pathname);
    if (!match) return null; // No limit for this endpoint

    const { limit, key: limitKey } = match;
    const key = `RATELIMIT:${ip}:${limitKey}`;
    const now = Date.now();

    // Check in-memory first
    let mem = memCache.get(key);
    if (mem && (now - mem.windowStart) <= limit.windowSec * 1000) {
        mem.count++;
        if (mem.count > limit.max) {
            // Over limit — sync to KV and reject
            if (now - mem.lastSync > MEM_TTL) {
                await kv.put(key, JSON.stringify({ count: mem.count, windowStart: mem.windowStart }), { expirationTtl: limit.windowSec * 2 });
                mem.lastSync = now;
            }
            return Math.ceil((mem.windowStart + limit.windowSec * 1000 - now) / 1000) || 1;
        }
        // Under limit — skip KV entirely (sync periodically)
        if (now - mem.lastSync > MEM_TTL) {
            kv.put(key, JSON.stringify({ count: mem.count, windowStart: mem.windowStart }), { expirationTtl: limit.windowSec * 2 }); // fire-and-forget
            mem.lastSync = now;
        }
        return null;
    }

    // Memory miss or expired — fall back to KV
    const raw = await kv.get(key);
    let data = raw ? JSON.parse(raw) : null;
    if (!data || (now - data.windowStart) > limit.windowSec * 1000) {
        data = { count: 1, windowStart: now };
    } else {
        data.count++;
    }
    memCache.set(key, { ...data, lastSync: now });
    await kv.put(key, JSON.stringify(data), { expirationTtl: limit.windowSec * 2 });

    if (data.count > limit.max) {
        return Math.ceil((data.windowStart + limit.windowSec * 1000 - now) / 1000) || 1;
    }
    return null;
}
