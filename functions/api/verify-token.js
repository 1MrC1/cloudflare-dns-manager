export async function onRequestGet(context) {
    const { request } = context;
    const clientToken = request.headers.get('X-Cloudflare-Token');
    const clientEmail = request.headers.get('X-Cloudflare-Email');

    if (!clientToken) {
        return new Response(JSON.stringify({
            success: false,
            message: 'No token provided'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Global API Key mode: both email and token/key are present
        if (clientEmail) {
            const verifyResponse = await fetch('https://api.cloudflare.com/client/v4/user', {
                headers: {
                    'X-Auth-Email': clientEmail,
                    'X-Auth-Key': clientToken,
                    'Content-Type': 'application/json'
                }
            });

            const data = await verifyResponse.json();

            if (data.success) {
                return new Response(JSON.stringify({
                    success: true,
                    message: 'Token is valid',
                    type: 'global_key'
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } else {
                return new Response(JSON.stringify({
                    success: false,
                    message: data.errors?.[0]?.message || 'Invalid Global API Key or email'
                }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // API Token mode: only token is present
        const verifyResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            headers: {
                'Authorization': `Bearer ${clientToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await verifyResponse.json();

        if (data.success && data.result && data.result.status === 'active') {
            return new Response(JSON.stringify({
                success: true,
                message: 'Token is valid',
                type: 'api_token'
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            return new Response(JSON.stringify({
                success: false,
                message: data.messages?.[0]?.message || 'Invalid token'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            message: 'Failed to verify token'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
