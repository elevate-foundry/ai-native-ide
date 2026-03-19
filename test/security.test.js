const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Import the security functions by evaluating the server module patterns
// (We test the logic directly rather than spinning up the server)

// ============================================================================
// Path Traversal Protection
// ============================================================================

const HOME_DIR = require('os').homedir();
const PROJECT_ROOT = process.cwd();

function safePath(requestedPath, allowedRoot) {
  const resolved = path.resolve(requestedPath);
  if (!resolved.startsWith(allowedRoot)) {
    return null;
  }
  return resolved;
}

function safeProjectPath(requestedPath) {
  return safePath(requestedPath, PROJECT_ROOT);
}

function safeBrowsePath(requestedPath) {
  return safePath(requestedPath, HOME_DIR);
}

test('safePath blocks directory traversal above allowed root', () => {
  assert.equal(safeProjectPath('/etc/passwd'), null);
  assert.equal(safeProjectPath('../../etc/shadow'), null);
  assert.equal(safeBrowsePath('/etc/passwd'), null);
  assert.equal(safeBrowsePath('/var/log/system.log'), null);
});

test('safePath allows paths within allowed root', () => {
  assert.equal(safeProjectPath(PROJECT_ROOT), PROJECT_ROOT);
  assert.equal(safeProjectPath(path.join(PROJECT_ROOT, 'src')), path.join(PROJECT_ROOT, 'src'));
  assert.equal(safeBrowsePath(HOME_DIR), HOME_DIR);
  assert.equal(safeBrowsePath(path.join(HOME_DIR, 'Documents')), path.join(HOME_DIR, 'Documents'));
});

test('safePath blocks paths with .. that escape root', () => {
  assert.equal(safeProjectPath(path.join(PROJECT_ROOT, '..', '..', 'etc', 'passwd')), null);
  assert.equal(safeBrowsePath(path.join(HOME_DIR, '..', '..', 'etc', 'passwd')), null);
});

test('safePath allows nested paths that contain .. but stay within root', () => {
  const nested = path.join(PROJECT_ROOT, 'src', '..', 'test');
  assert.equal(safeProjectPath(nested), path.join(PROJECT_ROOT, 'test'));
});

// ============================================================================
// Exec Sandboxing
// ============================================================================

const ALLOWED_EXEC_PREFIXES = [
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'fd',
  'git status', 'git log', 'git diff', 'git branch', 'git show', 'git rev-parse',
  'git add', 'git commit', 'git push', 'git pull', 'git fetch', 'git stash',
  'git checkout', 'git merge', 'git rebase', 'git remote', 'git tag',
  'node', 'npm', 'npx', 'python', 'python3', 'pip', 'pip3',
  'cargo', 'rustc', 'go', 'make', 'cmake',
  'echo', 'which', 'env', 'pwd', 'date', 'whoami', 'uname',
  'sort', 'uniq', 'cut', 'awk', 'sed', 'tr', 'diff',
  'curl', 'wget',
  'mkdir', 'touch', 'cp', 'mv',
  'lsof', 'ps',
];

const BLOCKED_SHELL_PATTERNS = [
  /;/,
  /\|\|/,
  /&&/,
  /`/,
  /\$\(/,
  />{1,2}/,
  /<\(/,
];

function isExecAllowed(command) {
  if (!command || typeof command !== 'string') return false;
  const trimmed = command.trim();
  for (const pattern of BLOCKED_SHELL_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  const lower = trimmed.toLowerCase();
  return ALLOWED_EXEC_PREFIXES.some(prefix =>
    lower === prefix || lower.startsWith(prefix + ' ')
  );
}

test('exec allows safe commands', () => {
  assert.equal(isExecAllowed('ls -la'), true);
  assert.equal(isExecAllowed('git status'), true);
  assert.equal(isExecAllowed('git log -n 10'), true);
  assert.equal(isExecAllowed('node --version'), true);
  assert.equal(isExecAllowed('npm test'), true);
  assert.equal(isExecAllowed('cat README.md'), true);
  assert.equal(isExecAllowed('grep -rn "hello" .'), true);
  assert.equal(isExecAllowed('python3 script.py'), true);
  assert.equal(isExecAllowed('echo hello'), true);
});

test('exec blocks dangerous commands', () => {
  assert.equal(isExecAllowed('rm -rf /'), false);
  assert.equal(isExecAllowed('sudo reboot'), false);
  assert.equal(isExecAllowed('shutdown -h now'), false);
  assert.equal(isExecAllowed('dd if=/dev/zero of=/dev/sda'), false);
  assert.equal(isExecAllowed('chmod 777 /'), false);
  assert.equal(isExecAllowed('killall node'), false);
});

test('exec blocks shell injection via metacharacters', () => {
  assert.equal(isExecAllowed('ls; rm -rf /'), false);
  assert.equal(isExecAllowed('echo hello && rm -rf /'), false);
  assert.equal(isExecAllowed('echo hello || rm -rf /'), false);
  assert.equal(isExecAllowed('echo `whoami`'), false);
  assert.equal(isExecAllowed('echo $(whoami)'), false);
  assert.equal(isExecAllowed('cat /etc/passwd > /tmp/stolen'), false);
  assert.equal(isExecAllowed('cat <(echo hi)'), false);
});

test('exec blocks null, undefined, and empty commands', () => {
  assert.equal(isExecAllowed(null), false);
  assert.equal(isExecAllowed(undefined), false);
  assert.equal(isExecAllowed(''), false);
  assert.equal(isExecAllowed('   '), false);
});

// ============================================================================
// Git commit message sanitization
// ============================================================================

test('git commit message sanitization strips dangerous characters', () => {
  const sanitize = (msg) => msg.replace(/["\\`$]/g, '').slice(0, 500);
  
  assert.equal(sanitize('Normal commit message'), 'Normal commit message');
  assert.equal(sanitize('Fix "bug" in code'), 'Fix bug in code');
  assert.equal(sanitize('Inject $(rm -rf /)'), 'Inject (rm -rf /)');
  assert.equal(sanitize('Inject `rm -rf /`'), 'Inject rm -rf /');
  assert.equal(sanitize('Path: C:\\Windows'), 'Path: C:Windows');
  assert.equal(sanitize('$HOME exploit'), 'HOME exploit');
  
  // Length limit
  const longMsg = 'a'.repeat(1000);
  assert.equal(sanitize(longMsg).length, 500);
});
