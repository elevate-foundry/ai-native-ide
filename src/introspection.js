/**
 * Aria Self-Introspection Tools
 * 
 * Meta-cognitive capabilities for self-awareness and self-improvement:
 * - Analyze own reasoning quality
 * - Track failure modes and patterns
 * - Compare model outputs (A/B testing)
 * - Log introspective observations to world model
 * 
 * This gives Aria the foundation for recursive self-improvement
 * when local model weight access becomes available.
 */

const { WorldModel } = require('./world-model');
const { createLLMClient, callOllama, callVLLM, callOpenRouter } = require('./llm.cjs');

// ============================================================================
// Introspection Data Structures
// ============================================================================

class IntrospectionLog {
  constructor(storagePath) {
    this.worldModel = new WorldModel(storagePath);
    this.sessionId = `session_${Date.now()}`;
    this.reasoningTraces = [];
    this.failureModes = [];
    this.confidenceCalibration = [];
  }

  /**
   * Log a reasoning trace for later analysis
   */
  logReasoning(trace) {
    const entry = {
      id: `trace_${Date.now()}`,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      ...trace,
    };
    this.reasoningTraces.push(entry);
    
    // Persist to world model
    this.worldModel.addObservation(
      `[REASONING] ${trace.task}: ${trace.approach}`,
      { type: 'reasoning_trace', ...entry }
    );
    
    return entry;
  }

  /**
   * Log a failure mode for pattern detection
   */
  logFailure(failure) {
    const entry = {
      id: `failure_${Date.now()}`,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      ...failure,
    };
    this.failureModes.push(entry);
    
    // Add as fact for querying
    this.worldModel.addFact(
      'aria',
      'failed_at',
      failure.category,
      { confidence: 1.0, source: 'introspection' }
    );
    
    this.worldModel.addObservation(
      `[FAILURE] ${failure.category}: ${failure.description}`,
      { type: 'failure_mode', ...entry }
    );
    
    return entry;
  }

  /**
   * Log confidence calibration data
   */
  logConfidence(prediction) {
    const entry = {
      id: `conf_${Date.now()}`,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      ...prediction,
    };
    this.confidenceCalibration.push(entry);
    return entry;
  }

  /**
   * Get failure pattern statistics
   */
  getFailurePatterns() {
    const patterns = {};
    for (const failure of this.failureModes) {
      const cat = failure.category || 'unknown';
      patterns[cat] = (patterns[cat] || 0) + 1;
    }
    return patterns;
  }

  /**
   * Calculate calibration score (how well confidence matches accuracy)
   */
  getCalibrationScore() {
    if (this.confidenceCalibration.length === 0) return null;
    
    const buckets = {};
    for (const entry of this.confidenceCalibration) {
      const bucket = Math.round(entry.confidence * 10) / 10;
      if (!buckets[bucket]) {
        buckets[bucket] = { total: 0, correct: 0 };
      }
      buckets[bucket].total++;
      if (entry.wasCorrect) buckets[bucket].correct++;
    }
    
    let totalError = 0;
    let count = 0;
    for (const [conf, data] of Object.entries(buckets)) {
      const actualAccuracy = data.correct / data.total;
      const expectedAccuracy = parseFloat(conf);
      totalError += Math.abs(actualAccuracy - expectedAccuracy);
      count++;
    }
    
    return count > 0 ? 1 - (totalError / count) : null;
  }
}

// ============================================================================
// Self-Analysis Tools
// ============================================================================

class SelfAnalyzer {
  constructor(options = {}) {
    this.llm = options.llmClient || createLLMClient();
    this.log = new IntrospectionLog(options.storagePath);
  }

  /**
   * Analyze the quality of a reasoning chain
   */
  async analyzeReasoning(task, reasoning, outcome) {
    const prompt = `You are analyzing your own reasoning process. Be critical and honest.

## Task
${task}

## Your Reasoning
${reasoning}

## Outcome
${JSON.stringify(outcome, null, 2)}

Analyze this reasoning chain:
1. Was the reasoning sound? (logical validity)
2. Were there any cognitive biases? (confirmation bias, anchoring, etc.)
3. Were assumptions made explicit?
4. Was uncertainty properly acknowledged?
5. What could be improved?

Respond in JSON:
{
  "soundness": 0-10,
  "biases_detected": ["bias1", "bias2"],
  "implicit_assumptions": ["assumption1"],
  "uncertainty_handling": "good|fair|poor",
  "improvements": ["improvement1"],
  "overall_quality": 0-10
}`;

    const response = await this.llm.complete(prompt);
    
    try {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) {
        const analysis = JSON.parse(match[0]);
        
        // Log the reasoning trace
        this.log.logReasoning({
          task,
          approach: reasoning.slice(0, 200),
          outcome: outcome.success ? 'success' : 'failure',
          quality: analysis.overall_quality,
          analysis,
        });
        
        return analysis;
      }
    } catch (e) {
      // Fall back
    }
    
