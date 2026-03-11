const test = require('node:test');
const assert = require('node:assert/strict');

const { navigate, login, submitForm } = require('../src/semanticActions');

function createMockPage() {
  const calls = [];

  return {
    calls,
    async goto(route) {
      calls.push(['goto', route]);
    },
    async fill(selector, value) {
      calls.push(['fill', selector, value]);
    },
    async click(selector) {
      calls.push(['click', selector]);
    },
  };
}

test('navigate calls page.goto with provided route', async () => {
  const page = createMockPage();

  await navigate(page, '/dashboard');

  assert.deepEqual(page.calls, [['goto', '/dashboard']]);
});

test('login fills credentials and clicks login action', async () => {
  const page = createMockPage();

  await login(page, { username: 'alice', password: 'secret' });

  assert.deepEqual(page.calls, [
    ['fill', '[name="username"]', 'alice'],
    ['fill', '[name="password"]', 'secret'],
    ['click', '[data-action="login"]'],
  ]);
});

test('submitForm fills every field then submits', async () => {
  const page = createMockPage();

  await submitForm(page, 'signup-form', {
    email: 'user@example.com',
    fullName: 'User',
  });

  assert.deepEqual(page.calls, [
    ['fill', '#signup-form [name="email"]', 'user@example.com'],
    ['fill', '#signup-form [name="fullName"]', 'User'],
    ['click', '#signup-form [type="submit"]'],
  ]);
});

test('submitForm supports empty field maps and still submits', async () => {
  const page = createMockPage();

  await submitForm(page, 'filters', {});

  assert.deepEqual(page.calls, [['click', '#filters [type="submit"]']]);
});
