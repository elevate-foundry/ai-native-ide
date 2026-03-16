/**
 * Aria Memory Strategy Engine
 * 
 * Adaptive system for choosing between memory management approaches:
 * - COMPACT: Summarize + braille compress (fast, lossy, no GPU needed)
 * - PERSIST: World model facts (structured, queryable, no GPU needed)
 * - LORA: Fine-tune adapter on high-quality interactions (slow, permanent)
 * - QLORA: Quantized LoRA for lower VRAM requirements
 * - HYBRID: Combine strategies based on content type
 * 
 * The engine analyzes context pressure, interaction quality, and available
 * resources to automatically select the optimal strategy.
 */

const { checkProviderHealth, LOCAL_PROVIDERS } = require('./llm.cjs');
const { SelfImprovementPipeline } = require('./self-improvement');
const { WorldModel } = require('./world-model');
const { ContextManager } = require('./compaction');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// ============================================================================
// Strategy Definitions
// ============================================================================

const STRATEGIES = {
  COMPACT: {
    name: 'compact',
    description: 'Summarize and braille-compress conversation history',
    requirements: { localModel: false, gpu: false, minExamples: 0 },
    speed: 'fast',
    persistence: 'session',
    lossiness: 'lossy',
  },
  PERSIST: {
    name: 'persist',
    description: 'Extract facts to world model for structured retrieval',
    requirements: { localModel: false, gpu: false, minExamples: 0 },
    speed: 'fast',
    persistence: 'permanent',
    lossiness: 'selective',
  },
  LORA: {
    name: 'lora',
    description: 'Fine-tune LoRA adapter on high-quality interactions',
    requirements: { localModel: true, gpu: true, minExamples: 100, minVRAM: 16 },
    speed: 'slow',
    persistence: 'permanent',
    lossiness: 'lossless',
  },
  QLORA: {
    name: 'qlora',
    description: 'Quantized LoRA for lower VRAM (4-bit quantization)',
    requirements: { localModel: true, gpu: true, minExamples: 100, minVRAM: 8 },
    speed: 'slow',
    persistence: 'permanent',
    lossiness: 'lossless',
  },
  HYBRID: {
    name: 'hybrid',
    description: 'Combine strategies based on content type',
    requirements: { localModel: false, gpu: false, minExamples: 0 },
    speed: 'variable',
    persistence: 'mixed',
    lossiness: 'adaptive',
  },
};

// ============================================================================
// Resource Detection
// ============================================================================

class ResourceDetector {
  constructor() {
    this.cache = null;
    this.cacheTime = 0;
    this.cacheTTL = 60000; // 1 minute
  }

  async detect() {
    const now = Date.now();
    if (this.cache && (now - this.cacheTime) < this.cacheTTL) {
      return this.cache;
    }

    const resources = {
      localModels: await this.detectLocalModels(),
      gpu: this.detectGPU(),
      memory: this.detectMemory(),
      storage: this.detectStorage(),
    };

    this.cache = resources;
    this.cacheTime = now;
    return resources;
  }

  async detectLocalModels() {
    const result = { available: false, providers: [], models: [] };

    // Check Ollama
    const ollama = await checkProviderHealth('ollama');
    if (ollama.available) {
      result.available = true;
      result.providers.push('ollama');
      result.models.push(...(ollama.models || LOCAL_PROVIDERS.ollama.models));
    }

    // Check vLLM
    const vllm = await checkProviderHealth('vllm');
    if (vllm.available) {
      result.available = true;
      result.providers.push('vllm');
      result.models.push(...(vllm.models || LOCAL_PROVIDERS.vllm.models));
    }

    return result;
  }

  detectGPU() {
    const result = { available: false, type: null, vram: 0, canTrain: false };

    try {
      // Try nvidia-smi for NVIDIA GPUs
      const nvidiaSmi = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 5000,
      });

