const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const INSTALLER_PATH = 'scripts/install.sh';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('installer script exists and is executable', () => {
  assert.equal(fs.existsSync(INSTALLER_PATH), true);
  const mode = fs.statSync(INSTALLER_PATH).mode;
  assert.notEqual(mode & 0o111, 0, 'installer should be executable');
});

test('installer creates ai-native-ide launcher and supports commands', () => {
  const script = read(INSTALLER_PATH);

  assert.match(script, /\$PREFIX\/bin\/ai-native-ide/);
  assert.match(script, /case "\$COMMAND" in/);
  assert.match(script, /dev\)/);
  assert.match(script, /web\)/);
  assert.match(script, /test\)/);
  assert.match(script, /sockets\)/);
  assert.match(script, /sockets:once\)/);
  assert.match(script, /tune\)/);
});

test('installer supports Ollama-style env customization', () => {
  const script = read(INSTALLER_PATH);

  assert.match(script, /PREFIX="\$\{PREFIX:-\/usr\/local\}"/);
  assert.match(script, /INSTALL_DIR="\$\{INSTALL_DIR:-\$HOME\/\.local\/share\/playwright-native-ai-ide\}"/);
  assert.match(script, /REPO_URL="\$\{REPO_URL:-/);
  assert.match(script, /BRANCH="\$\{BRANCH:-main\}"/);
});

test('installer configures npm maxsockets to 10', () => {
  const script = read(INSTALLER_PATH);
  assert.match(script, /npm config set maxsockets 10/);
});

test('installer is explicit about bash and avoids BSD-incompatible sed -i', () => {
  const script = read(INSTALLER_PATH);
  assert.match(script, /Please run this installer with bash/);
  assert.doesNotMatch(script, /sed -i /);
});
