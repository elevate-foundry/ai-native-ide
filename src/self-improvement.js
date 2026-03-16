/**
 * Aria Self-Improvement Pipeline
 * 
 * Scaffolding for recursive self-improvement:
 * - Training data collection
 * - LoRA fine-tuning (when local models available)
 * - Safety mechanisms and rollback
 */

const fs = require('fs');
const path = require('path');
const { WorldModel } = require('./world-model');
const { SelfAnalyzer } = require('./introspection');
const { createLLMClient, checkProviderHealth } = require('./llm.cjs');

const SELF_IMPROVEMENT_PATH = process.env.ARIA_IMPROVEMENT_PATH || 
  path.join(process.cwd(), '.aria', 'self-improvement');

const SAFETY_CONFIG = {
  maxDailyModifications: 10,
  requireHumanApproval: true,
  rollbackOnFailure: true,
  minConfidenceThreshold: 0.8,
};

class ImprovementProposal {
  constructor(data) {
    this.id = `proposal_${Date.now()}`;
    this.timestamp = new Date().toISOString();
    this.type = data.type;
    this.description = data.description;
    this.rationale = data.rationale;
    this.expectedImpact = data.expectedImpact;
    this.confidence = data.confidence || 0.5;
    this.status = 'pending';
    this.safetyCheck = null;
  }
}

class SelfImprovementPipeline {
  constructor(options = {}) {
    this.storagePath = options.storagePath || SELF_IMPROVEMENT_PATH;
    this.safetyConfig = { ...SAFETY_CONFIG, ...options.safetyConfig };
    this.llm = options.llmClient || createLLMClient();
    this.worldModel = new WorldModel(options.worldModelPath);
    this.analyzer = new SelfAnalyzer(options);
    
    this.state = {
      proposals: [],
      trainingExamples: [],
      appliedModifications: [],
      dailyModificationCount: 0,
      lastResetDate: new Date().toDateString(),
    };
    
    this.load();
  }

  load() {
    try {
      const statePath = path.join(this.storagePath, 'state.json');
      if (fs.existsSync(statePath)) {
        this.state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      }
    } catch (e) {
      console.warn('Failed to load self-improvement state:', e.message);
    }
  }

