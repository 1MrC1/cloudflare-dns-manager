// Shared helper to build Cloudflare API auth headers from a token entry.
// Supports both API Token and Global API Key formats.
//
// Token entry shapes:
//   { token: 'xxx' }                              → API Token (Bearer)
//   { type: 'global_key', email: '...', key: '...' } → Global API Key
//   'plain-string'                                  → API Token (legacy)

export function buildCfHeaders(entry) {
    if (!entry) return {};

    // Global API Key
    if (entry.type === 'global_key') {
        return {
            'X-Auth-Email': entry.email,
            'X-Auth-Key': entry.key || entry.token,
        };
    }

    // API Token (object or plain string)
    const token = entry.token || entry;
    return {
        'Authorization': `Bearer ${token}`,
    };
}
