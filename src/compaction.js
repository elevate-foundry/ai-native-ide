/**
 * Context Compaction for Aria
 * 
 * Compresses long conversation histories to fit within token limits
 * while preserving essential context and recent interactions.
 * 
 * Strategies:
 * 1. Summarization - Compress old messages into summaries
 * 2. Truncation - Remove oldest messages beyond a threshold
 * 3. Tool result compression - Shorten verbose tool outputs
 * 4. Sliding window - Keep recent N messages in full detail
 * 5. Braille braiding - UEB encoding for semantic compression & deduplication
 */

const { createLLMClient } = require('./llm.cjs');
const { BrailleHarness, braidConversation, findDuplicates } = require('./braille-harness');

// Approximate token counts (rough estimates)
const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_TOKENS = 100000; // Context window target
const SLIDING_WINDOW_SIZE = 10;    // Keep last N message pairs in full
const SUMMARY_TRIGGER_TOKENS = 50000; // Start compacting at this threshold

/**
 * Estimate token count for a message or string
 */
function estimateTokens(content) {
  if (!content) return 0;
  if (typeof content === 'string') {
    return Math.ceil(content.length / CHARS_PER_TOKEN);
  }
  return Math.ceil(JSON.stringify(content).length / CHARS_PER_TOKEN);
}

/**
 * Estimate total tokens in conversation history
 */
function estimateHistoryTokens(history) {
  return history.reduce((total, msg) => {
    let tokens = estimateTokens(msg.content);
    if (msg.tool_calls) {
      tokens += estimateTokens(msg.tool_calls);
    }
    return total + tokens;
  }, 0);
}

/**
 * Compress tool results to essential information
 */
function compressToolResult(result) {
  try {
    const parsed = JSON.parse(result);
    
    if (!parsed.success) {
      return JSON.stringify({ success: false, error: parsed.error?.slice(0, 200) });
    }
    
    // Compress file contents
    if (parsed.content && parsed.content.length > 500) {
      const lines = parsed.content.split('\n');
      if (lines.length > 20) {
        return JSON.stringify({
          success: true,
          content: lines.slice(0, 10).join('\n') + `\n... (${lines.length - 20} lines omitted) ...\n` + lines.slice(-10).join('\n'),
          total_lines: parsed.total_lines,
        });
      }
    }
    
    // Compress directory listings
    if (parsed.items && parsed.items.length > 20) {
      return JSON.stringify({
        success: true,
        items: parsed.items.slice(0, 10),
        truncated: true,
        total_items: parsed.items.length,
      });
    }
    
    // Compress search results
    if (parsed.matches && parsed.matches.length > 10) {
      return JSON.stringify({
        success: true,
        matches: parsed.matches.slice(0, 10),
        truncated: true,
        total_matches: parsed.matches.length,
      });
    }
    
    // Compress command output
    if (parsed.stdout && parsed.stdout.length > 1000) {
      return JSON.stringify({
        success: parsed.success,
        stdout: parsed.stdout.slice(0, 500) + '\n... (truncated) ...\n' + parsed.stdout.slice(-500),
        stderr: parsed.stderr?.slice(0, 200),
      });
    }
    
    // Compress browser snapshots
    if (parsed.snapshot) {
      return JSON.stringify({
        success: true,
        snapshot: '(accessibility tree - see original for details)',
      });
    }
    
    return result;
  } catch {
    // If not JSON, truncate long strings
    if (result.length > 500) {
      return result.slice(0, 250) + '\n... (truncated) ...\n' + result.slice(-250);
    }
    return result;
  }
}

/**
 * Generate a summary of a conversation segment using LLM
 */
async function summarizeSegment(messages, llmClient) {
  const formattedMessages = messages.map(m => {
    if (m.role === 'user') return `User: ${m.content}`;
    if (m.role === 'assistant') {
      let text = `Assistant: ${m.content || ''}`;
      if (m.tool_calls) {
        text += ` [Used tools: ${m.tool_calls.map(tc => tc.function?.name || tc.name).join(', ')}]`;
      }
      return text;
    }
    if (m.role === 'tool') return `Tool ${m.name}: (result)`;
    return '';
  }).filter(Boolean).join('\n');

  try {
    const response = await llmClient.chat([
      {
        role: 'user',
        content: `Summarize this conversation segment in 2-3 sentences, focusing on:
1. What the user wanted to accomplish
2. What actions were taken
3. The outcome/current state

Conversation:
${formattedMessages}

Summary:`,
      }
    ], { maxTokens: 200, temperature: 0.3 });

    return response.content;
  } catch (e) {
    // Fallback to simple summary
    const userMessages = messages.filter(m => m.role === 'user').length;
    const toolCalls = messages.filter(m => m.tool_calls).length;
    return `[Previous context: ${userMessages} user messages, ${toolCalls} tool uses]`;
  }
}

/**
 * Compact conversation history
 */