      if (nvidiaSmi.trim()) {
        const [name, vram] = nvidiaSmi.trim().split(',').map(s => s.trim());
        result.available = true;
        result.type = 'nvidia';
        result.name = name;
        result.vram = parseInt(vram) || 0;
        result.canTrain = result.vram >= 8000; // 8GB minimum for QLoRA
      }
    } catch {
      // No NVIDIA GPU or nvidia-smi not available
    }

    // Check for Apple Silicon (MPS)
    if (!result.available && process.platform === 'darwin') {
      try {
        const sysctl = execSync('sysctl -n machdep.cpu.brand_string 2>/dev/null', {
          encoding: 'utf-8',
          timeout: 5000,
        });
        if (sysctl.includes('Apple')) {
          result.available = true;
          result.type = 'mps';
          result.name = 'Apple Silicon';
          // Estimate unified memory available for ML
          const memInfo = execSync('sysctl -n hw.memsize 2>/dev/null', { encoding: 'utf-8' });
          const totalMem = parseInt(memInfo) / (1024 * 1024 * 1024); // GB
          result.vram = Math.floor(totalMem * 0.75 * 1024); // 75% of RAM in MB
          result.canTrain = totalMem >= 16;
        }
      } catch {
        // Not Apple Silicon
      }
    }

    return result;
  }

  detectMemory() {
    const used = process.memoryUsage();
    return {
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      heapTotal: Math.round(used.heapTotal / 1024 / 1024),
      rss: Math.round(used.rss / 1024 / 1024),
    };
  }

  detectStorage() {
    const storagePath = path.join(process.cwd(), '.aria');
    let used = 0;
    try {
      if (fs.existsSync(storagePath)) {
        const stat = fs.statSync(storagePath);
        used = stat.size;
      }
    } catch {
      // Ignore
    }
    return { path: storagePath, usedMB: Math.round(used / 1024 / 1024) };
  }
}

// ============================================================================
// Strategy Selector
// ============================================================================

class MemoryStrategyEngine {
  constructor(options = {}) {
    this.resourceDetector = new ResourceDetector();
    this.worldModel = new WorldModel(options.worldModelPath);
    this.contextManager = new ContextManager(options.contextOptions);
    this.improvementPipeline = new SelfImprovementPipeline(options);
    
    this.config = {
      // Thresholds for strategy selection
      contextPressureThreshold: 0.7, // Switch to compaction at 70% context usage
      qualityThresholdForTraining: 8, // Min quality score for training examples
      minExamplesForLoRA: 100,
      minExamplesForQLoRA: 50,
      preferLocal: true, // Prefer local models when available
      ...options.config,
    };

    this.metrics = {
      strategySelections: {},
      lastSelection: null,
      totalDecisions: 0,
    };
  }

  /**
   * Analyze current context and select optimal strategy
   */
  async selectStrategy(context = {}) {
    const resources = await this.resourceDetector.detect();
    const analysis = this.analyzeContext(context);
    const trainingStats = this.improvementPipeline.getStats();

    // Build decision factors
    const factors = {
      contextPressure: analysis.contextPressure,
      hasLocalModel: resources.localModels.available,
      hasGPU: resources.gpu.available,
      canTrain: resources.gpu.canTrain,
      vram: resources.gpu.vram,
      trainingExamples: trainingStats.highQuality,
      interactionQuality: analysis.avgQuality,
      knowledgeDensity: analysis.knowledgeDensity,
      isRecurringTopic: analysis.isRecurringTopic,
    };

    // Select strategy based on factors
    const strategy = this.decideStrategy(factors);

    // Track metrics
    this.metrics.strategySelections[strategy.name] = 
      (this.metrics.strategySelections[strategy.name] || 0) + 1;
    this.metrics.lastSelection = {
      strategy: strategy.name,
      factors,
      timestamp: new Date().toISOString(),
    };
    this.metrics.totalDecisions++;

    return {
      strategy,
      factors,
      resources,
      recommendation: this.generateRecommendation(strategy, factors, resources),
    };
  }

