const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('/home/gobotmini/code/choose-adventure/src/app/api/turn/route.ts', 'utf8');

assert.match(source, /locked canon: use the exact character\.name/i);
assert.match(source, /Locked protagonist name:/);
assert.match(source, /never rename or substitute it/i);
assert.match(source, /canonicalPlayerName/);

console.log('turn protagonist lock checks passed');
