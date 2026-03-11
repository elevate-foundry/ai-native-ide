/**
 * World Model MCP Server for Aria
 * 
 * Provides persistent knowledge graph capabilities:
 * - Entities (people, projects, concepts, files, etc.)
 * - Relationships between entities
 * - Facts and observations
 * - Temporal state tracking
 * 
 * This gives Aria a "world model" - understanding of the environment
 * and relationships that persists across conversations.
 */

const fs = require('fs');
const path = require('path');

const WORLD_MODEL_PATH = process.env.WORLD_MODEL_PATH || 
  path.join(process.cwd(), '.aria', 'world-model.json');

// ============================================================================
// World Model Data Structure
// ============================================================================

class WorldModel {
  constructor(storagePath = WORLD_MODEL_PATH) {
    this.storagePath = storagePath;
    this.data = {
      entities: {},      // id -> { type, name, properties, created, updated }
      relations: [],     // { from, to, type, properties, created }
      facts: [],         // { subject, predicate, object, confidence, source, created }
      observations: [],  // { content, context, timestamp }
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    this.load();
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to load world model:', e.message);
    }
  }

  save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.data.metadata.updated = new Date().toISOString();
      fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('Failed to save world model:', e.message);
    }
  }

  // ============================================================================
  // Entity Management
  // ============================================================================

  createEntity(type, name, properties = {}) {
    const id = `${type}:${name.toLowerCase().replace(/\s+/g, '_')}`;
    
    if (this.data.entities[id]) {
      // Update existing
      this.data.entities[id].properties = {
        ...this.data.entities[id].properties,
        ...properties,
      };
      this.data.entities[id].updated = new Date().toISOString();
    } else {
      // Create new
      this.data.entities[id] = {
        id,
        type,
        name,
        properties,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
    }
    
    this.save();
    return this.data.entities[id];
  }

  getEntity(id) {
    return this.data.entities[id] || null;
  }

  findEntities(query = {}) {
    return Object.values(this.data.entities).filter(entity => {
      if (query.type && entity.type !== query.type) return false;
      if (query.name && !entity.name.toLowerCase().includes(query.name.toLowerCase())) return false;
      if (query.property) {
        const [key, value] = Object.entries(query.property)[0];
        if (entity.properties[key] !== value) return false;
      }
      return true;
    });
  }

  updateEntity(id, properties) {
    if (!this.data.entities[id]) {
      return { success: false, error: 'Entity not found' };
    }
    
    this.data.entities[id].properties = {
      ...this.data.entities[id].properties,
      ...properties,
    };
    this.data.entities[id].updated = new Date().toISOString();
    this.save();
    
    return { success: true, entity: this.data.entities[id] };
  }

  deleteEntity(id) {
    if (!this.data.entities[id]) {
      return { success: false, error: 'Entity not found' };
    }
    
    delete this.data.entities[id];
    
    // Remove related relations
    this.data.relations = this.data.relations.filter(
      r => r.from !== id && r.to !== id
    );
    
    this.save();
    return { success: true };
  }

  // ============================================================================
  // Relationship Management
  // ============================================================================

  createRelation(fromId, toId, type, properties = {}) {
    // Ensure entities exist
    if (!this.data.entities[fromId]) {
      return { success: false, error: `Entity ${fromId} not found` };
    }
    if (!this.data.entities[toId]) {
      return { success: false, error: `Entity ${toId} not found` };
    }
    
    // Check for existing relation
    const existing = this.data.relations.find(
      r => r.from === fromId && r.to === toId && r.type === type
    );
    
    if (existing) {
      existing.properties = { ...existing.properties, ...properties };
      this.save();
      return { success: true, relation: existing, updated: true };
    }
    
    const relation = {
      from: fromId,
      to: toId,
      type,
      properties,
      created: new Date().toISOString(),
    };
    
    this.data.relations.push(relation);
    this.save();
    
    return { success: true, relation };
  }

  getRelations(entityId, direction = 'both') {
    return this.data.relations.filter(r => {
      if (direction === 'outgoing') return r.from === entityId;
      if (direction === 'incoming') return r.to === entityId;
      return r.from === entityId || r.to === entityId;
    });
  }

  findRelations(query = {}) {
    return this.data.relations.filter(r => {
      if (query.type && r.type !== query.type) return false;
      if (query.from && r.from !== query.from) return false;
      if (query.to && r.to !== query.to) return false;
      return true;
    });
  }

  // ============================================================================
  // Facts (Triple Store)
  // ============================================================================

  addFact(subject, predicate, object, options = {}) {
    const fact = {
      subject,
      predicate,
      object,
      confidence: options.confidence || 1.0,
      source: options.source || 'user',
      created: new Date().toISOString(),
    };
    
    // Check for existing fact
    const existing = this.data.facts.find(
      f => f.subject === subject && f.predicate === predicate && f.object === object
    );
    
    if (existing) {
      existing.confidence = Math.max(existing.confidence, fact.confidence);
      this.save();
      return { success: true, fact: existing, updated: true };
    }
    
    this.data.facts.push(fact);
    this.save();
    
    return { success: true, fact };
  }

  queryFacts(query = {}) {
    return this.data.facts.filter(f => {
      if (query.subject && f.subject !== query.subject) return false;
      if (query.predicate && f.predicate !== query.predicate) return false;
      if (query.object && f.object !== query.object) return false;
      if (query.minConfidence && f.confidence < query.minConfidence) return false;
      return true;
    });
  }

  // ============================================================================
  // Observations (Free-form notes)
  // ============================================================================

  addObservation(content, context = {}) {
    const observation = {
      id: `obs_${Date.now()}`,
      content,
      context,
      timestamp: new Date().toISOString(),
    };
    
    this.data.observations.push(observation);
    
    // Keep only last 1000 observations
    if (this.data.observations.length > 1000) {
      this.data.observations = this.data.observations.slice(-1000);
    }
    
    this.save();
    return observation;
  }

  searchObservations(query, limit = 10) {
    const queryLower = query.toLowerCase();
    return this.data.observations
      .filter(o => o.content.toLowerCase().includes(queryLower))
      .slice(-limit);
  }

  // ============================================================================
  // Graph Queries
  // ============================================================================

  getEntityGraph(entityId, depth = 1) {
    const visited = new Set();
    const nodes = [];
    const edges = [];
    
    const traverse = (id, currentDepth) => {
      if (visited.has(id) || currentDepth > depth) return;
      visited.add(id);
      
      const entity = this.data.entities[id];
      if (entity) {
        nodes.push(entity);
        
        const relations = this.getRelations(id);
        for (const rel of relations) {
          edges.push(rel);
          const otherId = rel.from === id ? rel.to : rel.from;
          traverse(otherId, currentDepth + 1);
        }
      }
    };
    
    traverse(entityId, 0);
    return { nodes, edges };
  }

  getStats() {
    return {
      entities: Object.keys(this.data.entities).length,
      relations: this.data.relations.length,
      facts: this.data.facts.length,
      observations: this.data.observations.length,
      entityTypes: [...new Set(Object.values(this.data.entities).map(e => e.type))],
      relationTypes: [...new Set(this.data.relations.map(r => r.type))],
      lastUpdated: this.data.metadata.updated,
    };
  }

  // ============================================================================
  // Semantic Search (simple keyword matching)
  // ============================================================================

  search(query, options = {}) {
    const queryLower = query.toLowerCase();
    const results = {
      entities: [],
      facts: [],
      observations: [],
    };
    
    // Search entities
    for (const entity of Object.values(this.data.entities)) {
      const score = this.scoreMatch(entity.name, queryLower) +
        this.scoreMatch(JSON.stringify(entity.properties), queryLower) * 0.5;
      if (score > 0) {
        results.entities.push({ ...entity, score });
      }
    }
    
    // Search facts
    for (const fact of this.data.facts) {
      const score = this.scoreMatch(fact.subject, queryLower) +
        this.scoreMatch(fact.predicate, queryLower) +
        this.scoreMatch(fact.object, queryLower);
      if (score > 0) {
        results.facts.push({ ...fact, score });
      }
    }
    
    // Search observations
    for (const obs of this.data.observations) {
      const score = this.scoreMatch(obs.content, queryLower);
      if (score > 0) {
        results.observations.push({ ...obs, score });
      }
    }
    
    // Sort by score
    results.entities.sort((a, b) => b.score - a.score);
    results.facts.sort((a, b) => b.score - a.score);
    results.observations.sort((a, b) => b.score - a.score);
    
    // Limit results
    const limit = options.limit || 10;
    results.entities = results.entities.slice(0, limit);
    results.facts = results.facts.slice(0, limit);
    results.observations = results.observations.slice(0, limit);
    
    return results;
  }

  scoreMatch(text, query) {
    if (!text) return 0;
    const textLower = text.toLowerCase();
    if (textLower === query) return 3;
    if (textLower.includes(query)) return 1;
    
    // Word matching
    const queryWords = query.split(/\s+/);
    let wordMatches = 0;
    for (const word of queryWords) {
      if (textLower.includes(word)) wordMatches++;
    }
    return wordMatches * 0.5;
  }

  // ============================================================================
  // Export/Import
  // ============================================================================

  export() {
    return JSON.stringify(this.data, null, 2);
  }

  import(jsonData) {
    try {
      const imported = JSON.parse(jsonData);
      this.data = imported;
      this.save();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  clear() {
    this.data = {
      entities: {},
      relations: [],
      facts: [],
      observations: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    this.save();
    return { success: true };
  }
}

// ============================================================================
// Tool Definitions for Aria
// ============================================================================

const WORLD_MODEL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'world_create_entity',
      description: 'Create or update an entity in the world model. Entities represent people, projects, files, concepts, or any named thing.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Entity type (e.g., person, project, file, concept, tool, service)',
          },
          name: {
            type: 'string',
            description: 'Name of the entity',
          },
          properties: {
            type: 'object',
            description: 'Additional properties for the entity',
          },
        },
        required: ['type', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'world_find_entities',
      description: 'Search for entities in the world model by type, name, or properties.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Filter by entity type',
          },
          name: {
            type: 'string',
            description: 'Filter by name (partial match)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'world_create_relation',
      description: 'Create a relationship between two entities.',
      parameters: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: 'Source entity ID (format: type:name)',
          },
          to: {
            type: 'string',
            description: 'Target entity ID (format: type:name)',
          },
          type: {
            type: 'string',
            description: 'Relationship type (e.g., owns, uses, depends_on, created_by, related_to)',
          },
          properties: {
            type: 'object',
            description: 'Additional properties for the relationship',
          },
        },
        required: ['from', 'to', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'world_get_relations',
      description: 'Get all relationships for an entity.',
      parameters: {
        type: 'object',
        properties: {
          entityId: {
            type: 'string',
            description: 'Entity ID to get relations for',
          },
          direction: {
            type: 'string',
            enum: ['incoming', 'outgoing', 'both'],
            description: 'Direction of relationships to retrieve',
          },
        },
        required: ['entityId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'world_add_fact',
      description: 'Add a fact to the knowledge base as a subject-predicate-object triple.',
      parameters: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description: 'Subject of the fact',
          },
          predicate: {
            type: 'string',
            description: 'Predicate/relationship (e.g., is_a, has, prefers, works_on)',
          },
          object: {
            type: 'string',
            description: 'Object of the fact',
          },
          confidence: {
            type: 'number',
            description: 'Confidence level 0-1',
          },
        },
        required: ['subject', 'predicate', 'object'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'world_query_facts',
      description: 'Query facts from the knowledge base.',
      parameters: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description: 'Filter by subject',
          },
          predicate: {
            type: 'string',
            description: 'Filter by predicate',
          },
          object: {
            type: 'string',
            description: 'Filter by object',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'world_add_observation',
      description: 'Add a free-form observation or note to the world model.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The observation content',
          },
          context: {
            type: 'object',
            description: 'Optional context (e.g., source, topic, tags)',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'world_search',
      description: 'Search across all world model data (entities, facts, observations).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          limit: {
            type: 'number',
            description: 'Maximum results per category',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'world_get_stats',
      description: 'Get statistics about the world model.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'world_get_entity_graph',
      description: 'Get the relationship graph around an entity.',
      parameters: {
        type: 'object',
        properties: {
          entityId: {
            type: 'string',
            description: 'Entity ID to get graph for',
          },
          depth: {
            type: 'number',
            description: 'How many levels of relationships to traverse (default: 1)',
          },
        },
        required: ['entityId'],
      },
    },
  },
];

