const {
  SensorSnapshot,
  RuntimeNativeIDE,
  PlaywrightInterfaceObserver,
} = require('./core');
const { navigate, login, submitForm } = require('./semanticActions');

let llmExports = {};
try {
  llmExports = require('./llm.cjs');
} catch (e) {
  // LLM module not available in CommonJS context
}

module.exports = {
  SensorSnapshot,
  RuntimeNativeIDE,
  PlaywrightInterfaceObserver,
  navigate,
  login,
  submitForm,
  ...llmExports,
};
