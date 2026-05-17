const { spawnSync } = require('node:child_process');

const checks = [
  {
    name: 'game-client unit checks',
    command: ['node', 'src/app/game-client.test.js'],
  },
  {
    name: 'tts route smoke checks',
    command: ['node', 'tests/tts-route.test.js'],
  },
  {
    name: 'turn route integration checks',
    command: ['node', 'tests/turn-route.test.js'],
  },
  {
    name: 'turso persistence checks',
    command: ['node', 'tests/turso-soft.test.js'],
  },
  {
    name: 'page hydration soft checks',
    command: ['node', 'tests/page-hydration-soft.test.js'],
  },
];

let hadFailure = false;

for (const check of checks) {
  console.log(`\n=== SOFT CHECK: ${check.name} ===`);
  const [cmd, ...args] = check.command;
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: process.cwd(), env: process.env });
  if (result.status !== 0) {
    hadFailure = true;
    console.log('\n' + '!'.repeat(72));
    console.log(`SOFT CHECK WARNING: ${check.name} failed`);
    console.log('This does NOT fail the build, but core functionality may be broken.');
    console.log('!'.repeat(72) + '\n');
  }
}

if (hadFailure) {
  console.log('\n' + '#'.repeat(72));
  console.log('SOFT CHECK SUMMARY: one or more regression checks failed.');
  console.log('Build remains green by design, but review the warnings above.');
  console.log('#'.repeat(72) + '\n');
} else {
  console.log('\n' + '='.repeat(72));
  console.log('SOFT CHECK SUMMARY: all regression checks passed.');
  console.log('='.repeat(72) + '\n');
}

process.exit(0);
