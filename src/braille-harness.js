/**
 * UEB Braille Braiding Harness
 * 
 * Uses Unified English Braille (UEB) 8-dot encoding as a semantic compression
 * and normalization layer for LLM outputs. This serves multiple purposes:
 * 
 * 1. COMPRESSION: UEB contractions reduce common patterns to single cells
 * 2. NORMALIZATION: All LLM outputs pass through same encoding layer
 * 3. COMPACTION: Braille representation enables efficient context compression
 * 4. FINGERPRINTING: Braille patterns can be hashed for deduplication
 * 5. CROSS-MODEL CONSISTENCY: DeepSeek, Claude, GPT all normalize to same form
 */

const BRAILLE_BASE = 0x2800;

// ============================================================================
// UEB Word Contractions (Grade 2 Braille)
// These compress common words to single or double cells
// ============================================================================

const UEB_CONTRACTIONS = {
  // Single-cell whole word contractions (Grade 2 UEB)
  'but': '⠃',
  'can': '⠉',
  'do': '⠙',
  'every': '⠑',
  'from': '⠋',
  'go': '⠛',
  'have': '⠓',
  'just': '⠚',
  'knowledge': '⠅',
  'like': '⠇',
  'more': '⠍',
  'not': '⠝',
  'people': '⠏',
  'quite': '⠟',
  'rather': '⠗',
  'so': '⠎',
  'that': '⠞',
  'us': '⠥',
  'very': '⠧',
  'will': '⠺',
  'it': '⠭',
  'you': '⠽',
  'as': '⠵',
  'and': '⠯',
  'for': '⠿',
  'of': '⠷',
  'the': '⠮',
  'with': '⠾',
  'child': '⠡',
  'shall': '⠩',
  'this': '⠹',
  'which': '⠱',
  'out': '⠳',
  'still': '⠌',
  
  // Additional high-frequency words for compaction
  'about': '⠁⠃',
  'after': '⠁⠋',
  'again': '⠁⠛',
  'also': '⠁⠇',
  'always': '⠁⠇⠺',
  'because': '⠃⠉',
  'before': '⠃⠋',
  'between': '⠃⠞',
  'could': '⠉⠙',
  'would': '⠺⠙',
  'should': '⠩⠙',
  'been': '⠃⠝',
  'being': '⠃⠛',
  'does': '⠙⠎',
  'done': '⠙⠝',
  'each': '⠑⠡',
  'even': '⠑⠧',
  'first': '⠋⠌',
  'found': '⠋⠙',
  'good': '⠛⠙',
  'great': '⠛⠗',
  'here': '⠓⠗',
  'into': '⠔',
  'know': '⠅⠝',
  'made': '⠍⠙',
  'make': '⠍⠅',
  'many': '⠍⠽',
  'must': '⠍⠌',
  'need': '⠝⠙',
  'never': '⠝⠧',
  'only': '⠕⠝',
  'other': '⠕⠮',
  'over': '⠕⠧',
  'said': '⠎⠙',
  'same': '⠎⠍',
  'some': '⠎⠍',
  'such': '⠎⠡',
  'than': '⠮⠝',
  'their': '⠮⠗',
  'them': '⠮⠍',
  'then': '⠮⠝',
  'there': '⠮⠗',
  'these': '⠮⠎',
  'they': '⠮⠽',
  'think': '⠹⠅',
  'through': '⠹⠗',
  'time': '⠞⠍',
  'under': '⠥⠝',
  'upon': '⠥⠏',
  'used': '⠥⠙',
  'using': '⠥⠛',
  'want': '⠺⠞',
  'well': '⠺⠇',
  'were': '⠺⠗',
  'what': '⠱⠞',
  'when': '⠱⠝',
  'where': '⠱⠗',
  'while': '⠱⠇',
  'work': '⠺⠅',
  'your': '⠽⠗',
  
  // Programming-specific contractions (custom extension)
  'function': '⣋⣥',
  'return': '⣗⣞',
  'const': '⣉⣎',
  'let': '⣇⣞',
  'var': '⣧⣗',
  'if': '⣊⣋',
  'else': '⣑⣇',
  'class': '⣉⣇',
  'import': '⣊⣍',
  'export': '⣑⣭',
  'async': '⣁⣎',
  'await': '⣁⣺',
  'true': '⣞⣗',
  'false': '⣋⣇',
  'null': '⣝⣥',
  'undefined': '⣥⣙',
  'console': '⣉⣎⣇',
  'error': '⣑⣗⣗',
  'string': '⣎⣞⣗',
  'number': '⣝⣥⣍',
  'boolean': '⣃⣕⣇',
  'array': '⣁⣗⣗',
  'object': '⣕⣃⣚',
  'promise': '⣏⣗⣍',
  
  // Tool/action contractions for compaction summaries
  'file': '⣋⣇',
  'read': '⣗⣙',
  'write': '⣺⣗',
  'create': '⣉⣗',
  'delete': '⣙⣇',
  'update': '⣥⣏',
  'search': '⣎⣗',
  'found': '⣋⣙',
  'success': '⣎⣉',
  'failed': '⣋⣇⣙',
  'directory': '⣙⣗',
  'path': '⣏⣞',
  'content': '⣉⣞',
  'result': '⣗⣎',
  'output': '⣕⣏',
  'input': '⣊⣏',
  'command': '⣉⣍⣙',
  'execute': '⣑⣭⣉',
  'browser': '⣃⣗⣺',
  'navigate': '⣝⣧⣛',
  'click': '⣉⣇⣅',
  'type': '⣞⣏',
  'snapshot': '⣎⣝⣏',
  'element': '⣑⣇⣍',
  'selector': '⣎⣇⣉',
  'response': '⣗⣎⣏',
  'request': '⣗⣟⣎',
  'message': '⣍⣎⣛',
  'user': '⣥⣎⣗',
  'assistant': '⣁⣎⣞',
  'tool': '⣞⣇',
  'called': '⣉⣇⣙',
  'completed': '⣉⣍⣏',
  'modified': '⣍⣙⣋',
  'created': '⣉⣗⣙',
  'deleted': '⣙⣇⣙',
};

