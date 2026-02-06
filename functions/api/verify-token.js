export async function onRequestGet(context) {
    const { request } = context;
    const clientToken = request.headers.get('X-Cloudflare-Token');

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
                message: 'Token is valid'
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
