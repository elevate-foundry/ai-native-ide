/**
 * Braided LLM Responses with Braille Encoding
 * 
 * This module enables Aria to:
 * 1. Query multiple LLMs in parallel
 * 2. Braid their responses together (interleave tokens/sentences)
 * 3. Encode the braided response in braille
 * 4. Translate the braille back to English
 * 
 * The braille encoding serves as a unique "fingerprint" of the combined
 * multi-model response, creating a novel form of model fusion.
 */

// ============================================================================
// Braille Encoding/Decoding
// ============================================================================

const BRAILLE_MAP = {
  'a': '⠁', 'b': '⠃', 'c': '⠉', 'd': '⠙', 'e': '⠑',
  'f': '⠋', 'g': '⠛', 'h': '⠓', 'i': '⠊', 'j': '⠚',
  'k': '⠅', 'l': '⠇', 'm': '⠍', 'n': '⠝', 'o': '⠕',
  'p': '⠏', 'q': '⠟', 'r': '⠗', 's': '⠎', 't': '⠞',
  'u': '⠥', 'v': '⠧', 'w': '⠺', 'x': '⠭', 'y': '⠽',
  'z': '⠵',
  '0': '⠴', '1': '⠂', '2': '⠆', '3': '⠒', '4': '⠲',
  '5': '⠢', '6': '⠖', '7': '⠶', '8': '⠦', '9': '⠔',
  ' ': '⠀', '.': '⠲', ',': '⠂', '!': '⠖', '?': '⠦',
  "'": '⠄', '-': '⠤', ':': '⠒', ';': '⠆', '(': '⠶',
  ')': '⠶', '/': '⠌', '"': '⠄', '\n': '⠀',
};

const REVERSE_BRAILLE_MAP = Object.fromEntries(
  Object.entries(BRAILLE_MAP).map(([k, v]) => [v, k])
);

function textToBraille(text) {
  return text.toLowerCase().split('').map(char => {
    return BRAILLE_MAP[char] || '⠿'; // ⠿ for unknown chars
  }).join('');
}

function brailleToText(braille) {
  return braille.split('').map(char => {
    return REVERSE_BRAILLE_MAP[char] || '?';
  }).join('');
}

// ============================================================================
// Braiding Strategies
// ============================================================================

/**
 * Interleave responses word by word
 */
function braidByWord(responses) {
  const wordArrays = responses.map(r => r.split(/\s+/));
  const maxLen = Math.max(...wordArrays.map(a => a.length));
  const braided = [];
  
  for (let i = 0; i < maxLen; i++) {
    for (const words of wordArrays) {
      if (words[i]) {
        braided.push(words[i]);
      }
    }
  }
  
  return braided.join(' ');
}

/**
 * Interleave responses sentence by sentence
 */
function braidBySentence(responses) {
  const sentenceArrays = responses.map(r => 
    r.split(/(?<=[.!?])\s+/).filter(s => s.trim())
  );
  const maxLen = Math.max(...sentenceArrays.map(a => a.length));
  const braided = [];
  
  for (let i = 0; i < maxLen; i++) {
    for (const sentences of sentenceArrays) {
      if (sentences[i]) {
        braided.push(sentences[i]);
      }
    }
  }
  
  return braided.join(' ');
}

/**
 * Interleave responses character by character (creates interesting patterns)
 */
function braidByChar(responses) {
  const maxLen = Math.max(...responses.map(r => r.length));
  const braided = [];
  
  for (let i = 0; i < maxLen; i++) {
    for (const response of responses) {
      if (response[i]) {
        braided.push(response[i]);
      }
    }
  }
  
  return braided.join('');
}

/**
 * Weighted blend - take more from higher-weighted models
 */
function braidWeighted(responses, weights) {
  const wordArrays = responses.map(r => r.split(/\s+/));
  const braided = [];
  
  // Normalize weights
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const normalizedWeights = weights.map(w => w / totalWeight);
  
  // Calculate how many words to take from each
  const maxLen = Math.max(...wordArrays.map(a => a.length));
  
  for (let i = 0; i < maxLen; i++) {
    for (let j = 0; j < wordArrays.length; j++) {
      // Take word based on weight probability
      if (wordArrays[j][i] && Math.random() < normalizedWeights[j] * wordArrays.length) {
        braided.push(wordArrays[j][i]);
      }
    }
  }
  
  return braided.join(' ');
}

