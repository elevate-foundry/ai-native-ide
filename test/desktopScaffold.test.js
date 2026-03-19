const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('desktop UI scaffold files exist', () => {
  assert.equal(fs.existsSync('desktop/index.html'), true);
  assert.equal(fs.existsSync('desktop/favicon.ico'), true);
  assert.equal(fs.existsSync('desktop/icon.svg'), true);
});

test('package scripts include tauri entrypoints', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(typeof pkg.scripts['tauri:web'], 'string');
  assert.equal(typeof pkg.scripts['tauri:dev'], 'string');
  assert.equal(typeof pkg.scripts['tauri:build'], 'string');
});

test('tauri config points to desktop frontend and dev url', () => {
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(conf.build.devUrl, 'http://127.0.0.1:4173');
  assert.equal(conf.build.frontendDist, '../desktop');
});

test('rust backend declares runtime and sensor commands', () => {
  const rust = read('src-tauri/src/main.rs');
  assert.match(rust, /fn run_runtime_loop\(/);
  assert.match(rust, /fn get_interface_sensor_snapshot\(/);
  assert.match(rust, /invoke_handler\(tauri::generate_handler!\[/);
});
