import { SignJWT } from 'jose';

export async function onRequestPost(context) {
    const { request, env } = context;
    const { password } = await request.json();

    const serverPassword = env.APP_PASSWORD;

    if (!serverPassword) {
        return new Response(JSON.stringify({ error: 'Server is not configured for password login.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Hash the server password to compare with the client's hash
    const msgUint8 = new TextEncoder().encode(serverPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const serverPasswordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (password === serverPasswordHash) {
        const secret = new TextEncoder().encode(serverPassword);
        const jwt = await new SignJWT({ admin: true })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('24h')
            .sign(secret);

        const accounts = [];
        if (env.CF_API_TOKEN) accounts.push({ id: 0, name: 'Default Account' });

        // Scan for additional tokens (CF_API_TOKEN1, CF_API_TOKEN2, etc.)
        let i = 1;
        while (env[`CF_API_TOKEN${i}`]) {
            accounts.push({ id: i, name: `Account ${i}` });
            i++;
        }

        return new Response(JSON.stringify({ token: jwt, accounts }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ error: 'Invalid password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
    });
}