  save() {
    try {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }
      fs.writeFileSync(
        path.join(this.storagePath, 'state.json'),
        JSON.stringify(this.state, null, 2)
      );
    } catch (e) {
      console.error('Failed to save state:', e.message);
    }
  }

  collectTrainingExample(input, output, quality, category = 'general') {
    const example = {
      id: `example_${Date.now()}`,
      timestamp: new Date().toISOString(),
      input, output, quality, category,
    };
    this.state.trainingExamples.push(example);
    if (this.state.trainingExamples.length > 10000) {
      this.state.trainingExamples = this.state.trainingExamples
        .filter(e => e.quality >= 7).slice(-5000);
    }
    this.save();
    return example;
  }

  exportTrainingData(format = 'jsonl', minQuality = 7) {
    const examples = this.state.trainingExamples.filter(e => e.quality >= minQuality);
    if (format === 'jsonl') {
      return examples.map(e => JSON.stringify({
        messages: [
          { role: 'user', content: e.input },
          { role: 'assistant', content: e.output },
        ],
      })).join('\n');
    }
    return JSON.stringify(examples, null, 2);
  }

  async generateProposals() {
    const stats = this.analyzer.getStats();
    const proposals = [];
    
    const highQuality = this.state.trainingExamples.filter(e => e.quality >= 8);
    if (highQuality.length >= 100) {
      proposals.push(new ImprovementProposal({
        type: 'lora',
        description: 'Fine-tune LoRA on high-quality interactions',
        rationale: `${highQuality.length} examples available`,
        expectedImpact: 'Improved response quality',
        confidence: 0.7,
      }));
    }
    
    for (const [category, count] of Object.entries(stats.failurePatterns || {})) {
      if (count >= 3) {
        proposals.push(new ImprovementProposal({
          type: 'behavior',
          description: `Add pre-check for ${category} failures`,
          rationale: `${count} failures detected`,
          expectedImpact: `Reduce ${category} failures`,
          confidence: 0.6,
        }));
      }
    }
    
    this.state.proposals.push(...proposals);
    this.save();
    return proposals;
  }

  async runSafetyCheck(proposal) {
    const checks = { passed: true, violations: [], warnings: [] };
    
    if (this.state.dailyModificationCount >= this.safetyConfig.maxDailyModifications) {
      checks.passed = false;
      checks.violations.push('Daily limit reached');
    }
    if (proposal.confidence < this.safetyConfig.minConfidenceThreshold) {
      checks.warnings.push(`Low confidence: ${proposal.confidence}`);
    }
    
    proposal.safetyCheck = checks;
    this.save();
    return checks;
  }

  async checkLocalModelCapability() {
    const ollama = await checkProviderHealth('ollama');
    if (ollama.available) {
      return { available: true, provider: 'ollama', canFineTune: false };
    }
    const vllm = await checkProviderHealth('vllm');
    if (vllm.available) {
      return { available: true, provider: 'vllm', canFineTune: false };
    }
    return { available: false };
  }

  async applyProposal(proposalId, humanApproval = null) {
    const proposal = this.state.proposals.find(p => p.id === proposalId);
    if (!proposal) return { success: false, error: 'Not found' };
    
    if (this.safetyConfig.requireHumanApproval && !humanApproval) {
      proposal.status = 'awaiting_approval';
      this.save();
      return { success: false, error: 'Human approval required' };
    }
    
    if (!proposal.safetyCheck) await this.runSafetyCheck(proposal);
    if (!proposal.safetyCheck.passed) {
      proposal.status = 'rejected';
      this.save();
      return { success: false, error: 'Safety check failed' };
    }
    
    const local = await this.checkLocalModelCapability();
    proposal.status = local.available ? 'applied' : 'simulated';
    this.save();
    return { success: true, mode: proposal.status };
  }

  getStats() {
    return {
      trainingExamples: this.state.trainingExamples.length,
      highQuality: this.state.trainingExamples.filter(e => e.quality >= 7).length,
      proposals: this.state.proposals.length,
      applied: this.state.appliedModifications.length,
    };
  }
}

const SELF_IMPROVEMENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'aria_collect_training',
      description: 'Collect successful interaction as training data.',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string' },
          output: { type: 'string' },
          quality: { type: 'number' },
          category: { type: 'string' },
        },
        required: ['input', 'output', 'quality'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_generate_proposals',
      description: 'Generate self-improvement proposals.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_apply_proposal',
      description: 'Apply an improvement proposal.',
      parameters: {
        type: 'object',
        properties: {
          proposalId: { type: 'string' },
          approved: { type: 'boolean' },
        },
        required: ['proposalId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aria_improvement_stats',
      description: 'Get self-improvement statistics.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

class SelfImprovementTools {
  constructor(options = {}) {
    this.pipeline = new SelfImprovementPipeline(options);
  }

  async execute(toolName, args) {
    switch (toolName) {
      case 'aria_collect_training':
        return { success: true, example: this.pipeline.collectTrainingExample(
          args.input, args.output, args.quality, args.category
        )};
      case 'aria_generate_proposals':
        return { success: true, proposals: await this.pipeline.generateProposals() };
      case 'aria_apply_proposal':
        return await this.pipeline.applyProposal(args.proposalId, args.approved);
      case 'aria_improvement_stats':
        return { success: true, stats: this.pipeline.getStats() };
      default:
        return { success: false, error: 'Unknown tool' };
    }
  }

  getToolDefinitions() { return SELF_IMPROVEMENT_TOOLS; }
}

module.exports = {
  SelfImprovementPipeline,
  SelfImprovementTools,
  SELF_IMPROVEMENT_TOOLS,
  ImprovementProposal,
};
