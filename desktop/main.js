const runButton = document.getElementById('runLoop');
const goalInput = document.getElementById('goal');
const loopOutput = document.getElementById('loopOutput');
const domState = document.getElementById('domState');
const consoleState = document.getElementById('consoleState');
const networkState = document.getElementById('networkState');

async function invokeTauri(command, args = {}) {
  if (window.__TAURI__?.core?.invoke) {
    return window.__TAURI__.core.invoke(command, args);
  }

  if (command === 'run_runtime_loop') {
    return {
      status: 'completed',
      iterations: 2,
      result: { reason: 'mocked browser sensor feedback reached stable state' },
      history: [
        { iteration: 1, evaluation: { done: false, repairPlan: { next: 'retry with semantic login' } } },
        { iteration: 2, evaluation: { done: true, reason: 'stable' } },
      ],
    };
  }

  if (command === 'get_interface_sensor_snapshot') {
    return {
      dom: '#app > main[data-route="/dashboard"]',
      consoleErrors: [],
      networkRequests: ['/api/login 200', '/api/dashboard 200'],
    };
  }

  throw new Error(`Unsupported command in browser-only mode: ${command}`);
}

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  try {
    const goal = goalInput.value.trim();
    const result = await invokeTauri('run_runtime_loop', { goal });
    const sensor = await invokeTauri('get_interface_sensor_snapshot');

    loopOutput.textContent = JSON.stringify(result, null, 2);
    domState.textContent = sensor.dom;
    consoleState.textContent = JSON.stringify(sensor.consoleErrors, null, 2);
    networkState.textContent = JSON.stringify(sensor.networkRequests, null, 2);
  } catch (error) {
    loopOutput.textContent = `Error: ${error.message}`;
  } finally {
    runButton.disabled = false;
  }
});