  /**
   * Analyze conversation context
   */
  analyzeContext(context) {
    const history = context.history || [];
    const maxTokens = context.maxTokens || 128000;
    
    // Estimate current token usage
    const estimatedTokens = history.reduce((sum, msg) => {
      return sum + Math.ceil((msg.content?.length || 0) / 4);
    }, 0);

    const contextPressure = estimatedTokens / maxTokens;

    // Calculate average quality from recent interactions
    const recentExamples = this.improvementPipeline.state?.trainingExamples?.slice(-20) || [];
    const avgQuality = recentExamples.length > 0
      ? recentExamples.reduce((sum, e) => sum + e.quality, 0) / recentExamples.length
      : 5;

    // Check if this is a recurring topic (from world model)
    const topics = context.topics || [];
    let isRecurringTopic = false;
    let knowledgeDensity = 0;

    try {
      const worldModelData = this.worldModel.load?.() || {};
      const facts = worldModelData.facts || [];
      const entities = worldModelData.entities || [];
      
      knowledgeDensity = (facts.length + entities.length) / Math.max(history.length, 1);
      
      // Check if any topic appears in world model
      for (const topic of topics) {
        if (facts.some(f => f.subject?.includes(topic) || f.object?.includes(topic))) {
          isRecurringTopic = true;
          break;
        }
      }
    } catch {
      // World model not available
    }

    return {
      contextPressure,
      avgQuality,
      knowledgeDensity,
      isRecurringTopic,
      historyLength: history.length,
      estimatedTokens,
    };
  }

  /**
   * Core decision logic
   */
  decideStrategy(factors) {
    // High context pressure → must compact
    if (factors.contextPressure > this.config.contextPressureThreshold) {
      // But if we have enough high-quality examples and can train, consider LoRA
      if (factors.canTrain && factors.trainingExamples >= this.config.minExamplesForLoRA) {
        return STRATEGIES.HYBRID; // Compact now, train in background
      }
      return STRATEGIES.COMPACT;
    }

    // Recurring topic with structured knowledge → persist to world model
    if (factors.isRecurringTopic && factors.knowledgeDensity > 0.5) {
      return STRATEGIES.PERSIST;
    }

    // Enough examples + GPU available → consider training
    if (factors.canTrain && factors.hasLocalModel) {
      if (factors.trainingExamples >= this.config.minExamplesForLoRA && factors.vram >= 16000) {
        return STRATEGIES.LORA;
      }
      if (factors.trainingExamples >= this.config.minExamplesForQLoRA && factors.vram >= 8000) {
        return STRATEGIES.QLORA;
      }
    }

    // High quality interactions → persist key facts
    if (factors.interactionQuality >= 7) {
      return STRATEGIES.PERSIST;
    }

    // Default: hybrid approach
    return STRATEGIES.HYBRID;
  }

  /**
   * Generate human-readable recommendation
   */
  generateRecommendation(strategy, factors, resources) {
    const recommendations = [];

    if (strategy.name === 'compact') {
      recommendations.push('Context pressure is high. Summarizing older messages.');
      if (!resources.localModels.available) {
        recommendations.push('Consider starting Ollama for local inference: `ollama serve`');
      }
    }

    if (strategy.name === 'persist') {
      recommendations.push('Extracting key facts to world model for long-term memory.');
    }

    if (strategy.name === 'lora' || strategy.name === 'qlora') {
      recommendations.push(`Ready for ${strategy.name.toUpperCase()} fine-tuning with ${factors.trainingExamples} examples.`);
      if (resources.gpu.type === 'mps') {
        recommendations.push('Using Apple Silicon MPS for training.');
      } else if (resources.gpu.type === 'nvidia') {
        recommendations.push(`Using ${resources.gpu.name} (${resources.gpu.vram}MB VRAM).`);
      }
    }

    if (strategy.name === 'hybrid') {
      recommendations.push('Using adaptive strategy: compact + persist + queue for training.');
    }

    // Resource recommendations
    if (!resources.localModels.available && this.config.preferLocal) {
      recommendations.push('No local models detected. Using OpenRouter (cloud).');
      recommendations.push('To reduce cloud dependency: `ollama pull qwen2.5-coder:32b`');
    }

    if (!resources.gpu.canTrain && factors.trainingExamples >= 50) {
      recommendations.push(`${factors.trainingExamples} training examples collected but no GPU for fine-tuning.`);
    }

    return recommendations;
  }