// ============================================================================
// Tool Executor
// ============================================================================

class WorldModelTools {
  constructor(storagePath) {
    this.model = new WorldModel(storagePath);
  }

  async execute(toolName, args) {
    try {
      switch (toolName) {
        case 'world_create_entity':
          return {
            success: true,
            entity: this.model.createEntity(args.type, args.name, args.properties || {}),
          };

        case 'world_find_entities':
          return {
            success: true,
            entities: this.model.findEntities(args),
          };

        case 'world_create_relation':
          return this.model.createRelation(args.from, args.to, args.type, args.properties || {});

        case 'world_get_relations':
          return {
            success: true,
            relations: this.model.getRelations(args.entityId, args.direction || 'both'),
          };

        case 'world_add_fact':
          return this.model.addFact(args.subject, args.predicate, args.object, {
            confidence: args.confidence,
            source: 'aria',
          });

        case 'world_query_facts':
          return {
            success: true,
            facts: this.model.queryFacts(args),
          };

        case 'world_add_observation':
          return {
            success: true,
            observation: this.model.addObservation(args.content, args.context || {}),
          };

        case 'world_search':
          return {
            success: true,
            results: this.model.search(args.query, { limit: args.limit }),
          };

        case 'world_get_stats':
          return {
            success: true,
            stats: this.model.getStats(),
          };

        case 'world_get_entity_graph':
          return {
            success: true,
            graph: this.model.getEntityGraph(args.entityId, args.depth || 1),
          };

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  getToolDefinitions() {
    return WORLD_MODEL_TOOLS;
  }
}

module.exports = {
  WorldModel,
  WorldModelTools,
  WORLD_MODEL_TOOLS,
};
