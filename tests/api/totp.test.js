import {
    base32Encode,
    base32Decode,
    generateTOTPSecret,
    generateTOTPCode,
    verifyTOTP,
    generateOTPAuthURI,
} from '../../functions/api/_totp.js';

describe('base32', () => {
    it('roundtrip: encode then decode returns original bytes', () => {
        const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
        const encoded = base32Encode(original);
        const decoded = base32Decode(encoded);
        expect(Array.from(decoded)).toEqual(Array.from(original));
    });
});

describe('generateTOTPSecret', () => {
    it('returns a non-empty string of valid base32 chars', () => {
        const secret = generateTOTPSecret();
        expect(secret.length).toBeGreaterThan(0);
        expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    });
});

describe('generateTOTPCode', () => {
    it('returns a 6-digit string', async () => {
        const secret = generateTOTPSecret();
        const code = await generateTOTPCode(secret, 1000000);
        expect(code).toHaveLength(6);
        expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it('is deterministic for same secret and time', async () => {
        const secret = generateTOTPSecret();
        const time = 1700000000;
        const code1 = await generateTOTPCode(secret, time);
        const code2 = await generateTOTPCode(secret, time);
        expect(code1).toBe(code2);
    });
});

describe('verifyTOTP', () => {
    it('accepts valid code (generate then verify)', async () => {
        const secret = generateTOTPSecret();
        const now = Math.floor(Date.now() / 1000);
        const code = await generateTOTPCode(secret, now);
        const result = await verifyTOTP(secret, code);
        expect(result).toBe(true);
    });

    it('rejects wrong code', async () => {
        const secret = generateTOTPSecret();
        const result = await verifyTOTP(secret, '000000');
        // There is a very small chance this could be a valid code, but practically it won't be
        // We use a fixed secret to make it deterministic
        const fixedSecret = 'JBSWY3DPEHPK3PXP';
        const wrongCode = '999999';
        const result2 = await verifyTOTP(fixedSecret, wrongCode);
        // The chance of 999999 being valid across 3 windows is extremely small
        expect(result2).toBe(false);
    });

    it('rejects empty code', async () => {
        const secret = generateTOTPSecret();
        expect(await verifyTOTP(secret, '')).toBe(false);
    });

    it('rejects null code', async () => {
        const secret = generateTOTPSecret();
        expect(await verifyTOTP(secret, null)).toBe(false);
    });
});

describe('generateOTPAuthURI', () => {
    it('returns otpauth:// URI with correct format', () => {
        const uri = generateOTPAuthURI('JBSWY3DPEHPK3PXP', 'admin', 'CF-DNS-Manager');
        expect(uri).toMatch(/^otpauth:\/\/totp\//);
        expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
        expect(uri).toContain('issuer=CF-DNS-Manager');
        expect(uri).toContain('algorithm=SHA1');
        expect(uri).toContain('digits=6');
        expect(uri).toContain('period=30');
    });
});
