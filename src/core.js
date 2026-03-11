/**
 * Runtime-native AI IDE core loop.
 */

class SensorSnapshot {
  constructor({ codeState, executionState, interfaceState }) {
    this.codeState = codeState;
    this.executionState = executionState;
    this.interfaceState = interfaceState;
  }
}

function assertFunction(name, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
}

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

class RuntimeNativeIDE {
  constructor({ planner, modifier, executor, observer, evaluator, maxIterations = 5 }) {
    assertFunction('planner', planner);
    assertFunction('modifier', modifier);
    assertFunction('executor', executor);
    assertFunction('evaluator', evaluator);
    assertPositiveInteger('maxIterations', maxIterations);

    if (typeof observer !== 'function' && !(observer && typeof observer.observe === 'function')) {
      throw new TypeError('observer must be a function or an object with an observe() function');
    }

    this.planner = planner;
    this.modifier = modifier;
    this.executor = executor;
    this.observer = observer;
    this.evaluator = evaluator;
    this.maxIterations = maxIterations;
  }

  async observe(context) {
    if (typeof this.observer === 'function') {
      return this.observer(context);
    }

    return this.observer.observe(context);
  }

  async run(goal) {
    const history = [];
    let plan = await this.planner(goal);

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      await this.modifier(plan, { goal, iteration, history });
      const executionState = await this.executor({ goal, iteration, history });
      const interfaceState = await this.observe({ goal, iteration, history });

      const snapshot = new SensorSnapshot({
        codeState: { plan },
        executionState,
        interfaceState,
      });

      const evaluation = await this.evaluator(snapshot, { goal, iteration, history });
      history.push({ iteration, snapshot, evaluation });

      if (evaluation.done) {
        return {
          goal,
          status: 'completed',
          iterations: iteration,
          result: evaluation,
          history,
        };
      }

      plan = evaluation.repairPlan ?? plan;
    }

    return {
      goal,
      status: 'max-iterations-exhausted',
      iterations: this.maxIterations,
      history,
    };
  }
}

/**
 * Observer adapter shape expected for Playwright integration.
 */
class PlaywrightInterfaceObserver {
  constructor({ openApp, runScenario, collectSignals }) {
    assertFunction('openApp', openApp);
    assertFunction('runScenario', runScenario);
    assertFunction('collectSignals', collectSignals);

    this.openApp = openApp;
    this.runScenario = runScenario;
    this.collectSignals = collectSignals;
  }

  async observe(context) {
    await this.openApp(context);
    await this.runScenario(context);
    return this.collectSignals(context);
  }
}

module.exports = {
  SensorSnapshot,
  RuntimeNativeIDE,
  PlaywrightInterfaceObserver,
};
