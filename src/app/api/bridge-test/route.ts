export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const bridgeUrl = process.env.GAME_BRIDGE_URL;
  const bridgeToken = process.env.GAME_BRIDGE_TOKEN;

  if (!bridgeUrl) {
    return Response.json({ ok: false, error: 'missing-bridge-url' }, { status: 500 });
  }

  const response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/bridge/echo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(bridgeToken ? { 'x-bridge-token': bridgeToken } : {}),
    },
    body: JSON.stringify(body),
  }).catch((error) => {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  if (response instanceof Response === false) {
    return Response.json({ ok: false, error: 'bridge-fetch-failed' }, { status: 502 });
  }

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
