const http = require('node:http');

const PORT = Number(process.env.GAME_BRIDGE_PORT || 5829);
const TOKEN = process.env.GAME_BRIDGE_TOKEN || 'dev-bridge-token';

// Security boundary: this bridge is intentionally narrow.
// It must never expose shell execution, arbitrary file access,
// or generic remote control of the machine. Only game-specific
// request/response endpoints should live here.

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-bridge-token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-bridge-token',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    res.end();
    return;
  }

  if (req.url === '/bridge/ping' && req.method === 'GET') {
    json(res, 200, {
      ok: true,
      service: 'choose-adventure-bridge',
      port: PORT,
      timestamp: Date.now(),
    });
    return;
  }

  if (req.url === '/bridge/echo' && req.method === 'POST') {
    const token = req.headers['x-bridge-token'];
    if (token !== TOKEN) {
      json(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        json(res, 400, { ok: false, error: 'invalid-json' });
        return;
      }

      json(res, 200, {
        ok: true,
        received: body,
        message: 'Bridge echo succeeded',
        timestamp: Date.now(),
      });
    });
    return;
  }

  json(res, 404, { ok: false, error: 'not-found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bridge listening on 0.0.0.0:${PORT}`);
});