// ============================================================================
// Multi-Model Query
// ============================================================================

const DEFAULT_MODELS = [
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o',
  'meta-llama/llama-3.1-70b-instruct',
];

async function queryModel(apiKey, model, prompt, systemPrompt = '') {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/elevate-foundry/ai-native-ide',
      'X-Title': 'Aria Braided LLM',
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${model} error: ${error}`);
  }
  
  const data = await response.json();
  return {
    model,
    content: data.choices?.[0]?.message?.content || '',
  };
}

async function queryMultipleModels(apiKey, prompt, models = DEFAULT_MODELS, systemPrompt = '') {
  const results = await Promise.allSettled(
    models.map(model => queryModel(apiKey, model, prompt, systemPrompt))
  );
  
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

// ============================================================================
// Braided Response Pipeline
// ============================================================================

/**
 * Main braiding function
 * 
 * @param {string} apiKey - OpenRouter API key
 * @param {string} prompt - User prompt
 * @param {object} options - Configuration options
 * @returns {object} - Braided response with braille encoding
 */
async function braidedResponse(apiKey, prompt, options = {}) {
  const {
    models = DEFAULT_MODELS,
    strategy = 'sentence', // 'word', 'sentence', 'char', 'weighted'
    weights = null,
    systemPrompt = 'Be concise and direct. Respond in 2-3 sentences.',
    translateBack = true,
  } = options;
  
  // Query all models in parallel
  const responses = await queryMultipleModels(apiKey, prompt, models, systemPrompt);
  
  if (responses.length === 0) {
    throw new Error('No models responded successfully');
  }
  
  // Extract content
  const contents = responses.map(r => r.content);
  
  // Braid responses
  let braided;
  switch (strategy) {
    case 'word':
      braided = braidByWord(contents);
      break;
    case 'char':
      braided = braidByChar(contents);
      break;
    case 'weighted':
      braided = braidWeighted(contents, weights || models.map(() => 1));
      break;
    case 'sentence':
    default:
      braided = braidBySentence(contents);
      break;
  }
  
  // Encode to braille
  const brailleEncoded = textToBraille(braided);
  
  // Translate back to English (decode braille)
  const translated = translateBack ? brailleToText(brailleEncoded) : null;
  
  return {
    // Original responses from each model
    sources: responses,
    
    // Braided combination
    braided,
    
    // Braille encoding
    braille: brailleEncoded,
    
    // Translated back (should match braided, but lowercase)
    translated,
    
    // Metadata
    metadata: {
      models: responses.map(r => r.model),
      strategy,
      brailleLength: brailleEncoded.length,
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Semantic Braille Fusion
// ============================================================================

/**
 * Advanced fusion: Use an LLM to synthesize the braided braille
 * into a coherent response
 */
async function semanticBrailleFusion(apiKey, prompt, options = {}) {
  const {
    models = DEFAULT_MODELS,
    fusionModel = 'anthropic/claude-3.5-sonnet',
  } = options;
  
  // Get braided response
  const braided = await braidedResponse(apiKey, prompt, {
    ...options,
    models,
    translateBack: true,
  });
  
  // Use fusion model to synthesize
  const fusionPrompt = `You are synthesizing multiple AI perspectives into one coherent response.

Original question: "${prompt}"

Multiple AI models responded, and their responses were braided together and encoded in braille.

Braided braille encoding:
${braided.braille.slice(0, 500)}...

Decoded text:
${braided.translated.slice(0, 1000)}...

Individual model responses:
${braided.sources.map(s => `[${s.model}]: ${s.content}`).join('\n\n')}

Synthesize these perspectives into a single, coherent, high-quality response that captures the best insights from all models. Be concise but comprehensive.`;

  const fusionResponse = await queryModel(apiKey, fusionModel, fusionPrompt);
  
  return {
    ...braided,
    fusion: fusionResponse.content,
    fusionModel,
  };
}

// ============================================================================
// Dual-Stream Braiding (Braille + English simultaneously)
// ============================================================================

/**
 * DualStreamBraid - Maintains both braille and English representations
 * simultaneously as tokens stream from each router in the braid.
 * 
 * Emits events with both representations, allowing UI to toggle between them.
 */
class DualStreamBraid {
  constructor(options = {}) {
    this.models = options.models || DEFAULT_MODELS;
    this.strategy = options.strategy || 'sentence';
    this.apiKey = options.apiKey;
    this.listeners = new Map();
    
    // Dual buffers for each model
    this.streams = new Map(); // modelId -> { english: '', braille: '' }
    this.braidedEnglish = '';
    this.braidedBraille = '';
    
    // Display mode: 'braille' | 'english' | 'both'
    this.displayMode = options.displayMode || 'both';
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
  
  setDisplayMode(mode) {
    this.displayMode = mode;
    this.emit('modeChange', { mode, braille: this.braidedBraille, english: this.braidedEnglish });
  }
  
  /**
   * Stream query to multiple models with dual output
   */
  async streamBraidedQuery(prompt, systemPrompt = 'Be concise and direct.') {
    // Initialize streams for each model
    this.models.forEach(model => {
      this.streams.set(model, { english: '', braille: '' });
    });
    
    this.emit('start', { models: this.models, prompt });
    
    // Query all models in parallel with streaming
    const streamPromises = this.models.map(model => 
      this._streamModel(model, prompt, systemPrompt)
    );
    
    await Promise.allSettled(streamPromises);
    
    // Final braid of all complete responses
    this._finalBraid();
    
    this.emit('complete', {
      braille: this.braidedBraille,
      english: this.braidedEnglish,
      sources: Array.from(this.streams.entries()).map(([model, data]) => ({
        model,
        english: data.english,
        braille: data.braille,
      })),
    });
    
    return {
      braille: this.braidedBraille,
      english: this.braidedEnglish,
    };
  }
  
  async _streamModel(model, prompt, systemPrompt) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/elevate-foundry/ai-native-ide',
          'X-Title': 'Aria Dual-Stream Braid',
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt },
          ],
          max_tokens: 500,
          temperature: 0.7,
          stream: true,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`${model} error: ${response.status}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
        
        for (const line of lines) {
          if (line === 'data: [DONE]') continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            
            if (content) {
              this._handleChunk(model, content);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
      
      this.emit('modelComplete', {
        model,
        english: this.streams.get(model).english,
        braille: this.streams.get(model).braille,
      });
      
    } catch (e) {
      this.emit('modelError', { model, error: e.message });
    }
  }
  
  _handleChunk(model, content) {
    const stream = this.streams.get(model);
    if (!stream) return;
    
    // Update English buffer
    stream.english += content;
    
    // Update Braille buffer (convert chunk to braille)
    const brailleChunk = textToBraille(content);
    stream.braille += brailleChunk;
    
    // Emit dual chunk event
    this.emit('chunk', {
      model,
      english: content,
      braille: brailleChunk,
      totalEnglish: stream.english,
      totalBraille: stream.braille,
    });
    
    // Incremental braid update
    this._incrementalBraid();
  }
  
  _incrementalBraid() {
    // Get all current English responses
    const englishResponses = Array.from(this.streams.values()).map(s => s.english);
    
    // Braid based on strategy
    switch (this.strategy) {
      case 'word':
        this.braidedEnglish = braidByWord(englishResponses);
        break;
      case 'char':
        this.braidedEnglish = braidByChar(englishResponses);
        break;
      case 'sentence':
      default:
        this.braidedEnglish = braidBySentence(englishResponses);
        break;
    }
    
    // Convert braided English to braille
    this.braidedBraille = textToBraille(this.braidedEnglish);
    
    // Emit braided update
    this.emit('braidUpdate', {
      english: this.braidedEnglish,
      braille: this.braidedBraille,
      displayMode: this.displayMode,
    });
  }
  
  _finalBraid() {
    this._incrementalBraid();
  }
  
  /**
   * Get current display content based on mode
   */
  getDisplayContent() {
    switch (this.displayMode) {
      case 'braille':
        return this.braidedBraille;
      case 'english':
        return this.braidedEnglish;
      case 'both':
      default:
        return {
          braille: this.braidedBraille,
          english: this.braidedEnglish,
        };
    }
  }
  
  /**
   * Toggle between braille and English display
   */
  toggleDisplay() {
    if (this.displayMode === 'braille') {
      this.setDisplayMode('english');
    } else if (this.displayMode === 'english') {
      this.setDisplayMode('both');
    } else {
      this.setDisplayMode('braille');
    }
    return this.displayMode;
  }
}

