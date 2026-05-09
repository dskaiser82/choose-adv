const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

async function main() {
  const raw = fs.readFileSync(0, 'utf8');
  const input = raw ? JSON.parse(raw) : {};
  const stateDir = path.join(process.cwd(), 'public', 'state');
  const characters = readJson(path.join(stateDir, 'characters.json'));
  const world = readJson(path.join(stateDir, 'world.json'));
  const log = readJson(path.join(stateDir, 'log.json'));
  const summary = readText(path.join(stateDir, 'summary.md'));

  const playerName = input.playerName || characters.player?.name || 'Cade';
  const worldName = input.worldName || world.world?.name || 'Veyr';
  const action = String(input.action || 'wait and observe').trim();
  const latestEvent = Array.isArray(log.events) && log.events.length ? log.events[log.events.length - 1] : null;

  const narration = [
    `${playerName} acts with intent in ${worldName}: ${action}.`,
    `This response is coming through the Linux-box bridge path, not the old fake app-only turn route.`,
    latestEvent ? `The latest remembered event still matters: ${latestEvent.details}` : `No prior event has been logged yet, so the moment hangs open and dangerous.`,
    `Campaign memory anchor: ${summary.split(/\n+/).filter(Boolean).slice(0, 2).join(' ')}`,
  ].join('\n\n');

  const result = {
    ok: true,
    sceneTitle: `Bridge Turn: ${action.slice(0, 42)}`,
    narration,
    suggestedChoices: [
      'Press forward and test the danger directly',
      'Slow down and study the environment first',
      'Withdraw a step and rethink the approach',
    ],
    debug: {
      generator: 'bridge-gm-subprocess',
      usedStateFiles: ['characters.json', 'world.json', 'log.json', 'summary.md'],
      timestamp: Date.now(),
    },
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error));
  process.exit(1);
});
