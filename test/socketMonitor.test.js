const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('socket monitor script exists', () => {
  assert.equal(fs.existsSync('scripts/monitor-sockets.mjs'), true);
});

test('socket monitor supports --once mode', () => {
  const script = read('scripts/monitor-sockets.mjs');
  assert.match(script, /--once/);
});

test('socket monitor once command emits summary line', () => {
  const output = execSync('node scripts/monitor-sockets.mjs --once', { encoding: 'utf8' });
  assert.match(output, /sockets total=/);
  assert.match(output, /established=/);
  assert.match(output, /listening=/);
});
