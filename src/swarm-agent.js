/**
 * Swarm Agent - Multi-model agentic swarm with tool use
 * 
 * Instead of a single model (like me), this runs multiple models in parallel,
 * braids their outputs, and executes tool calls via consensus.
 * 
 * The swarm can build files, edit code, run commands — everything I can do,
 * but with the combined intelligence of GPT-4o, Sonnet, Opus, Llama, etc.
 */

const fs = require('fs').promises;
const path = require('path');

const DEFAULT_SWARM_MODELS = [
  'anthropic/claude-sonnet-4',
  'openai/gpt-4o',
  'anthropic/claude-3.5-sonnet',
  'meta-llama/llama-3.1-70b-instruct',
];

// Simplified tool definitions for the swarm (defined inline to avoid circular dependency)
const SWARM_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace a string in a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          old_string: { type: 'string', description: 'String to find' },
          new_string: { type: 'string', description: 'String to replace with' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files in a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to run' },
        },
        required: ['command'],
      },
    },
  },
];

class SwarmAgent {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
    this.models = options.models || DEFAULT_SWARM_MODELS;
    this.workdir = options.workdir || process.cwd();
    this.tools = null; // Lazy-loaded to avoid circular dependency
    this.listeners = new Map();
    
    // Consensus settings
    this.consensusThreshold = options.consensusThreshold || 0.5; // 50% agreement
    this.maxIterations = options.maxIterations || 10;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return this;
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(data));
  }

  /**
   * Run the swarm on a task
   */
  async run(task, context = '') {
    this.emit('start', { task, models: this.models });
    
    const systemPrompt = `You are part of a swarm of AI agents working together to complete a task.
You have access to tools for file operations and command execution.
Be concise and direct. When you need to create or modify files, use the tools.
Always respond with either:
1. A tool call to take action
2. A final answer if the task is complete

Context about the workspace:
${context}

Current working directory: ${this.workdir}`;

    let iteration = 0;
    let completed = false;
    let finalResult = null;
    const history = [];

    while (!completed && iteration < this.maxIterations) {
      iteration++;
      this.emit('iteration', { iteration, maxIterations: this.maxIterations });

      // Query all models in parallel
      const responses = await this._queryAllModels(systemPrompt, task, history);
      
      // Analyze responses for tool calls and consensus
      const analysis = this._analyzeResponses(responses);
      this.emit('analysis', analysis);

      if (analysis.hasConsensus) {
        if (analysis.consensusType === 'tool_call') {
          // Execute the consensus tool call
          const result = await this._executeToolCall(analysis.consensusTool);
          this.emit('toolResult', { tool: analysis.consensusTool, result });
          
          history.push({
            role: 'assistant',
            content: `[Swarm consensus] Calling ${analysis.consensusTool.name}`,
            tool_calls: [{ function: analysis.consensusTool }],
          });
          history.push({
            role: 'tool',
            content: JSON.stringify(result),
            name: analysis.consensusTool.name,
          });
        } else if (analysis.consensusType === 'complete') {
          completed = true;
          finalResult = analysis.consensusAnswer;
        }
      } else {
        // No consensus - braid the responses and continue
        const braidedResponse = this._braidResponses(responses);
        this.emit('noConsensus', { responses, braided: braidedResponse });
        
        history.push({
          role: 'assistant',
          content: braidedResponse,
        });
        
        // If models are just chatting without action, nudge them
        if (iteration > 2 && !analysis.anyToolCalls) {
          history.push({
            role: 'user',
            content: 'Please take action using the available tools, or indicate if the task is complete.',
          });
        }
      }
    }

    this.emit('complete', { 
      iterations: iteration, 
      result: finalResult,
      history,
    });

    return {
      success: completed,
      result: finalResult,
      iterations: iteration,
      history,
    };
  }

  async _queryAllModels(systemPrompt, task, history) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
      ...history,
    ];

    const promises = this.models.map(async (model) => {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com/elevate-foundry/ai-native-ide',
            'X-Title': 'Aria Swarm Agent',
          },
          body: JSON.stringify({
            model,
            messages,
            tools: SWARM_TOOLS,
            tool_choice: 'auto',
            max_tokens: 2000,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          throw new Error(`${model}: ${response.status}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        
        return {
          model,
          content: choice?.message?.content || '',
          tool_calls: choice?.message?.tool_calls || [],
          finish_reason: choice?.finish_reason,
        };
      } catch (e) {
        this.emit('modelError', { model, error: e.message });
        return { model, error: e.message, content: '', tool_calls: [] };
      }
    });

    return Promise.all(promises);
  }

  _analyzeResponses(responses) {
    const validResponses = responses.filter(r => !r.error);
    const toolCalls = [];
    const textResponses = [];

    for (const r of validResponses) {
      if (r.tool_calls && r.tool_calls.length > 0) {
        for (const tc of r.tool_calls) {
          toolCalls.push({
            model: r.model,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || '{}'),
          });
        }
      }
      if (r.content) {
        textResponses.push({ model: r.model, content: r.content });
      }
    }

    // Check for tool call consensus
    if (toolCalls.length > 0) {
      const toolGroups = this._groupByTool(toolCalls);
      const largestGroup = Object.values(toolGroups).sort((a, b) => b.length - a.length)[0];
      
      if (largestGroup && largestGroup.length / validResponses.length >= this.consensusThreshold) {
        // Consensus on a tool call - merge arguments
        const mergedArgs = this._mergeToolArguments(largestGroup);
        return {
          hasConsensus: true,
          consensusType: 'tool_call',
          consensusTool: {
            name: largestGroup[0].name,
            arguments: mergedArgs,
          },
          agreement: largestGroup.length / validResponses.length,
          models: largestGroup.map(t => t.model),
        };
      }
    }

    // Check for completion consensus
    const completionIndicators = ['complete', 'done', 'finished', 'task is complete'];
    const completionResponses = textResponses.filter(r => 
      completionIndicators.some(ind => r.content.toLowerCase().includes(ind))
    );
    
    if (completionResponses.length / validResponses.length >= this.consensusThreshold) {
      return {
        hasConsensus: true,
        consensusType: 'complete',
        consensusAnswer: this._braidResponses(completionResponses.map(r => ({ ...r, tool_calls: [] }))),
        agreement: completionResponses.length / validResponses.length,
      };
    }

    return {
      hasConsensus: false,
      toolCalls,
      textResponses,
      anyToolCalls: toolCalls.length > 0,
    };
  }

  _groupByTool(toolCalls) {
    const groups = {};
    for (const tc of toolCalls) {
      const key = tc.name;
      if (!groups[key]) groups[key] = [];
      groups[key].push(tc);
    }
    return groups;
  }

  _mergeToolArguments(toolCalls) {
    // For file writes, prefer the longest/most complete content
    // For other args, use majority voting
    const merged = {};
    const argCounts = {};

    for (const tc of toolCalls) {
      for (const [key, value] of Object.entries(tc.arguments)) {
        if (!argCounts[key]) argCounts[key] = {};
        
        const valueKey = typeof value === 'string' ? value : JSON.stringify(value);
        if (!argCounts[key][valueKey]) {
          argCounts[key][valueKey] = { count: 0, value };
        }
        argCounts[key][valueKey].count++;
      }
    }

    for (const [key, values] of Object.entries(argCounts)) {
      // For content/code, prefer longest
      if (key === 'content' || key === 'new_string') {
        const longest = Object.values(values).sort((a, b) => 
          (b.value?.length || 0) - (a.value?.length || 0)
        )[0];
        merged[key] = longest.value;
      } else {
        // For other args, use most common
        const mostCommon = Object.values(values).sort((a, b) => b.count - a.count)[0];
        merged[key] = mostCommon.value;
      }
    }

    return merged;
  }

  _braidResponses(responses) {
    // Simple sentence-level braiding
    const allSentences = [];
    
    for (const r of responses) {
      if (r.content) {
        const sentences = r.content.split(/(?<=[.!?])\s+/);
        sentences.forEach((s, i) => {
          allSentences.push({ model: r.model, sentence: s.trim(), index: i });
        });
      }
    }

    // Interleave sentences from different models
    const braided = [];
    const byIndex = {};
    
    for (const s of allSentences) {
      if (!byIndex[s.index]) byIndex[s.index] = [];
      byIndex[s.index].push(s);
    }

    for (const index of Object.keys(byIndex).sort((a, b) => a - b)) {
      const sentences = byIndex[index];
      // Pick one sentence per index position (rotate through models)
      const pick = sentences[index % sentences.length];
      if (pick && pick.sentence) {
        braided.push(pick.sentence);
      }
    }

    return braided.join(' ');
  }

  async _executeToolCall(tool) {
    try {
      // Lazy-load AriaTools to avoid circular dependency
      if (!this.tools) {
        const { AriaTools } = require('./tools');
        this.tools = new AriaTools({ workingDirectory: this.workdir });
      }
      return await this.tools.execute(tool.name, tool.arguments);
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// ============================================================================
// Tool Definition for Aria to invoke the swarm
// ============================================================================

const SWARM_AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'swarm_build',
      description: 'Delegate a complex task to the AI swarm (GPT-4o, Sonnet, Opus, Llama working together). The swarm will use tools to build files, edit code, and complete the task through consensus.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The task to delegate to the swarm (e.g., "Create a React component for user authentication")',
          },
          context: {
            type: 'string',
            description: 'Additional context about the workspace or requirements',
          },
          models: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: specific models to use (defaults to GPT-4o, Sonnet, Opus, Llama)',
          },
        },
        required: ['task'],
      },
    },
  },
];

class SwarmAgentTools {
  constructor(workdir) {
    this.workdir = workdir;
  }

  async execute(toolName, params) {
    if (toolName === 'swarm_build') {
      const swarm = new SwarmAgent({
        workdir: this.workdir,
        models: params.models,
      });

      // Log events
      swarm.on('start', (data) => console.log('[Swarm] Starting:', data.task));
      swarm.on('iteration', (data) => console.log(`[Swarm] Iteration ${data.iteration}/${data.maxIterations}`));
      swarm.on('toolResult', (data) => console.log(`[Swarm] Tool ${data.tool.name}:`, data.result.success ? 'success' : 'failed'));
      swarm.on('complete', (data) => console.log('[Swarm] Complete after', data.iterations, 'iterations'));

      return swarm.run(params.task, params.context || '');
    }

    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  getToolDefinitions() {
    return SWARM_AGENT_TOOLS;
  }
}

module.exports = {
  SwarmAgent,
  SwarmAgentTools,
  SWARM_AGENT_TOOLS,
  DEFAULT_SWARM_MODELS,
};