// Reverse map for decoding
const UEB_REVERSE = {};
for (const [word, braille] of Object.entries(UEB_CONTRACTIONS)) {
  UEB_REVERSE[braille] = word;
}

// ============================================================================
// 8-Dot Braille Core Encoding
// ============================================================================

function byteToBraille(byte) {
  return String.fromCodePoint(BRAILLE_BASE + byte);
}

function brailleToByte(char) {
  const cp = char.codePointAt(0);
  if (cp >= BRAILLE_BASE && cp <= BRAILLE_BASE + 255) {
    return cp - BRAILLE_BASE;
  }
  return null;
}

function textToBrailleRaw(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let result = '';
  for (const byte of bytes) {
    result += byteToBraille(byte);
  }
  return result;
}

function brailleToTextRaw(braille) {
  const bytes = [];
  for (const char of braille) {
    const byte = brailleToByte(char);
    if (byte !== null) bytes.push(byte);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// ============================================================================
// UEB Braiding Harness
// ============================================================================

class BrailleHarness {
  constructor(options = {}) {
    this.useContractions = options.useContractions !== false;
    this.trackStats = options.trackStats !== false;
    this.stats = {
      totalCharsIn: 0,
      totalBrailleOut: 0,
      contractionsApplied: 0,
      compressionRatio: 1.0,
    };
  }

  /**
   * Encode text to UEB braille with contractions
   * This is the "braiding" step - weaving text into braille form
   */
  braid(text) {
    if (!text) return '';
    
    this.stats.totalCharsIn += text.length;
    
    let result = text;
    
    // Apply UEB contractions if enabled
    if (this.useContractions) {
      // Sort by length descending to match longer words first
      const sortedWords = Object.keys(UEB_CONTRACTIONS)
        .sort((a, b) => b.length - a.length);
      
      for (const word of sortedWords) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const before = result;
        result = result.replace(regex, `⠈${UEB_CONTRACTIONS[word]}⠈`);
        if (result !== before) {
          this.stats.contractionsApplied++;
        }
      }
    }
    
    // Convert remaining text to 8-dot braille
    const parts = result.split('⠈');
    const braided = parts.map((part, i) => {
      // Odd indices are already contracted braille
      if (i % 2 === 1) return part;
      // Even indices need raw encoding
      return textToBrailleRaw(part);
    }).join('');
    
    this.stats.totalBrailleOut += braided.length;
    this.stats.compressionRatio = this.stats.totalBrailleOut / this.stats.totalCharsIn;
    
    return braided;
  }

  /**
   * Decode UEB braille back to text
   * This is the "unbraiding" step
   */
  unbraid(braille) {
    if (!braille) return '';
    
    let result = '';
    let i = 0;
    const chars = [...braille];
    
    while (i < chars.length) {
      const char = chars[i];
      
      // Check for multi-cell contractions (2-3 cells)
      const twoCell = chars.slice(i, i + 2).join('');
      const threeCell = chars.slice(i, i + 3).join('');
      
      if (UEB_REVERSE[threeCell]) {
        result += UEB_REVERSE[threeCell];
        i += 3;
      } else if (UEB_REVERSE[twoCell]) {
        result += UEB_REVERSE[twoCell];
        i += 2;
      } else if (UEB_REVERSE[char]) {
        result += UEB_REVERSE[char];
        i++;
      } else {
        // Single braille cell - decode as byte
        const byte = brailleToByte(char);
        if (byte !== null) {
          // Accumulate bytes for UTF-8 decoding
          const bytes = [byte];
          // Check for multi-byte UTF-8 sequences
          while (i + bytes.length < chars.length) {
            const nextByte = brailleToByte(chars[i + bytes.length]);
            if (nextByte !== null && nextByte >= 0x80 && nextByte < 0xC0) {
              bytes.push(nextByte);
            } else {
              break;
            }
          }
          result += new TextDecoder().decode(new Uint8Array(bytes));
          i += bytes.length;
        } else {
          result += char;
          i++;
        }
      }
    }
    
    return result;
  }

  /**
   * Generate a semantic fingerprint of braided content
   * Useful for deduplication during compaction
   */
  fingerprint(braille) {
    // Simple hash of braille content
    let hash = 0;
    for (const char of braille) {
      const cp = char.codePointAt(0);
      hash = ((hash << 5) - hash) + cp;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Compact braided content by removing redundancy
   * Returns { compacted, savings }
   */
  compact(brailleArray) {
    const seen = new Map();
    const compacted = [];
    let savings = 0;
    
    for (const item of brailleArray) {
      const fp = this.fingerprint(item);
      
      if (seen.has(fp)) {
        // Reference previous occurrence
        compacted.push({ ref: seen.get(fp), fp });
        savings += item.length;
      } else {
        seen.set(fp, compacted.length);
        compacted.push({ content: item, fp });
      }
    }
    
    return { compacted, savings, uniqueCount: seen.size };
  }

  /**
   * Expand compacted content back to full form
   */
  expand(compacted) {
    const result = [];
    
    for (const item of compacted) {
      if (item.content !== undefined) {
        result.push(item.content);
      } else if (item.ref !== undefined) {
        result.push(result[item.ref]);
      }
    }
    
    return result;
  }

  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = {
      totalCharsIn: 0,
      totalBrailleOut: 0,
      contractionsApplied: 0,
      compressionRatio: 1.0,
    };
  }
}

// ============================================================================
// Integration with Context Compaction
// ============================================================================

/**
 * Wrap conversation history in braille harness for compaction
 */
function braidConversation(history, harness = new BrailleHarness()) {
  return history.map(msg => ({
    ...msg,
    _braille: typeof msg.content === 'string' 
      ? harness.braid(msg.content)
      : null,
    _fingerprint: typeof msg.content === 'string'
      ? harness.fingerprint(harness.braid(msg.content))
      : null,
  }));
}

/**
 * Find duplicate/similar messages in braided conversation
 */
function findDuplicates(braidedHistory) {
  const fingerprints = new Map();
  const duplicates = [];
  
  braidedHistory.forEach((msg, idx) => {
    if (msg._fingerprint) {
      if (fingerprints.has(msg._fingerprint)) {
        duplicates.push({
          original: fingerprints.get(msg._fingerprint),
          duplicate: idx,
        });
      } else {
        fingerprints.set(msg._fingerprint, idx);
      }
    }
  });
  
  return duplicates;
}

// ============================================================================
// Deduplication Engine
// ============================================================================

/**
 * Semantic similarity using braille fingerprints
 * Returns similarity score 0-1 based on shared n-grams
 */
function brailleSimilarity(braille1, braille2) {
  if (!braille1 || !braille2) return 0;
  
  const ngrams1 = new Set();
  const ngrams2 = new Set();
  const n = 3; // trigrams
  
  for (let i = 0; i <= braille1.length - n; i++) {
    ngrams1.add(braille1.slice(i, i + n));
  }
  for (let i = 0; i <= braille2.length - n; i++) {
    ngrams2.add(braille2.slice(i, i + n));
  }
  
  if (ngrams1.size === 0 || ngrams2.size === 0) return 0;
  
  let intersection = 0;
  for (const ng of ngrams1) {
    if (ngrams2.has(ng)) intersection++;
  }
  
  return (2 * intersection) / (ngrams1.size + ngrams2.size);
}

/**
 * Deduplication engine for tool outputs and messages
 * Identifies and removes redundant content while preserving references
 */
class DeduplicationEngine {
  constructor(options = {}) {
    this.harness = options.harness || new BrailleHarness();
    this.similarityThreshold = options.similarityThreshold || 0.85;
    this.fingerprints = new Map(); // fp -> { index, content, count }
    this.stats = {
      totalProcessed: 0,
      duplicatesFound: 0,
      bytesDeduped: 0,
    };
  }

  /**
   * Process a message and return deduplicated version
   */
  process(content, role = 'unknown') {
    if (!content || typeof content !== 'string') {
      return { content, isDuplicate: false };
    }

    this.stats.totalProcessed++;
    const braille = this.harness.braid(content);
    const fp = this.harness.fingerprint(braille);

    // Exact match
    if (this.fingerprints.has(fp)) {
      const existing = this.fingerprints.get(fp);
      existing.count++;
      this.stats.duplicatesFound++;
      this.stats.bytesDeduped += content.length;
      
      return {
        content: `[REF:${existing.index}]`, // Reference to original
        isDuplicate: true,
        originalIndex: existing.index,
      };
    }

    // Check for near-duplicates using similarity
    for (const [existingFp, existing] of this.fingerprints) {
      const similarity = brailleSimilarity(braille, existing.braille);
      if (similarity >= this.similarityThreshold) {
        existing.count++;
        this.stats.duplicatesFound++;
        this.stats.bytesDeduped += Math.floor(content.length * similarity);
        
        // Keep only the diff
        const diff = this.extractDiff(content, existing.content);
        return {
          content: `[SIMILAR:${existing.index}] ${diff}`,
          isDuplicate: true,
          similarity,
          originalIndex: existing.index,
        };
      }
    }

    // New unique content
    const index = this.fingerprints.size;
    this.fingerprints.set(fp, {
      index,
      content,
      braille,
      count: 1,
      role,
    });

    return { content, isDuplicate: false, index };
  }

  /**
   * Extract meaningful diff between two similar strings
   */
  extractDiff(newContent, originalContent) {
    const newWords = newContent.split(/\s+/);
    const origWords = new Set(originalContent.split(/\s+/));
    
    const diffWords = newWords.filter(w => !origWords.has(w));
    if (diffWords.length === 0) return '(identical)';
    if (diffWords.length > 20) return `(+${diffWords.length} words)`;
    
    return diffWords.slice(0, 10).join(' ') + (diffWords.length > 10 ? '...' : '');
  }

  /**
   * Deduplicate an entire conversation history
   */
  deduplicateHistory(history) {
    const result = [];
    
    for (const msg of history) {
      if (msg.role === 'tool' && msg.content) {
        const processed = this.process(msg.content, 'tool');
        result.push({
          ...msg,
          content: processed.content,
          _deduped: processed.isDuplicate,
        });
      } else {
        result.push(msg);
      }
    }

    return {
      history: result,
      stats: this.getStats(),
    };
  }

  getStats() {
    return { ...this.stats };
  }

  reset() {
    this.fingerprints.clear();
    this.stats = {
      totalProcessed: 0,
      duplicatesFound: 0,
      bytesDeduped: 0,
    };
  }
}

// ============================================================================
// LLM-Native Braille Summary Generation
// ============================================================================

/**
 * Generate a braille-native summary prompt for LLMs
 * LLMs can read and write braille, so we can ask them to summarize in braille
 */
function createBrailleSummaryPrompt(messages, harness = new BrailleHarness()) {
  const formattedMessages = messages.map(m => {
    if (m.role === 'user') return `U: ${m.content?.slice(0, 200) || ''}`;
    if (m.role === 'assistant') {
      let text = `A: ${m.content?.slice(0, 200) || ''}`;
      if (m.tool_calls) {
        const tools = m.tool_calls.map(tc => tc.function?.name || tc.name).join(',');
        text += ` [${tools}]`;
      }
      return text;
    }
    if (m.role === 'tool') return `T:${m.name}:(result)`;
    return '';
  }).filter(Boolean).join('\n');

  // Provide examples of braille contractions for the LLM
  const contractionExamples = [
    'the→⠮', 'and→⠯', 'for→⠿', 'with→⠾', 'that→⠞',
    'function→⣋⣥', 'return→⣗⣞', 'file→⣋⣇', 'read→⣗⣙',
    'success→⣎⣉', 'error→⣑⣗⣗', 'created→⣉⣗⣙', 'modified→⣍⣙⣋',
  ].join(' ');

  return `Summarize this conversation in compressed braille shorthand.
Use these contractions: ${contractionExamples}
Keep summary under 100 braille cells. Focus on: what user wanted, actions taken, outcome.

Conversation:
${formattedMessages}

Braille summary:`;
}

/**
 * Parse an LLM's braille summary back to text
 */
function parseBrailleSummary(brailleSummary, harness = new BrailleHarness()) {
  if (!brailleSummary) return '';
  
  // Extract braille characters (U+2800-U+28FF)
  const brailleOnly = brailleSummary.replace(/[^\u2800-\u28FF\s]/g, '');
  
  return harness.unbraid(brailleOnly);
}

/**
 * Create a hybrid summary: braille-compressed with English fallback
 */
function createHybridSummary(messages, harness = new BrailleHarness()) {
  const userRequests = messages
    .filter(m => m.role === 'user')
    .map(m => m.content?.slice(0, 50))
    .filter(Boolean);

  const toolCalls = messages
    .filter(m => m.tool_calls)
    .flatMap(m => m.tool_calls.map(tc => tc.function?.name || tc.name));

  const uniqueTools = [...new Set(toolCalls)];

  // Create compressed summary using contractions
  const summary = `${userRequests.length} requests: ${userRequests.slice(-2).join('; ')}. Tools: ${uniqueTools.join(',')}`;
  
  // Braid it for maximum compression
  const braided = harness.braid(summary);
  
  return {
    braille: braided,
    text: summary,
    compressionRatio: braided.length / summary.length,
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  BrailleHarness,
  UEB_CONTRACTIONS,
  textToBrailleRaw,
  brailleToTextRaw,
  byteToBraille,
  brailleToByte,
  braidConversation,
  findDuplicates,
  brailleSimilarity,
  DeduplicationEngine,
  createBrailleSummaryPrompt,
  parseBrailleSummary,
  createHybridSummary,
};
