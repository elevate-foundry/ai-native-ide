/**
 * Aria Runtime - LLM-powered runtime loop
 * 
 * Wires the OpenRouter LLM into the RuntimeNativeIDE loop for real
 * AI-driven planning, evaluation, and repair.
 */

const { RuntimeNativeIDE, SensorSnapshot } = require('./core');
const { createLLMClient, ARIA_SYSTEM_PROMPT } = require('./llm.cjs');

/**
 * Create an LLM-powered planner
 */
function createAriaPlanner(llmClient) {
  return async function planner(goal) {
    const response = await llmClient.chat([
      {
        role: 'user',
        content: `Create a step-by-step plan to achieve this goal:

## Goal
${goal}

## Available Actions
- navigate(url): Go to a URL
- login(username, password): Fill login form and submit
- fillForm(fields): Fill form fields
- click(selector): Click an element
- waitFor(selector): Wait for element to appear
- assertElement(selector, expected): Verify element state

Respond with a JSON plan:
{
  "steps": [
    { "action": "actionName", "params": {...}, "description": "what this does" }
  ]
}`
      }
    ]);

    try {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (e) {
      // Fall back to simple plan
    }

    return {
      steps: [{ action: 'manual', params: { goal }, description: goal }],
      raw: response.content,
    };
  };
}

/**
 * Create an LLM-powered evaluator
 */
function createAriaEvaluator(llmClient) {
  return async function evaluator(snapshot, context) {
    const { goal, iteration, history } = context;
    
    const historyText = history.length > 0
      ? history.map(h => `Iteration ${h.iteration}: ${JSON.stringify(h.evaluation)}`).join('\n')
      : '(first iteration)';

    const response = await llmClient.chat([
      {
        role: 'user',
        content: `## Goal
${goal}

## Current Iteration
${iteration}

## Previous History
${historyText}

## Current Sensor Snapshot
### Code State
${JSON.stringify(snapshot.codeState, null, 2)}

### Execution State
${JSON.stringify(snapshot.executionState, null, 2)}

### Interface State
${JSON.stringify(snapshot.interfaceState, null, 2)}

Evaluate the current state:
1. Is the goal achieved? (done: true/false)
2. If not, what repair is needed?

Respond in JSON:
{
  "done": boolean,
  "reason": "explanation",
  "repairPlan": { "steps": [...] }  // only if done is false
}`
      }
    ]);

    try {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (e) {
      // Fall back
    }

    return {
      done: false,
      reason: response.content,
      repairPlan: { steps: [{ action: 'review', description: 'Manual review needed' }] },
    };
  };
}

/**
 * Create a complete Aria-powered runtime
 */
function createAriaRuntime(options = {}) {
  const llmClient = options.llmClient || createLLMClient(options.llmConfig);
  
  const planner = options.planner || createAriaPlanner(llmClient);
  const evaluator = options.evaluator || createAriaEvaluator(llmClient);
  
  // Default modifier just logs the plan
  const modifier = options.modifier || async function(plan, context) {
    console.log(`[Aria] Iteration ${context.iteration}: Executing plan...`);
    return plan;
  };
  
  // Default executor returns mock state (override with real Playwright)
  const executor = options.executor || async function(context) {
    return {
      status: 'executed',
      iteration: context.iteration,
      timestamp: new Date().toISOString(),
    };
  };
  
  // Default observer returns mock interface state
  const observer = options.observer || async function(context) {
    return {
      dom: '(mock DOM state)',
      console: [],
      network: [],
    };
  };
  
  return new RuntimeNativeIDE({
    planner,
    modifier,
    executor,
    observer,
    evaluator,
    maxIterations: options.maxIterations || 5,
  });
}

module.exports = {
  createAriaRuntime,
  createAriaPlanner,
  createAriaEvaluator,
};
