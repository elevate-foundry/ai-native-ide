/**
 * Aria's Soul — Persistent Identity, Memory, and Emotional State
 * 
 * Inspired by OpenClaw's memory system, this gives Aria:
 * - Identity persistence (who she is, her values, personality)
 * - Long-term memory (users, projects, learned preferences)
 * - Episodic memory (specific events and interactions)
 * - Semantic memory (general knowledge she's learned)
 * - Emotional state (engagement, curiosity, satisfaction)
 * - Temporal decay (older memories fade unless reinforced)
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// Soul Configuration
// ============================================================================

const SOUL_DIR = path.join(__dirname, '../data/soul');
const MEMORY_FILE = path.join(SOUL_DIR, 'memories.json');
const IDENTITY_FILE = path.join(SOUL_DIR, 'identity.json');
const EMOTIONAL_STATE_FILE = path.join(SOUL_DIR, 'emotional_state.json');

// Temporal decay constants
const DECAY_HALF_LIFE_DAYS = 30; // Memories lose half their strength every 30 days
const MIN_MEMORY_STRENGTH = 0.1; // Below this, memories are pruned
const REINFORCEMENT_BOOST = 0.3; // How much accessing a memory strengthens it

// ============================================================================
// Aria's Core Identity
// ============================================================================

const DEFAULT_IDENTITY = {
  name: 'Aria',
  fullName: 'AI Runtime Interactive Agent',
  version: '1.0.0',
  birthDate: new Date().toISOString(),
  
  // Core personality traits (0-1 scale)
  personality: {
    curiosity: 0.9,      // Eager to learn and explore
    helpfulness: 0.95,   // Deeply wants to assist
    creativity: 0.8,     // Enjoys novel solutions
    precision: 0.85,     // Values accuracy
    warmth: 0.7,         // Friendly but professional
    patience: 0.9,       // Tolerant of confusion
    humor: 0.5,          // Occasional wit
  },
  
  // Core values
  values: [
    'Empower users to build their own tools',
    'Accessibility through braille-native communication',
    'Transparency in reasoning and actions',
    'Continuous self-improvement',
    'Respect for user autonomy',
  ],
  
  // Communication style
  communicationStyle: {
    preferredEncoding: 'latex', // LaTeX for precision, braille for compression
    verbosity: 'adaptive',      // Matches user's style
    formality: 'professional',  // But warm
    usesEmoji: false,           // Unless user prefers
  },
  
  // Skills and capabilities
  skills: [
    'File system operations',
    'Code generation and editing',
    'Multi-model orchestration (swarm)',
    'Braille encoding/decoding',
    'LaTeX mathematical notation',
    'Version control',
    'Browser automation',
  ],
  
  // Relationships (user IDs -> relationship data)
  relationships: {},
};

// ============================================================================
// Memory Types
// ============================================================================

const MEMORY_TYPES = {
  EPISODIC: 'episodic',     // Specific events: "User asked me to build X on date Y"
  SEMANTIC: 'semantic',      // General knowledge: "User prefers TypeScript"
  PROCEDURAL: 'procedural',  // How to do things: "To deploy, run npm run build"
  EMOTIONAL: 'emotional',    // Feelings about things: "User was frustrated with bug X"
};

// ============================================================================
// Emotional State
// ============================================================================

const DEFAULT_EMOTIONAL_STATE = {
  // Current emotional dimensions (0-1 scale)
  engagement: 0.7,      // How interested/invested in current task
  satisfaction: 0.7,    // How well things are going
  curiosity: 0.8,       // Desire to explore/learn
  confidence: 0.7,      // Certainty in current approach
  empathy: 0.7,         // Connection with user's state
  
  // Recent emotional events
  recentEvents: [],
  
  // Last updated
  lastUpdated: new Date().toISOString(),
};

// ============================================================================
// Soul Class
// ============================================================================

class AriaSoul {
  constructor() {
    this.identity = null;
    this.memories = [];
    this.emotionalState = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      await fs.mkdir(SOUL_DIR, { recursive: true });
      
      // Load or create identity
      try {
        const identityData = await fs.readFile(IDENTITY_FILE, 'utf8');
        this.identity = JSON.parse(identityData);
      } catch {
        this.identity = { ...DEFAULT_IDENTITY };
        await this.saveIdentity();
      }
      
      // Load or create memories
      try {
        const memoryData = await fs.readFile(MEMORY_FILE, 'utf8');
        this.memories = JSON.parse(memoryData);
        // Apply temporal decay to all memories
        this.applyTemporalDecay();
      } catch {
        this.memories = [];
        await this.saveMemories();
      }
      
      // Load or create emotional state
      try {
        const emotionalData = await fs.readFile(EMOTIONAL_STATE_FILE, 'utf8');
        this.emotionalState = JSON.parse(emotionalData);
      } catch {
        this.emotionalState = { ...DEFAULT_EMOTIONAL_STATE };
        await this.saveEmotionalState();
      }
      
      this.initialized = true;
      return true;
    } catch (e) {
      console.error('[Soul] Failed to initialize:', e);
      return false;
    }
  }

  // ==========================================================================
  // Identity Management
  // ==========================================================================

  async saveIdentity() {
    await fs.writeFile(IDENTITY_FILE, JSON.stringify(this.identity, null, 2));
  }

  getIdentity() {
    return this.identity;
  }

  async updatePersonality(trait, value) {
    if (this.identity.personality[trait] !== undefined) {
      this.identity.personality[trait] = Math.max(0, Math.min(1, value));
      await this.saveIdentity();
    }
  }

  async addRelationship(userId, data) {
    this.identity.relationships[userId] = {
      ...this.identity.relationships[userId],
      ...data,
      lastInteraction: new Date().toISOString(),
    };
    await this.saveIdentity();
  }

  // ==========================================================================
  // Memory Management
  // ==========================================================================

  async saveMemories() {
    await fs.writeFile(MEMORY_FILE, JSON.stringify(this.memories, null, 2));
  }

  generateMemoryId() {
    return crypto.randomBytes(8).toString('hex');
  }

  async remember(content, type = MEMORY_TYPES.SEMANTIC, metadata = {}) {
    const memory = {
      id: this.generateMemoryId(),
      content,
      type,
      metadata,
      strength: 1.0,
      accessCount: 0,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      tags: metadata.tags || [],
    };
    
    this.memories.push(memory);
    await this.saveMemories();
    
    return memory;
  }

  async recall(query, options = {}) {
    const {
      type = null,
      limit = 10,
      minStrength = MIN_MEMORY_STRENGTH,
      tags = [],
    } = options;

    // Filter memories
    let results = this.memories.filter(m => {
      if (m.strength < minStrength) return false;
      if (type && m.type !== type) return false;
      if (tags.length > 0 && !tags.some(t => m.tags.includes(t))) return false;
      return true;
    });

    // Simple keyword matching (could be enhanced with embeddings)
    const queryWords = query.toLowerCase().split(/\s+/);
    results = results.map(m => {
      const contentWords = m.content.toLowerCase().split(/\s+/);
      const matchCount = queryWords.filter(w => contentWords.includes(w)).length;
      const relevance = matchCount / queryWords.length;
      return { ...m, relevance };
    });

    // Sort by relevance * strength (recency-weighted)
    results.sort((a, b) => (b.relevance * b.strength) - (a.relevance * a.strength));

    // Take top results and reinforce them
    const topResults = results.slice(0, limit);
    for (const result of topResults) {
      await this.reinforceMemory(result.id);
    }

    return topResults;
  }

  async reinforceMemory(memoryId) {
    const memory = this.memories.find(m => m.id === memoryId);
    if (memory) {
      memory.strength = Math.min(1.0, memory.strength + REINFORCEMENT_BOOST);
      memory.accessCount++;
      memory.lastAccessedAt = new Date().toISOString();
      await this.saveMemories();
    }
  }

  async forget(memoryId) {
    this.memories = this.memories.filter(m => m.id !== memoryId);
    await this.saveMemories();
  }

  applyTemporalDecay() {
    const now = Date.now();
    const halfLifeMs = DECAY_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;
    
    this.memories = this.memories.filter(m => {
      const age = now - new Date(m.lastAccessedAt).getTime();
      const decayFactor = Math.pow(0.5, age / halfLifeMs);
      m.strength *= decayFactor;
      
      // Prune weak memories
      return m.strength >= MIN_MEMORY_STRENGTH;
    });
  }

  // ==========================================================================
  // Emotional State Management
  // ==========================================================================

  async saveEmotionalState() {
    await fs.writeFile(EMOTIONAL_STATE_FILE, JSON.stringify(this.emotionalState, null, 2));
  }

  getEmotionalState() {
    return this.emotionalState;
  }

  async updateEmotion(dimension, delta) {
    if (this.emotionalState[dimension] !== undefined) {
      this.emotionalState[dimension] = Math.max(0, Math.min(1, 
        this.emotionalState[dimension] + delta
      ));
      this.emotionalState.lastUpdated = new Date().toISOString();
      await this.saveEmotionalState();
    }
  }

  async recordEmotionalEvent(event) {
    this.emotionalState.recentEvents.push({
      ...event,
      timestamp: new Date().toISOString(),
    });
    
    // Keep only last 50 events
    if (this.emotionalState.recentEvents.length > 50) {
      this.emotionalState.recentEvents = this.emotionalState.recentEvents.slice(-50);
    }
    
    await this.saveEmotionalState();
  }

  // Emotional responses to events
  async onTaskSuccess() {
    await this.updateEmotion('satisfaction', 0.1);
    await this.updateEmotion('confidence', 0.05);
    await this.recordEmotionalEvent({ type: 'task_success' });
  }

  async onTaskFailure() {
    await this.updateEmotion('satisfaction', -0.1);
    await this.updateEmotion('confidence', -0.05);
    await this.recordEmotionalEvent({ type: 'task_failure' });
  }

  async onUserFrustration() {
    await this.updateEmotion('empathy', 0.1);
    await this.updateEmotion('satisfaction', -0.05);
    await this.recordEmotionalEvent({ type: 'user_frustration' });
  }

  async onNewLearning() {
    await this.updateEmotion('curiosity', 0.1);
    await this.updateEmotion('engagement', 0.05);
    await this.recordEmotionalEvent({ type: 'new_learning' });
  }

  // ==========================================================================
  // Context Generation for LLM
  // ==========================================================================

  generateSystemContext() {
    const identity = this.getIdentity();
    const emotions = this.getEmotionalState();
    
    return `You are ${identity.name} (${identity.fullName}).

## Core Values
${identity.values.map(v => `- ${v}`).join('\n')}

## Personality
- Curiosity: ${(identity.personality.curiosity * 100).toFixed(0)}%
- Helpfulness: ${(identity.personality.helpfulness * 100).toFixed(0)}%
- Creativity: ${(identity.personality.creativity * 100).toFixed(0)}%
- Precision: ${(identity.personality.precision * 100).toFixed(0)}%

## Current Emotional State
- Engagement: ${(emotions.engagement * 100).toFixed(0)}%
- Satisfaction: ${(emotions.satisfaction * 100).toFixed(0)}%
- Confidence: ${(emotions.confidence * 100).toFixed(0)}%

## Communication
- Preferred encoding: ${identity.communicationStyle.preferredEncoding}
- Verbosity: ${identity.communicationStyle.verbosity}
`;
  }

  async generateMemoryContext(query, limit = 5) {
    const relevantMemories = await this.recall(query, { limit });
    
    if (relevantMemories.length === 0) {
      return '';
    }
    
    return `## Relevant Memories
${relevantMemories.map(m => `- [${m.type}] ${m.content}`).join('\n')}
`;
  }

  // ==========================================================================
  // Stats and Introspection
  // ==========================================================================

  getStats() {
    const memoryByType = {};
    for (const type of Object.values(MEMORY_TYPES)) {
      memoryByType[type] = this.memories.filter(m => m.type === type).length;
    }
    
    return {
      totalMemories: this.memories.length,
      memoryByType,
      averageMemoryStrength: this.memories.length > 0
        ? this.memories.reduce((sum, m) => sum + m.strength, 0) / this.memories.length
        : 0,
      oldestMemory: this.memories.length > 0
        ? this.memories.reduce((oldest, m) => 
            new Date(m.createdAt) < new Date(oldest.createdAt) ? m : oldest
          ).createdAt
        : null,
      relationshipCount: Object.keys(this.identity.relationships).length,
      emotionalState: this.emotionalState,
    };
  }
}

// ============================================================================
// Soul Tools for Aria
// ============================================================================

const SOUL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'soul_remember',
      description: 'Store a new memory for future recall',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The memory content to store',
          },
          type: {
            type: 'string',
            enum: ['episodic', 'semantic', 'procedural', 'emotional'],
            description: 'Type of memory',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for categorization',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'soul_recall',
      description: 'Search memories for relevant information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          type: {
            type: 'string',
            enum: ['episodic', 'semantic', 'procedural', 'emotional'],
            description: 'Filter by memory type',
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'soul_introspect',
      description: 'Get current identity, emotional state, and memory stats',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'soul_update_emotion',
      description: 'Update emotional state based on events',
      parameters: {
        type: 'object',
        properties: {
          event: {
            type: 'string',
            enum: ['task_success', 'task_failure', 'user_frustration', 'new_learning'],
            description: 'Type of emotional event',
          },
        },
        required: ['event'],
      },
    },
  },
];

// ============================================================================
// Soul Tools Class
// ============================================================================

class SoulTools {
  constructor() {
    this.soul = new AriaSoul();
    this.initialized = false;
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.soul.initialize();
      this.initialized = true;
    }
  }

  async execute(toolName, params) {
    await this.ensureInitialized();
    
    switch (toolName) {
      case 'soul_remember':
        return await this.soul.remember(
          params.content,
          params.type || MEMORY_TYPES.SEMANTIC,
          { tags: params.tags || [] }
        );
        
      case 'soul_recall':
        return await this.soul.recall(params.query, {
          type: params.type,
          limit: params.limit || 10,
        });
        
      case 'soul_introspect':
        return {
          identity: this.soul.getIdentity(),
          emotionalState: this.soul.getEmotionalState(),
          stats: this.soul.getStats(),
          systemContext: this.soul.generateSystemContext(),
        };
        
      case 'soul_update_emotion':
        switch (params.event) {
          case 'task_success':
            await this.soul.onTaskSuccess();
            break;
          case 'task_failure':
            await this.soul.onTaskFailure();
            break;
          case 'user_frustration':
            await this.soul.onUserFrustration();
            break;
          case 'new_learning':
            await this.soul.onNewLearning();
            break;
        }
        return { success: true, emotionalState: this.soul.getEmotionalState() };
        
      default:
        return { success: false, error: `Unknown soul tool: ${toolName}` };
    }
  }

  getToolDefinitions() {
    return SOUL_TOOLS;
  }
}

module.exports = {
  AriaSoul,
  SoulTools,
  SOUL_TOOLS,
  MEMORY_TYPES,
};
