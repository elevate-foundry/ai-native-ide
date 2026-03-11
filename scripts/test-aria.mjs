#!/usr/bin/env node
/**
 * Test Aria's agent capabilities
 */

import { createRequire } from 'module';
import { config } from 'dotenv';

config();

const require = createRequire(import.meta.url);
const { AriaAgent } = require('../src/agent.js');

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

console.log(`${CYAN}Testing Aria Agent...${RESET}\n`);

const agent = new AriaAgent({
  workingDirectory: process.cwd(),
  onChunk: (chunk) => process.stdout.write(chunk),
  onToolCall: (tool) => {
    console.log(`\n${YELLOW}🔧 Tool: ${tool.name}${RESET}`);
  },
  onToolResult: (name, result) => {
    console.log(`${GREEN}✓ Result: ${JSON.stringify(result).slice(0, 100)}...${RESET}`);
  },
});

async function test() {
  console.log(`\n${CYAN}═══════════════════════════════════════${RESET}`);
  console.log(`${CYAN}Test 1: List files in current directory${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════${RESET}\n`);
  
  try {
    const response = await agent.chatStream("List the files in the current directory and tell me what this project is about based on the file structure.");
    console.log(`\n\n${GREEN}✅ Test 1 passed${RESET}\n`);
  } catch (e) {
    console.error(`\n${YELLOW}❌ Test 1 failed: ${e.message}${RESET}\n`);
  }

  console.log(`\n${CYAN}═══════════════════════════════════════${RESET}`);
  console.log(`${CYAN}Test 2: Read a specific file${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════${RESET}\n`);
  
  try {
    const response = await agent.chatStream("Read the first 20 lines of package.json and summarize what dependencies this project has.");
    console.log(`\n\n${GREEN}✅ Test 2 passed${RESET}\n`);
  } catch (e) {
    console.error(`\n${YELLOW}❌ Test 2 failed: ${e.message}${RESET}\n`);
  }

  console.log(`\n${CYAN}═══════════════════════════════════════${RESET}`);
  console.log(`${CYAN}Test 3: Run a command${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════${RESET}\n`);
  
  try {
    const response = await agent.chatStream("Run 'npm test' and tell me if all tests pass.");
    console.log(`\n\n${GREEN}✅ Test 3 passed${RESET}\n`);
  } catch (e) {
    console.error(`\n${YELLOW}❌ Test 3 failed: ${e.message}${RESET}\n`);
  }

  console.log(`\n${CYAN}═══════════════════════════════════════${RESET}`);
  console.log(`${GREEN}All tests complete!${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════${RESET}\n`);
}

test().catch(console.error);