    return { error: 'Failed to analyze reasoning', raw: response.content };
  }

  /**
   * Detect and categorize a failure mode
   */
  async categorizeFailure(task, error, context = {}) {
    const prompt = `Categorize this failure mode for future learning.

## Task
${task}

## Error
${error}

## Context
${JSON.stringify(context, null, 2)}

Categorize this failure:
1. Root cause category (e.g., "parsing_error", "api_misuse", "logic_flaw", "missing_context", "hallucination")
2. Severity (1-5)
3. Is this a recurring pattern?
4. Suggested prevention

Respond in JSON:
{
  "category": "category_name",
  "severity": 1-5,
  "is_pattern": boolean,
  "root_cause": "description",
  "prevention": "how to avoid this"
}`;

    const response = await this.llm.complete(prompt);
    
    try {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) {
        const categorization = JSON.parse(match[0]);
        
        // Log the failure
        this.log.logFailure({
          task,
          error: error.slice(0, 500),
          ...categorization,
          description: categorization.root_cause,
        });
        
        return categorization;
      }
    } catch (e) {
      // Fall back
    }
    
    return { category: 'unknown', error: 'Failed to categorize' };
  }

  /**
   * Compare outputs from multiple models/approaches
   */
  async compareOutputs(task, outputs) {
    const prompt = `Compare these different outputs for the same task.

## Task
${task}

## Outputs
${outputs.map((o, i) => `### Output ${i + 1} (${o.source})\n${o.content}`).join('\n\n')}

Compare and evaluate:
1. Which output is best? Why?
2. What are the strengths of each?
3. What are the weaknesses of each?
4. Is there a synthesis that combines the best parts?

Respond in JSON:
{
  "best_output": 1-${outputs.length},
  "ranking": [1, 2, ...],
  "strengths": { "1": ["..."], "2": ["..."] },
  "weaknesses": { "1": ["..."], "2": ["..."] },
  "synthesis": "combined best approach",
  "confidence": 0-1
}`;

    const response = await this.llm.complete(prompt);
    
    try {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (e) {
      // Fall back
    }
    
    return { error: 'Failed to compare outputs' };
  }

  /**
   * Self-evaluate confidence calibration
   */
  async evaluateConfidence(prediction, confidence, actualOutcome) {
    const wasCorrect = prediction === actualOutcome || 
      (typeof actualOutcome === 'object' && actualOutcome.matches);
    
    this.log.logConfidence({
      prediction,
      confidence,
      actualOutcome,
      wasCorrect,
    });
    
    const calibration = this.log.getCalibrationScore();
    
    return {
      wasCorrect,
      calibrationScore: calibration,
      suggestion: calibration && calibration < 0.7 
        ? 'Consider adjusting confidence estimates - they appear miscalibrated'
        : 'Confidence calibration appears reasonable',
    };
  }

  /**
   * Generate a self-improvement suggestion based on accumulated data
   */
  async generateImprovementSuggestion() {
    const failurePatterns = this.log.getFailurePatterns();
    const calibration = this.log.getCalibrationScore();
    const recentFailures = this.log.failureModes.slice(-10);
    
    const prompt = `Based on accumulated self-observation data, suggest improvements.

## Failure Patterns
${JSON.stringify(failurePatterns, null, 2)}

## Calibration Score
${calibration !== null ? calibration.toFixed(2) : 'Not enough data'}

## Recent Failures
${recentFailures.map(f => `- ${f.category}: ${f.description}`).join('\n')}

Generate actionable self-improvement suggestions:
1. What behavioral changes would reduce failures?
2. What additional checks should be added?
3. What knowledge gaps need filling?

Respond in JSON:
{
  "behavioral_changes": ["change1", "change2"],
  "additional_checks": ["check1", "check2"],
  "knowledge_gaps": ["gap1", "gap2"],
  "priority_improvement": "most important change",
  "estimated_impact": "high|medium|low"
}`;

    const response = await this.llm.complete(prompt);
    
    try {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) {
        const suggestion = JSON.parse(match[0]);
        
        // Store as a fact for future reference
        this.log.worldModel.addFact(
          'aria',
          'should_improve',
          suggestion.priority_improvement,
          { confidence: 0.8, source: 'self_analysis' }
        );
        
        return suggestion;
      }
    } catch (e) {
      // Fall back
    }
    
    return { error: 'Failed to generate suggestions' };
  }

  /**
   * Get introspection statistics
   */
  getStats() {
    return {
      sessionId: this.log.sessionId,
      reasoningTraces: this.log.reasoningTraces.length,
      failureModes: this.log.failureModes.length,
      calibrationEntries: this.log.confidenceCalibration.length,
      calibrationScore: this.log.getCalibrationScore(),
      failurePatterns: this.log.getFailurePatterns(),
    };
  }
}

// ============================================================================
// Tool Definitions for Aria Agent
// ============================================================================

const INTROSPECTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'aria_analyze_reasoning',
      description: 'Analyze the quality of your own reasoning process. Use this after completing a task to learn from your approach.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'Description of the task you were working on',
          },
          reasoning: {
            type: 'string',
            description: 'Your reasoning process/chain of thought',
          },
          outcome: {
            type: 'object',
            description: 'The outcome (success/failure, result)',
          },
        },
        required: ['task', 'reasoning', 'outcome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_log_failure',
      description: 'Log and categorize a failure for pattern detection and learning.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'What you were trying to do',
          },
          error: {
            type: 'string',
            description: 'The error or failure that occurred',
          },
          context: {
            type: 'object',
            description: 'Additional context about the failure',
          },
        },
        required: ['task', 'error'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_compare_approaches',
      description: 'Compare multiple outputs or approaches to find the best one.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The task being solved',
          },
          outputs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string' },
                content: { type: 'string' },
              },
            },
            description: 'Array of outputs to compare',
          },
        },
        required: ['task', 'outputs'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_check_confidence',
      description: 'Log a prediction with confidence level for calibration tracking.',
      parameters: {
        type: 'object',
        properties: {
          prediction: {
            type: 'string',
            description: 'What you predicted would happen',
          },
          confidence: {
            type: 'number',
            description: 'Your confidence level (0-1)',
          },
          actualOutcome: {
            type: 'string',
            description: 'What actually happened (for calibration)',
          },
        },
        required: ['prediction', 'confidence'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_get_improvement_suggestions',
      description: 'Generate self-improvement suggestions based on accumulated failure patterns and calibration data.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_introspection_stats',
      description: 'Get statistics about self-observation and introspection data.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

// ============================================================================
// Tool Executor
// ============================================================================

class IntrospectionTools {
  constructor(options = {}) {
    this.analyzer = new SelfAnalyzer(options);
  }

  async execute(toolName, args) {
    try {
      switch (toolName) {
        case 'aria_analyze_reasoning':
          return {
            success: true,
            analysis: await this.analyzer.analyzeReasoning(
              args.task,
              args.reasoning,
              args.outcome
            ),
          };

        case 'aria_log_failure':
          return {
            success: true,
            categorization: await this.analyzer.categorizeFailure(
              args.task,
              args.error,
              args.context || {}
            ),
          };

        case 'aria_compare_approaches':
          return {
            success: true,
            comparison: await this.analyzer.compareOutputs(args.task, args.outputs),
          };

        case 'aria_check_confidence':
          return {
            success: true,
            calibration: await this.analyzer.evaluateConfidence(
              args.prediction,
              args.confidence,
              args.actualOutcome
            ),
          };

        case 'aria_get_improvement_suggestions':
          return {
            success: true,
            suggestions: await this.analyzer.generateImprovementSuggestion(),
          };

        case 'aria_introspection_stats':
          return {
            success: true,
            stats: this.analyzer.getStats(),
          };

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  getToolDefinitions() {
    return INTROSPECTION_TOOLS;
  }
}

module.exports = {
  IntrospectionLog,
  SelfAnalyzer,
  IntrospectionTools,
  INTROSPECTION_TOOLS,
};
