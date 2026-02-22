// TOTP (RFC 6238) implementation using Web Crypto API only — no npm dependencies.

// ── Base32 helpers ──────────────────────────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a Uint8Array to a base32 string (RFC 4648, no padding).
 */
export function base32Encode(bytes) {
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
        bits += 8;

        while (bits >= 5) {
            bits -= 5;
            output += BASE32_ALPHABET[(value >>> bits) & 0x1f];
        }
    }

    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
    }

    return output;
}

/**
 * Decode a base32 string to a Uint8Array.
 */
export function base32Decode(str) {
    // Strip padding and normalise to uppercase
    const input = str.replace(/=+$/, '').toUpperCase();
    const lookup = {};
    for (let i = 0; i < BASE32_ALPHABET.length; i++) {
        lookup[BASE32_ALPHABET[i]] = i;
    }

    let bits = 0;
    let value = 0;
    const output = [];

    for (let i = 0; i < input.length; i++) {
        const v = lookup[input[i]];
        if (v === undefined) {
            throw new Error(`Invalid base32 character: ${input[i]}`);
        }
        value = (value << 5) | v;
        bits += 5;

        if (bits >= 8) {
            bits -= 8;
            output.push((value >>> bits) & 0xff);
        }
    }

    return new Uint8Array(output);
}

// ── TOTP core ───────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random 20-byte secret and return it as a
 * base32-encoded string (suitable for authenticator apps).
 */
export function generateTOTPSecret() {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return base32Encode(bytes);
}

/**
 * Compute an HMAC-SHA1 based TOTP code per RFC 6238.
 *
 * @param {string}  secret  Base32-encoded shared secret.
 * @param {number} [time]   Unix timestamp in seconds (defaults to now).
 * @returns {Promise<string>} 6-digit zero-padded TOTP code.
 */
export async function generateTOTPCode(secret, time) {
    const period = 30;
    const t = time !== undefined ? time : Math.floor(Date.now() / 1000);
    const counter = Math.floor(t / period);

    // Convert counter to 8-byte big-endian buffer
    const counterBuf = new ArrayBuffer(8);
    const view = new DataView(counterBuf);
    // DataView.setBigUint64 may not be available in all runtimes, so set
    // the two 32-bit halves manually.
    view.setUint32(0, Math.floor(counter / 0x100000000));
    view.setUint32(4, counter & 0xffffffff);

    // Import the secret as an HMAC-SHA1 key
    const keyBytes = base32Decode(secret);
    const key = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );

    const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new Uint8Array(counterBuf)));

    // Dynamic truncation (RFC 4226 section 5.4)
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
}

/**
 * Verify a user-supplied TOTP code against the shared secret.
 * Allows +/- 1 time-step window to accommodate clock drift.
 *
 * @param {string} secret  Base32-encoded shared secret.
 * @param {string} code    6-digit code submitted by the user.
 * @returns {Promise<boolean>}
 */
export async function verifyTOTP(secret, code) {
    if (!code || code.length !== 6) return false;

    const now = Math.floor(Date.now() / 1000);
    const period = 30;

    for (let i = -1; i <= 1; i++) {
        const t = now + i * period;
        const expected = await generateTOTPCode(secret, t);
        if (timingSafeEqual(code, expected)) {
            return true;
        }
    }
    return false;
}

/**
 * Constant-time string comparison to mitigate timing attacks.
 */
function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}

/**
 * Build an otpauth:// URI for provisioning authenticator apps.
 *
 * @param {string} secret   Base32 encoded secret.
 * @param {string} username Account name shown in the authenticator.
 * @param {string} issuer   Issuer label (e.g. "CF-DNS-Manager").
 * @returns {string} otpauth:// URI
 */
export function generateOTPAuthURI(secret, username, issuer) {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(username)}`;
    const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: '6',
        period: '30'
    });
    return `otpauth://totp/${label}?${params.toString()}`;
}
