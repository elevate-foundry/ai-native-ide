const test = require('node:test');
const assert = require('node:assert/strict');

const { RuntimeNativeIDE, SensorSnapshot, PlaywrightInterfaceObserver } = require('../src/core');

function createBaseConfig(overrides = {}) {
  return {
    planner: async () => ({ next: 'initial plan' }),
    modifier: async () => undefined,
    executor: async () => ({ exitCode: 0 }),
    observer: async () => ({ dom: 'ok' }),
    evaluator: async () => ({ done: true }),
    ...overrides,
  };
}

test('SensorSnapshot stores all sensor layers', () => {
  const snapshot = new SensorSnapshot({
    codeState: { files: ['a.js'] },
    executionState: { tests: 'pass' },
    interfaceState: { dom: '<main />' },
  });

  assert.deepEqual(snapshot.codeState, { files: ['a.js'] });
  assert.deepEqual(snapshot.executionState, { tests: 'pass' });
  assert.deepEqual(snapshot.interfaceState, { dom: '<main />' });
});

test('RuntimeNativeIDE validates constructor dependencies', () => {
  assert.throws(() => new RuntimeNativeIDE({}), /planner must be a function/);
  assert.throws(() => new RuntimeNativeIDE(createBaseConfig({ maxIterations: 0 })), /maxIterations must be a positive integer/);
  assert.throws(
    () => new RuntimeNativeIDE(createBaseConfig({ observer: { bad: true } })),
    /observer must be a function or an object with an observe\(\) function/
  );
});

test('completes when evaluator marks done', async () => {
  const calls = [];

  const ide = new RuntimeNativeIDE(
    createBaseConfig({
      planner: async (goal) => ({ next: `implement ${goal}` }),
      modifier: async (plan) => {
        calls.push(['modifier', plan.next]);
      },
      evaluator: async () => ({ done: true, reason: 'stable' }),
    })
  );

  const result = await ide.run('runtime-native loop');

  assert.equal(result.status, 'completed');
  assert.equal(result.iterations, 1);
  assert.equal(calls.length, 1);
  assert.equal(result.result.reason, 'stable');
});

test('replans when evaluator returns repairPlan', async () => {
  const seenPlans = [];
  let count = 0;

  const ide = new RuntimeNativeIDE(
    createBaseConfig({
      modifier: async (plan) => {
        seenPlans.push(plan.next);
      },
      evaluator: async () => {
        count += 1;

        if (count === 1) {
          return { done: false, repairPlan: { next: 'repair plan' } };
        }

        return { done: true };
      },
      maxIterations: 3,
    })
  );

  const result = await ide.run('fix flaky flow');

  assert.equal(result.status, 'completed');
  assert.deepEqual(seenPlans, ['initial plan', 'repair plan']);
});

test('returns max-iterations-exhausted when never done', async () => {
  const ide = new RuntimeNativeIDE(
    createBaseConfig({
      evaluator: async () => ({ done: false }),
      maxIterations: 2,
    })
  );

  const result = await ide.run('non-terminating goal');

  assert.equal(result.status, 'max-iterations-exhausted');
  assert.equal(result.iterations, 2);
  assert.equal(result.history.length, 2);
});

test('passes growing history and iteration context through the loop', async () => {
  const observedHistoryLengths = [];

  const ide = new RuntimeNativeIDE(
    createBaseConfig({
      maxIterations: 3,
      observer: async ({ history }) => {
        observedHistoryLengths.push(history.length);
        return { dom: `step-${history.length}` };
      },
      evaluator: async (_snapshot, { iteration }) => ({ done: iteration === 3 }),
    })
  );

  const result = await ide.run('context propagation');

  assert.equal(result.status, 'completed');
  assert.deepEqual(observedHistoryLengths, [0, 1, 2]);
  assert.equal(result.history.length, 3);
});

test('supports observer objects with observe()', async () => {
  const observer = {
    async observe({ iteration }) {
      return { dom: `iteration-${iteration}` };
    },
  };

  const ide = new RuntimeNativeIDE(
    createBaseConfig({
      observer,
      evaluator: async (snapshot) => {
        assert.equal(snapshot.interfaceState.dom, 'iteration-1');
        return { done: true };
      },
    })
  );

  const result = await ide.run('observer object mode');
  assert.equal(result.status, 'completed');
});

test('PlaywrightInterfaceObserver runs open -> scenario -> collect in order', async () => {
  const steps = [];

  const observer = new PlaywrightInterfaceObserver({
    openApp: async () => steps.push('open'),
    runScenario: async () => steps.push('scenario'),
    collectSignals: async () => {
      steps.push('collect');
      return { dom: 'ok', consoleErrors: [] };
    },
  });

  const output = await observer.observe({ goal: 'verify order' });

  assert.deepEqual(steps, ['open', 'scenario', 'collect']);
  assert.deepEqual(output, { dom: 'ok', consoleErrors: [] });
});

test('PlaywrightInterfaceObserver validates adapter functions', () => {
  assert.throws(
    () => new PlaywrightInterfaceObserver({ openApp: async () => {}, runScenario: async () => {} }),
    /collectSignals must be a function/
  );
});
