const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('/home/gobotmini/code/choose-adventure/src/app/api/turn/route.ts', 'utf8');

assert.match(source, /Return ONLY valid JSON with this exact top-level shape:/);
assert.match(source, /"discoveries"\s*:\s*\{/);
assert.match(source, /"locations"\s*:\s*\[/);
assert.match(source, /"people"\s*:\s*\[/);
assert.match(source, /"routes"\s*:\s*\[/);
assert.match(source, /"factions"\s*:\s*\[/);
assert.match(source, /"threats"\s*:\s*\[/);
assert.match(source, /"facts"\s*:\s*\[/);
assert.match(source, /"role"\s*:\s*"string"/);
assert.match(source, /"relationship"\s*:\s*"string"/);
assert.match(source, /"status"\s*:\s*"string"/);
assert.match(source, /"isCompanion"\s*:\s*true/);
assert.match(source, /"isActive"\s*:\s*true/);
assert.match(source, /sanitizePeopleList/);
assert.match(source, /flattenDiscoveries/);
assert.match(source, /for \(const discovery of flattenDiscoveries\(turn\.discoveries\)\)/);
assert.match(source, /await persistDiscovery\(/);
assert.match(source, /for \(const person of turn\.discoveries\?\.people \?\? \[\]\)/);
assert.match(source, /await persistTeamMember\(/);
assert.match(source, /notes: person\.notes \?\? person\.details/);
assert.match(source, /discoveries: turn\.discoveries/);

console.log('turn structured contract checks passed');