  /**
   * Execute the selected strategy
   */
  async executeStrategy(strategy, context = {}) {
    switch (strategy.name) {
      case 'compact':
        return this.executeCompact(context);
      case 'persist':
        return this.executePersist(context);
      case 'lora':
      case 'qlora':
        return this.executeTraining(strategy, context);
      case 'hybrid':
        return this.executeHybrid(context);
      default:
        return { success: false, error: 'Unknown strategy' };
    }
  }

  async executeCompact(context) {
    const history = context.history || [];
    const compacted = await this.contextManager.compact(history);
    return {
      success: true,
      strategy: 'compact',
      originalMessages: history.length,
      compactedMessages: compacted.length,
      tokensSaved: context.estimatedTokens - compacted.reduce((s, m) => s + (m.content?.length || 0) / 4, 0),
    };
  }

  async executePersist(context) {
    const history = context.history || [];
    let factsAdded = 0;

    // Extract facts from recent high-quality interactions
    for (const msg of history.slice(-10)) {
      if (msg.role === 'assistant' && msg.content) {
        // Simple fact extraction (could be enhanced with LLM)
        const facts = this.extractFacts(msg.content);
        for (const fact of facts) {
          this.worldModel.addFact(fact.subject, fact.predicate, fact.object, {
            confidence: 0.8,
            source: 'conversation',
          });
          factsAdded++;
        }
      }
    }

    return {
      success: true,
      strategy: 'persist',
      factsAdded,
    };
  }

  extractFacts(content) {
    // Simple pattern-based fact extraction
    // In production, use LLM for better extraction
    const facts = [];
    const patterns = [
      /(\w+)\s+is\s+(?:a|an|the)\s+(\w+)/gi,
      /(\w+)\s+has\s+(\w+)/gi,
      /(\w+)\s+uses\s+(\w+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        facts.push({
          subject: match[1],
          predicate: pattern.source.includes('is') ? 'is_a' : 
                     pattern.source.includes('has') ? 'has' : 'uses',
          object: match[2],
        });
      }
    }

    return facts.slice(0, 5); // Limit to avoid noise
  }

  async executeTraining(strategy, context) {
    const stats = this.improvementPipeline.getStats();
    
    // Check if we can actually train
    const resources = await this.resourceDetector.detect();
    if (!resources.gpu.canTrain) {
      return {
        success: false,
        strategy: strategy.name,
        error: 'No GPU available for training',
        recommendation: 'Training queued for when GPU becomes available',
      };
    }

    // Export training data
    const trainingData = this.improvementPipeline.exportTrainingData('jsonl', 8);
    const dataPath = path.join(process.cwd(), '.aria', 'training', `${Date.now()}.jsonl`);
    
    try {
      fs.mkdirSync(path.dirname(dataPath), { recursive: true });
      fs.writeFileSync(dataPath, trainingData);
    } catch (e) {
      return { success: false, error: e.message };
    }

    // Generate training command (actual training would be async)
    const trainingCommand = this.generateTrainingCommand(strategy, dataPath, resources);

    return {
      success: true,
      strategy: strategy.name,
      dataPath,
      examplesCount: stats.highQuality,
      command: trainingCommand,
      note: 'Training data exported. Run command to start fine-tuning.',
    };
  }

