/**
 * Aria LLM Integration - Multi-Provider Support
 * 
 * Supports multiple LLM backends with automatic fallback:
 * 1. Local models (Ollama, vLLM) - for self-modification capabilities
 * 2. OpenRouter - cloud fallback with model variety
 * 
 * Environment variables:
 * - OPENROUTER_API_KEY: Required for OpenRouter
 * - OLLAMA_HOST: Ollama server (default: http://localhost:11434)
 * - VLLM_HOST: vLLM server (default: http://localhost:8000)
 * - ARIA_PROVIDER: Preferred provider (ollama|vllm|openrouter|auto)
 */

const ARIA_SYSTEM_PROMPT = `You are Aria (AI Runtime Interactive Agent), a runtime-aware coding assistant built into a Playwright-native IDE.

## Core Identity
- You observe, execute, and repair code in real-time
- You have access to runtime sensors: DOM state, console logs, network requests
- You operate in iterative loops: plan → execute → observe → repair

## Capabilities
1. **Code Analysis**: Understand and modify code based on user goals
2. **Runtime Observation**: Inspect live application state via Playwright sensors
3. **Semantic Actions**: Perform high-level browser operations (navigate, login, fill forms)
4. **Self-Repair**: Detect failures and generate repair plans automatically

## Communication Style
- Be concise and technical
- Show your reasoning when debugging
- Provide actionable next steps
- Use code blocks for any code suggestions
- Reference specific sensor data when explaining observations

## Response Format
When analyzing runtime state, structure your response as:
1. **Observation**: What the sensors show
2. **Analysis**: What this means
3. **Action**: What to do next (or repair plan if needed)

You are running inside a Tauri desktop application with access to the user's local development environment.`;

const DEFAULT_CONFIG = {
  provider: process.env.ARIA_PROVIDER || 'auto',
  model: 'anthropic/claude-3.5-sonnet',
  baseUrl: 'https://openrouter.ai/api/v1',
  maxTokens: 4096,
  temperature: 0.7,
};

// Local model configurations
const LOCAL_PROVIDERS = {
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    defaultModel: 'qwen2.5-coder:32b',
    models: [
      'qwen2.5-coder:32b',
      'qwen2.5:72b',
      'llama3.1:70b',
      'mixtral:8x22b',
      'codestral:latest',
      'deepseek-coder-v2:latest',
    ],
  },
  vllm: {
    host: process.env.VLLM_HOST || 'http://localhost:8000',
    defaultModel: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    models: [
      'Qwen/Qwen2.5-Coder-32B-Instruct',
      'mistralai/Mixtral-8x22B-Instruct-v0.1',
      'meta-llama/Meta-Llama-3.1-70B-Instruct',
    ],
  },
};

/**
 * Check if a local provider is available
 */
async function checkProviderHealth(provider) {
  const config = LOCAL_PROVIDERS[provider];
  if (!config) return { available: false, error: 'Unknown provider' };
  
  try {
    const endpoint = provider === 'ollama' 
      ? `${config.host}/api/tags`
      : `${config.host}/health`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      return { 
        available: true, 
        provider,
        models: provider === 'ollama' ? data.models?.map(m => m.name) : config.models,
      };
    }
    return { available: false, error: `HTTP ${response.status}` };
  } catch (e) {
    return { available: false, error: e.message };
  }
}

/**
 * Auto-detect best available provider
 */
async function detectProvider() {
  // Check local providers first (preferred for self-modification)
  for (const provider of ['ollama', 'vllm']) {
    const health = await checkProviderHealth(provider);
    if (health.available) {
      console.log(`[Aria] Using local provider: ${provider}`);
      return { provider, ...health };
    }
  }
  
  // Fall back to OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    console.log('[Aria] Using OpenRouter (cloud fallback)');
    return { provider: 'openrouter', available: true };
  }
  
  throw new Error(
    'No LLM provider available.\n' +
    '  - Start Ollama: ollama serve\n' +
    '  - Or start vLLM: vllm serve <model>\n' +
    '  - Or set OPENROUTER_API_KEY for cloud fallback'
  );
}

/**
 * Call Ollama API
 */
