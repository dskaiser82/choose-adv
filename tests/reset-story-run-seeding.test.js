const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('/home/gobotmini/code/choose-adventure/src/lib/turso.ts', 'utf8');

assert.match(source, /export async function resetStoryRun/);
assert.match(source, /await seedStoryDataIfMissing\(\);/);
assert.match(source, /delete from run_inventory/);
assert.match(source, /Approach to Whispering Pass/);

console.log('reset story run seeding checks passed');
