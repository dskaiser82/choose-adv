const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('/home/gobotmini/code/choose-adventure/src/app/page.tsx', 'utf8');

assert.match(source, /initialTurn=\{\{/);
assert.match(source, /sceneTitle: currentScene\?\.title/);
assert.match(source, /narration: currentScene\?\.narration/);
assert.match(source, /suggestedChoices: currentScene\?\.suggestedChoices/);
assert.match(source, /usedTts: false/);
assert.match(source, /ttsMode: "none"/);

console.log('page hydration soft checks passed');
