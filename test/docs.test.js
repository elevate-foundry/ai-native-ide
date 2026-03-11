const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('runbook document exists and includes cross-platform startup sections', () => {
  const path = 'docs/RUNNING_THE_IDE.md';
  assert.equal(fs.existsSync(path), true);

  const content = fs.readFileSync(path, 'utf8');
  assert.match(content, /## macOS/);
  assert.match(content, /## Linux/);
  assert.match(content, /## Windows \/ Surface \/ 2-in-1/);
  assert.match(content, /ai-native-ide dev/);
  assert.match(content, /If curl returns 404/);
  assert.match(content, /raw\.githubusercontent\.com\/elevate-foundry\/ai-native-ide\/HEAD\/scripts\/install\.sh/);
});
