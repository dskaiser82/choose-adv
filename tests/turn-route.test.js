const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('/home/gobotmini/code/choose-adventure/src/app/api/turn/route.ts', 'utf8');

assert.match(source, /encodeEvent\("meta"/);
assert.match(source, /encodeEvent\("chunk"/);
assert.match(source, /encodeEvent\("done"/);
assert.match(source, /persistTurn\(/);
assert.match(source, /suggestedChoices/);
assert.match(source, /characterUpdate/);
assert.match(source, /bodyState/);
assert.match(source, /mindState/);
assert.match(source, /conditions/);
assert.match(source, /collapsed/);
assert.match(source, /shaken/);
assert.match(source, /buildFullNarratorStatePayload/);
assert.match(source, /buildDeltaNarratorStatePayload/);
assert.match(source, /chooseNarratorContextMode/);
assert.match(source, /Context mode:/);
assert.match(source, /worldUpdate/);
assert.match(source, /ReadableStream/);
assert.match(source, /openrouter/i);

console.log('turn route integration checks passed');
