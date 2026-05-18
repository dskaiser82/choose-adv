const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('/home/gobotmini/code/choose-adventure/src/app/api/turn/route.ts', 'utf8');

assert.match(source, /Every turn must materially advance the situation/i);
assert.match(source, /Do not spend the whole response re-describing atmosphere/i);
assert.match(source, /prioritize motion, consequence, and decision pressure/i);
assert.match(source, /avoid purple prose and repetitive ambience/i);
assert.match(source, /meaningfully distinct from each other/i);
assert.match(source, /Early turns should produce a hook, discovery, threat, obstacle, or consequence quickly/i);

console.log('turn progression prompt checks passed');
