#!/usr/bin/env node
/**
 * Aria CLI - Interactive conversation with Aria agent
 * 
 * Usage:
 *   node scripts/aria-cli.mjs
 *   
 * Or with the start script:
 *   ./scripts/start-aria.sh
 */

import readline from 'readline';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Load environment
import { config } from 'dotenv';
config();

const { AriaAgent } = require('../src/agent.js');

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

console.log(`
${CYAN}╔════════════════════════════════════════════════════════════╗
║                                                              ║
║     ${BOLD}👋 Hello! I'm Aria${RESET}${CYAN}                                      ║
║     ${DIM}AI Runtime Interactive Agent${RESET}${CYAN}                            ║
║                                                              ║
║     I can help you with:                                     ║
║     • Reading and writing files                              ║
║     • Running commands                                       ║
║     • Searching code                                         ║
║     • Browser automation (with Playwright)                   ║
║     • Building and debugging applications                    ║
║                                                              ║
║     Type your request and I'll help you accomplish it.       ║
║     Type 'exit' or 'quit' to leave.                          ║
║     Type 'clear' to reset conversation history.              ║
║                                                              ║
╚════════════════════════════════════════════════════════════╝${RESET}
`);

// Check for API key
if (!process.env.OPENROUTER_API_KEY) {
  console.error(`${YELLOW}⚠️  OPENROUTER_API_KEY not set. Please set it in .env or export it.${RESET}`);
  process.exit(1);
}

// Create agent
const agent = new AriaAgent({
  workingDirectory: process.cwd(),
  onChunk: (chunk) => process.stdout.write(chunk),
  onToolCall: (tool) => {
    console.log(`\n${DIM}🔧 ${tool.name}${RESET}`);
  },
  onToolResult: (name, result) => {
    if (!result.success) {
      console.log(`${YELLOW}   ⚠️ ${result.error}${RESET}`);
    }
  },
  onCompaction: (stats) => {
    console.log(`\n${DIM}📦 Context compacted: ${stats.tokensBefore} → ${stats.tokensAfter} tokens (${stats.reduction}% reduction)${RESET}`);
  },
});

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt() {
  rl.question(`\n${GREEN}You: ${RESET}`, async (input) => {
    const trimmed = input.trim();
    
    if (!trimmed) {
      prompt();
      return;
    }
    
    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(`\n${CYAN}👋 Goodbye!${RESET}\n`);
      rl.close();
      process.exit(0);
    }
    
    if (trimmed === 'clear') {
      agent.clearHistory();
      console.log(`${DIM}Conversation history cleared.${RESET}`);
      prompt();
      return;
    }
    
    if (trimmed === 'stats') {
      const stats = agent.getContextStats();
      console.log(`${DIM}📊 Context Stats:${RESET}`);
      console.log(`   Messages: ${stats.messageCount}`);
      console.log(`   Estimated tokens: ${stats.estimatedTokens}`);
      console.log(`   Needs compaction: ${stats.needsCompaction ? 'yes' : 'no'}`);
      prompt();
      return;
    }
    
    console.log(`\n${CYAN}Aria: ${RESET}`);
    
    try {
      await agent.chatStream(trimmed);
      console.log(); // Newline after response
    } catch (error) {
      console.error(`\n${YELLOW}Error: ${error.message}${RESET}`);
    }
    
    prompt();
  });
}

// Handle Ctrl+C gracefully
rl.on('close', () => {
  console.log(`\n${CYAN}👋 Goodbye!${RESET}\n`);
  process.exit(0);
});

// Start the conversation
prompt();