/**
 * Create a dual-stream braided response
 */
async function dualStreamBraidedResponse(apiKey, prompt, options = {}) {
  const braid = new DualStreamBraid({
    apiKey,
    models: options.models || DEFAULT_MODELS,
    strategy: options.strategy || 'sentence',
    displayMode: options.displayMode || 'both',
  });
  
  // Attach any provided listeners
  if (options.onChunk) braid.on('chunk', options.onChunk);
  if (options.onBraidUpdate) braid.on('braidUpdate', options.onBraidUpdate);
  if (options.onComplete) braid.on('complete', options.onComplete);
  if (options.onModelComplete) braid.on('modelComplete', options.onModelComplete);
  if (options.onModelError) braid.on('modelError', options.onModelError);
  if (options.onModeChange) braid.on('modeChange', options.onModeChange);
  
  return braid.streamBraidedQuery(prompt, options.systemPrompt);
}

// ============================================================================
// Tool Definitions for Aria
// ============================================================================

const BRAIDED_LLM_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'braided_query',
      description: 'Query multiple LLMs, braid their responses together, encode in braille, and translate back. Creates a unique multi-model fusion.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The prompt to send to all models',
          },
          models: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of model IDs to query (default: Claude, GPT-4o, Llama)',
          },
          strategy: {
            type: 'string',
            enum: ['word', 'sentence', 'char', 'weighted'],
            description: 'How to braid responses together',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'braided_fusion',
      description: 'Advanced multi-model fusion: query multiple LLMs, braid in braille, then use a fusion model to synthesize a coherent response.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The prompt to send to all models',
          },
          models: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of model IDs to query',
          },
          fusionModel: {
            type: 'string',
            description: 'Model to use for final synthesis',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'text_to_braille',
      description: 'Convert text to braille encoding',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to convert to braille',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'braille_to_text',
      description: 'Convert braille back to text',
      parameters: {
        type: 'object',
        properties: {
          braille: {
            type: 'string',
            description: 'Braille to convert to text',
          },
        },
        required: ['braille'],
      },
    },
  },
];

// ============================================================================
// Tool Executor
// ============================================================================

class BraidedLLMTools {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  
  async execute(toolName, args) {
    try {
      switch (toolName) {
        case 'braided_query':
          return await braidedResponse(this.apiKey, args.prompt, {
            models: args.models,
            strategy: args.strategy || 'sentence',
          });
          
        case 'braided_fusion':
          return await semanticBrailleFusion(this.apiKey, args.prompt, {
            models: args.models,
            fusionModel: args.fusionModel,
          });
          
        case 'text_to_braille':
          return {
            success: true,
            text: args.text,
            braille: textToBraille(args.text),
          };
          
        case 'braille_to_text':
          return {
            success: true,
            braille: args.braille,
            text: brailleToText(args.braille),
          };
          
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  getToolDefinitions() {
    return BRAIDED_LLM_TOOLS;
  }
}

module.exports = {
  textToBraille,
  brailleToText,
  braidByWord,
  braidBySentence,
  braidByChar,
  braidWeighted,
  braidedResponse,
  semanticBrailleFusion,
  BraidedLLMTools,
  BRAIDED_LLM_TOOLS,
  // Dual-stream braiding
  DualStreamBraid,
  dualStreamBraidedResponse,
};