async function compactHistory(history, options = {}) {
  const {
    maxTokens = DEFAULT_MAX_TOKENS,
    slidingWindowSize = SLIDING_WINDOW_SIZE,
    summaryTrigger = SUMMARY_TRIGGER_TOKENS,
    llmClient = null,
  } = options;

  const currentTokens = estimateHistoryTokens(history);
  
  // No compaction needed
  if (currentTokens < summaryTrigger) {
    return { history, compacted: false, tokensBefore: currentTokens, tokensAfter: currentTokens };
  }

  const compactedHistory = [];
  
  // Step 1: Identify sliding window (recent messages to keep in full)
  const windowStart = Math.max(0, history.length - slidingWindowSize * 2);
  const oldMessages = history.slice(0, windowStart);
  const recentMessages = history.slice(windowStart);

  // Step 2: Compress tool results in old messages
  const compressedOld = oldMessages.map(msg => {
    if (msg.role === 'tool') {
      return {
        ...msg,
        content: compressToolResult(msg.content),
      };
    }
    return msg;
  });

  // Step 3: Generate summary of old messages if we have an LLM client
  if (oldMessages.length > 0) {
    if (llmClient) {
      const summary = await summarizeSegment(compressedOld, llmClient);
      compactedHistory.push({
        role: 'system',
        content: `[CONTEXT SUMMARY]\n${summary}\n[END SUMMARY]`,
      });
    } else {
      // Simple compaction without LLM
      // Group by user request and keep only essential info
      let currentGroup = [];
      for (const msg of compressedOld) {
        if (msg.role === 'user') {
          if (currentGroup.length > 0) {
            // Summarize previous group
            const userMsg = currentGroup.find(m => m.role === 'user');
            const toolCount = currentGroup.filter(m => m.tool_calls).length;
            if (userMsg) {
              compactedHistory.push({
                role: 'system',
                content: `[Previous: "${userMsg.content.slice(0, 100)}..." - ${toolCount} tool calls]`,
              });
            }
          }
          currentGroup = [msg];
        } else {
          currentGroup.push(msg);
        }
      }
    }
  }

  // Step 4: Add recent messages (sliding window) with compressed tool results
  for (const msg of recentMessages) {
    if (msg.role === 'tool') {
      compactedHistory.push({
        ...msg,
        content: compressToolResult(msg.content),
      });
    } else {
      compactedHistory.push(msg);
    }
  }

  const tokensAfter = estimateHistoryTokens(compactedHistory);

  return {
    history: compactedHistory,
    compacted: true,
    tokensBefore: currentTokens,
    tokensAfter,
    reduction: Math.round((1 - tokensAfter / currentTokens) * 100),
  };
}

/**
 * Incremental compaction - call this after each interaction
 */
function incrementalCompact(history, options = {}) {
  const { maxMessages = 50 } = options;
  
  if (history.length <= maxMessages) {
    return history;
  }

  // Keep system messages and recent messages
  const systemMessages = history.filter(m => m.role === 'system' && m.content?.includes('[CONTEXT'));
  const nonSystemMessages = history.filter(m => !(m.role === 'system' && m.content?.includes('[CONTEXT')));
  
  // Compress tool results in older messages
  const cutoff = nonSystemMessages.length - maxMessages;
  const oldMessages = nonSystemMessages.slice(0, cutoff);
  const recentMessages = nonSystemMessages.slice(cutoff);

  // Create a simple summary of old messages
  const userRequests = oldMessages
    .filter(m => m.role === 'user')
    .map(m => m.content?.slice(0, 50))
    .filter(Boolean);

  const summary = {
    role: 'system',
    content: `[COMPACTED CONTEXT: ${userRequests.length} previous requests including: ${userRequests.slice(-3).join('; ')}...]`,
  };

  return [summary, ...recentMessages];
}

/**
 * Context manager class for Aria
 */
class ContextManager {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
    this.slidingWindowSize = options.slidingWindowSize || SLIDING_WINDOW_SIZE;
    this.summaryTrigger = options.summaryTrigger || SUMMARY_TRIGGER_TOKENS;
    this.llmClient = options.llmClient || null;
    this.autoCompact = options.autoCompact !== false;
    this.useBrailleHarness = options.useBrailleHarness !== false;
    this.brailleHarness = new BrailleHarness({ useContractions: true });
  }

  async compact(history) {
    return compactHistory(history, {
      maxTokens: this.maxTokens,
      slidingWindowSize: this.slidingWindowSize,
      summaryTrigger: this.summaryTrigger,
      llmClient: this.llmClient,
    });
  }

  /**
   * Braille-enhanced compaction using UEB harness
   * 1. Braid all messages into braille form
   * 2. Find duplicates via fingerprinting
   * 3. Remove redundant content
   * 4. Unbraid back to text
   */
  async compactWithBraille(history) {
    if (!this.useBrailleHarness) {
      return this.compact(history);
    }

    // Step 1: Braid conversation into braille
    const braided = braidConversation(history, this.brailleHarness);
    
    // Step 2: Find duplicate messages by fingerprint
    const duplicates = findDuplicates(braided);
    
    // Step 3: Mark duplicates for removal/reference
    const deduped = braided.filter((msg, idx) => {
      // Keep if not a duplicate, or if it's the original
      return !duplicates.some(d => d.duplicate === idx);
    });
    
    // Step 4: Strip braille metadata and return
    const result = deduped.map(({ _braille, _fingerprint, ...msg }) => msg);
    
    // Step 5: Apply standard compaction on top
    const compacted = await this.compact(result);
    
    return {
      ...compacted,
      duplicatesRemoved: duplicates.length,
      brailleStats: this.brailleHarness.getStats(),
    };
  }

  incrementalCompact(history) {
    return incrementalCompact(history, {
      maxMessages: this.slidingWindowSize * 5,
    });
  }

  estimateTokens(history) {
    return estimateHistoryTokens(history);
  }

  needsCompaction(history) {
    return estimateHistoryTokens(history) > this.summaryTrigger;
  }

  getBrailleStats() {
    return this.brailleHarness.getStats();
  }
}

module.exports = {
  estimateTokens,
  estimateHistoryTokens,
  compressToolResult,
  summarizeSegment,
  compactHistory,
  incrementalCompact,
  ContextManager,
  BrailleHarness,
  CHARS_PER_TOKEN,
  DEFAULT_MAX_TOKENS,
  SLIDING_WINDOW_SIZE,
  SUMMARY_TRIGGER_TOKENS,
};