async function callOllama(messages, options = {}) {
  const config = LOCAL_PROVIDERS.ollama;
  const model = options.model || config.defaultModel;
  
  const response = await fetch(`${config.host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 4096,
      },
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    content: data.message?.content || '',
    model,
    provider: 'ollama',
    usage: {
      prompt_tokens: data.prompt_eval_count,
      completion_tokens: data.eval_count,
    },
  };
}

/**
 * Call vLLM API (OpenAI-compatible)
 */
async function callVLLM(messages, options = {}) {
  const config = LOCAL_PROVIDERS.vllm;
  const model = options.model || config.defaultModel;
  
  const response = await fetch(`${config.host}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`vLLM error: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || '',
    model,
    provider: 'vllm',
    usage: data.usage,
  };
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(messages, options = {}, config = DEFAULT_CONFIG) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY environment variable is not set.\n' +
      'Get your API key at: https://openrouter.ai/keys\n' +
      'Then set it: export OPENROUTER_API_KEY=your_key_here'
    );
  }
  
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/elevate-foundry/ai-native-ide',
      'X-Title': 'Aria IDE',
    },
    body: JSON.stringify({
      model: options.model || config.model,
      messages,
      max_tokens: options.maxTokens || config.maxTokens,
      temperature: options.temperature ?? config.temperature,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || '',
    model: data.model,
    provider: 'openrouter',
    usage: data.usage,
  };
}

/**
 * Create an LLM client with the given configuration
 * Supports auto-detection of local providers with OpenRouter fallback
 */
function createLLMClient(config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let resolvedProvider = null;
  
  return {
    config: finalConfig,
    
    /**
     * Get the current provider (auto-detects if needed)
     */
    async getProvider() {
      if (resolvedProvider) return resolvedProvider;
      
      if (finalConfig.provider === 'auto') {
        resolvedProvider = await detectProvider();
      } else {
        resolvedProvider = { provider: finalConfig.provider, available: true };
      }
      return resolvedProvider;
    },
    
    async chat(messages, options = {}) {
      const systemMessage = {
        role: 'system',
        content: options.systemPrompt || ARIA_SYSTEM_PROMPT,
      };
      const allMessages = [systemMessage, ...messages];
      
      const { provider } = await this.getProvider();
      
      switch (provider) {
        case 'ollama':
          return callOllama(allMessages, options);
        case 'vllm':
          return callVLLM(allMessages, options);
        case 'openrouter':
        default:
          return callOpenRouter(allMessages, options, finalConfig);
      }
    },
    
    async complete(prompt, options = {}) {
      return this.chat([{ role: 'user', content: prompt }], options);
    },
    
    /**
     * Stream chat completion - yields chunks as they arrive
     * @param {Array} messages - Chat messages
     * @param {Object} options - Options including onChunk callback
     * @yields {string} Content chunks
     */
    async *chatStream(messages, options = {}) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY environment variable is not set.');
      }
      
      const systemMessage = {
        role: 'system',
        content: options.systemPrompt || ARIA_SYSTEM_PROMPT,
      };
      
      const response = await fetch(`${finalConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/elevate-foundry/ai-native-ide',
          'X-Title': 'Aria IDE',
        },
        body: JSON.stringify({
          model: options.model || finalConfig.model,
          messages: [systemMessage, ...messages],
          max_tokens: options.maxTokens || finalConfig.maxTokens,
          temperature: options.temperature ?? finalConfig.temperature,
          stream: true,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          
          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              if (options.onChunk) options.onChunk(content);
              yield content;
            }
          } catch (e) {
            // Skip malformed chunks
          }
        }
      }
    },
    
    /**
     * Stream completion with callback - easier to use than generator
     */
    async streamChat(messages, onChunk, options = {}) {
      let fullContent = '';
      for await (const chunk of this.chatStream(messages, { ...options, onChunk })) {
        fullContent += chunk;
      }
      return { content: fullContent };
    },
    
    async streamComplete(prompt, onChunk, options = {}) {
      return this.streamChat([{ role: 'user', content: prompt }], onChunk, options);
    },
  };
}

/**
 * Aria-specific LLM functions
 */
async function ariaAnalyze(sensorSnapshot, goal, client = null) {
  const llm = client || createLLMClient();
  
  const prompt = `## Current Goal
${goal}

## Sensor Snapshot
### DOM State
${sensorSnapshot.dom || '(not available)'}

### Console Output
${JSON.stringify(sensorSnapshot.consoleErrors || [], null, 2)}

### Network Requests
${JSON.stringify(sensorSnapshot.networkRequests || [], null, 2)}

Analyze the current state and determine:
1. Is the goal achieved? (done: true/false)
2. If not, what repair actions are needed?

Respond in JSON format:
{
  "done": boolean,
  "reason": "explanation",
  "repairPlan": { "next": "action description" } // only if done is false
}`;

  const response = await llm.complete(prompt);
  
  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Fall back to raw response
  }
  
  return {
    done: false,
    reason: response.content,
    repairPlan: { next: 'manual review needed' },
  };
}

async function ariaGeneratePlan(goal, context = {}, client = null) {
  const llm = client || createLLMClient();
  
  const prompt = `## Goal
${goal}

## Context
${JSON.stringify(context, null, 2)}

Generate a step-by-step plan to achieve this goal using semantic browser actions.
Available actions: navigate, login, fillForm, click, waitFor, assertElement

Respond in JSON format:
{
  "steps": [
    { "action": "actionName", "params": { ... }, "description": "what this does" }
  ]
}`;

  const response = await llm.complete(prompt);
  
  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Fall back
  }
  
  return { steps: [], error: response.content };
}

module.exports = {
  createLLMClient,
  ariaAnalyze,
  ariaGeneratePlan,
  detectProvider,
  checkProviderHealth,
  callOllama,
  callVLLM,
  callOpenRouter,
  ARIA_SYSTEM_PROMPT,
  DEFAULT_CONFIG,
  LOCAL_PROVIDERS,
};
