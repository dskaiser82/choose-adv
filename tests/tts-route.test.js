const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('/home/gobotmini/code/choose-adventure/src/app/api/tts/route.ts', 'utf8');

assert.match(source, /missing-api-key/);
assert.match(source, /empty-audio-stream/);
assert.match(source, /elevenlabs-error/);
assert.match(source, /Content-Type": "audio\/mpeg"/);
assert.match(source, /X-TTS-Stage/);
assert.match(source, /textToSpeech\.convert/);
assert.match(source, /eleven_multilingual_v2/);
assert.match(source, /mp3_44100_128/);

console.log('tts route smoke checks passed');