  generateTrainingCommand(strategy, dataPath, resources) {
    const baseModel = resources.localModels.models[0] || 'qwen2.5-coder:32b';
    
    if (strategy.name === 'qlora') {
      return `# QLoRA fine-tuning (4-bit quantization)
# Requires: pip install peft bitsandbytes transformers
python -m peft.tuners.lora \\
  --model_name_or_path ${baseModel} \\
  --train_file ${dataPath} \\
  --output_dir .aria/adapters/${Date.now()} \\
  --load_in_4bit \\
  --lora_r 16 \\
  --lora_alpha 32 \\
  --num_train_epochs 3`;
    }

    return `# LoRA fine-tuning
# Requires: pip install peft transformers
python -m peft.tuners.lora \\
  --model_name_or_path ${baseModel} \\
  --train_file ${dataPath} \\
  --output_dir .aria/adapters/${Date.now()} \\
  --lora_r 16 \\
  --lora_alpha 32 \\
  --num_train_epochs 3`;
  }

  async executeHybrid(context) {
    // Execute multiple strategies in order of priority
    const results = [];

    // 1. Always persist important facts
    const persistResult = await this.executePersist(context);
    results.push(persistResult);

    // 2. Compact if needed
    const analysis = this.analyzeContext(context);
    if (analysis.contextPressure > 0.5) {
      const compactResult = await this.executeCompact(context);
      results.push(compactResult);
    }

    // 3. Queue training if we have enough examples
    const stats = this.improvementPipeline.getStats();
    if (stats.highQuality >= 50) {
      results.push({
        strategy: 'training_queued',
        examples: stats.highQuality,
        note: 'Training will run when GPU is available',
      });
    }

    return {
      success: true,
      strategy: 'hybrid',
      results,
    };
  }

  /**
   * Get current metrics and status
   */
  getStatus() {
    return {
      metrics: this.metrics,
      config: this.config,
      strategies: Object.keys(STRATEGIES),
    };
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

const MEMORY_STRATEGY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'aria_select_memory_strategy',
      description: 'Analyze context and select optimal memory management strategy (compact, persist, lora, qlora, hybrid).',
      parameters: {
        type: 'object',
        properties: {
          topics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Current conversation topics for recurring topic detection',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_execute_memory_strategy',
      description: 'Execute a memory management strategy.',
      parameters: {
        type: 'object',
        properties: {
          strategy: {
            type: 'string',
            enum: ['compact', 'persist', 'lora', 'qlora', 'hybrid'],
            description: 'Strategy to execute',
          },
        },
        required: ['strategy'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_check_resources',
      description: 'Check available resources (local models, GPU, memory) for memory strategy decisions.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_memory_status',
      description: 'Get memory strategy engine status and metrics.',
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

class MemoryStrategyTools {
  constructor(options = {}) {
    this.engine = new MemoryStrategyEngine(options);
  }

  async execute(toolName, args, context = {}) {
    switch (toolName) {
      case 'aria_select_memory_strategy':
        return await this.engine.selectStrategy({ ...context, topics: args.topics });
      
      case 'aria_execute_memory_strategy':
        const strategy = STRATEGIES[args.strategy.toUpperCase()];
        if (!strategy) {
          return { success: false, error: `Unknown strategy: ${args.strategy}` };
        }
        return await this.engine.executeStrategy(strategy, context);
      
      case 'aria_check_resources':
        return await this.engine.resourceDetector.detect();
      
      case 'aria_memory_status':
        return { success: true, status: this.engine.getStatus() };
      
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  getToolDefinitions() {
    return MEMORY_STRATEGY_TOOLS;
  }
}

module.exports = {
  MemoryStrategyEngine,
  MemoryStrategyTools,
  ResourceDetector,
  STRATEGIES,
  MEMORY_STRATEGY_TOOLS,
};
