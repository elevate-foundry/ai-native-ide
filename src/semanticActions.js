/**
 * Semantic interaction helpers that wrap raw browser operations.
 */

async function navigate(page, route) {
  await page.goto(route);
}

async function login(page, { username, password }) {
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', password);
  await page.click('[data-action="login"]');
}

async function submitForm(page, formId, fields) {
  for (const [name, value] of Object.entries(fields)) {
    await page.fill(`#${formId} [name="${name}"]`, value);
  }

  await page.click(`#${formId} [type="submit"]`);
}

module.exports = {
  navigate,
  login,
  submitForm,
};
