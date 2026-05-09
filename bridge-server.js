const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

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

function unauthorized(res) {
  json(res, 401, { ok: false, error: 'unauthorized' });
}

function runBridgeGm(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'bridge-gm.js')], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `bridge-gm exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function parseJsonBody(req, res, handler) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });
  req.on('end', async () => {
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      json(res, 400, { ok: false, error: 'invalid-json' });
      return;
    }

    try {
      await handler(body);
    } catch (error) {
      json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
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
      unauthorized(res);
      return;
    }

    parseJsonBody(req, res, async (body) => {
      json(res, 200, {
        ok: true,
        received: body,
        message: 'Bridge echo succeeded',
        timestamp: Date.now(),
      });
    });
    return;
  }

  if (req.url === '/bridge/game-turn' && req.method === 'POST') {
    const token = req.headers['x-bridge-token'];
    if (token !== TOKEN) {
      unauthorized(res);
      return;
    }

    parseJsonBody(req, res, async (body) => {
      const result = await runBridgeGm(body);
      json(res, 200, result);
    });
    return;
  }

  json(res, 404, { ok: false, error: 'not-found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bridge listening on 0.0.0.0:${PORT}`);
});
