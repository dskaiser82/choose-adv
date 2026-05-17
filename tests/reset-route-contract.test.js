const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('/home/gobotmini/code/choose-adventure/src/app/api/reset-story/route.ts', 'utf8');

assert.match(source, /REQUIRED_STARTING_ITEMS/);
assert.match(source, /Ancient Shadow Brace/);
assert.match(source, /Hunting Bow/);
assert.match(source, /Arrows/);
assert.match(source, /Quiet Dagger/);
assert.match(source, /Travel Sword/);
assert.match(source, /Silver Coins/);
assert.match(source, /Approach to Whispering Pass/);
assert.match(source, /const story = await resetStoryRun\(\)/);
assert.match(source, /missingRequiredItems/);
assert.match(source, /resetVerified/);
assert.match(source, /currentScene: story\.currentScene/);
assert.match(source, /inventory: story\.inventory\.map/);

console.log('reset route contract checks passed');
