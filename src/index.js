const {
  SensorSnapshot,
  RuntimeNativeIDE,
  PlaywrightInterfaceObserver,
} = require('./core');
const { navigate, login, submitForm } = require('./semanticActions');

module.exports = {
  SensorSnapshot,
  RuntimeNativeIDE,
  PlaywrightInterfaceObserver,
  navigate,
  login,
  submitForm,
};
