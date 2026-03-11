/**
 * Aria LLM Integration via OpenRouter (CommonJS version)
 * 
 * Provides a swappable LLM provider interface with OpenRouter as the default.
 * API key should be set via environment variable: OPENROUTER_API_KEY
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
  provider: 'openrouter',
  model: 'anthropic/claude-3.5-sonnet',
  baseUrl: 'https://openrouter.ai/api/v1',
  maxTokens: 4096,
  temperature: 0.7,
};

/**
 * Create an LLM client with the given configuration
 */
function createLLMClient(config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  return {
    config: finalConfig,
    
    async chat(messages, options = {}) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      
      if (!apiKey) {
        throw new Error(
          'OPENROUTER_API_KEY environment variable is not set.\n' +
          'Get your API key at: https://openrouter.ai/keys\n' +
          'Then set it: export OPENROUTER_API_KEY=your_key_here'
        );
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
        usage: data.usage,
      };
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
  ARIA_SYSTEM_PROMPT,
  DEFAULT_CONFIG,
};
