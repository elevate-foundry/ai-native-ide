#!/usr/bin/env node
/**
 * Test Massive Braille Swarm
 * 
 * Demonstrates the full power of the braille swarm with ALL OpenRouter models.
 */

import 'dotenv/config';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { BrailleSwarm, toBraille, fromBraille } = require('../src/braille-swarm.js');

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║                    MASSIVE BRAILLE SWARM TEST                             ║
║                                                                           ║
║  Connecting to ALL available OpenRouter models for braille communication ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const swarm = new BrailleSwarm({ maxConcurrent: 15 });
  
  // Initialize and fetch all models
  console.log('⏳ Fetching available models from OpenRouter...\n');
  const stats = await swarm.initialize();
  
  console.log('📊 MODEL STATISTICS:');
  console.log('─'.repeat(50));
  console.log(`   Total models available: ${stats.total}`);
  console.log('\n   By category:');
  for (const [category, count] of Object.entries(stats.categories)) {
    console.log(`     ${category.padEnd(15)} ${count} models`);
  }
  
  // Show some models from each category
  console.log('\n📋 SAMPLE MODELS BY CATEGORY:');
  console.log('─'.repeat(50));
  
  for (const category of ['flagship', 'reasoning', 'coding', 'fast', 'open']) {
    const models = swarm.getModelsByCategory(category).slice(0, 5);
    console.log(`\n   ${category.toUpperCase()}:`);
    for (const id of models) {
      console.log(`     • ${id}`);
    }
  }

  // Create agents for flagship models
  console.log('\n\n🚀 CREATING AGENTS...');
  console.log('─'.repeat(50));
  
  const flagshipAgents = swarm.createCategoryAgents('flagship');
  console.log(`   Created ${flagshipAgents.length} flagship agents`);
  
  const reasoningAgents = swarm.createCategoryAgents('reasoning');
  console.log(`   Created ${reasoningAgents.length} reasoning agents`);
  
  const codingAgents = swarm.createCategoryAgents('coding');
  console.log(`   Created ${codingAgents.length} coding agents`);
  
  const fastAgents = swarm.createCategoryAgents('fast');
  console.log(`   Created ${fastAgents.length} fast agents`);

  console.log(`\n   Total active agents: ${swarm.agents.size}`);

  // Test 1: Broadcast to fast models
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('TEST 1: BROADCAST TO FAST MODELS');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const fastModelIds = swarm.getModelsByCategory('fast').slice(0, 10);
  for (const id of fastModelIds) {
    if (!swarm.agents.has(id)) swarm.createAgent(id);
  }
  
  const question = 'What is 2+2? Answer in one word.';
  const brailleQuestion = toBraille(question);
  
  console.log(`\nBroadcasting to ${fastModelIds.length} fast models...`);
  console.log(`Question (English): "${question}"`);
  console.log(`Question (Braille): ${brailleQuestion}`);
  console.log('─'.repeat(50));
  
  const broadcastResults = await swarm.broadcast(question, {
    agents: fastModelIds,
    maxConcurrent: 10,
    onResponse: (result) => {
      if (result.error) {
        console.log(`   ❌ ${result.modelId}: ${result.error}`);
      } else {
        console.log(`   ✅ ${result.name}: ${result.text?.slice(0, 50) || '(braille)'}`);
      }
    },
  });
  
  console.log(`\nCompleted: ${broadcastResults.filter(r => !r.error).length}/${broadcastResults.length} responses`);

  // Test 2: Consensus voting
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('TEST 2: CONSENSUS VOTING');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const consensusAgents = [
    ...swarm.getModelsByCategory('flagship').slice(0, 5),
    ...swarm.getModelsByCategory('open').slice(0, 5),
  ];
  
  for (const id of consensusAgents) {
    if (!swarm.agents.has(id)) swarm.createAgent(id);
  }
  
  console.log(`\nAsking ${consensusAgents.length} models: "What is the best programming language?""`);
  console.log('─'.repeat(50));
  
  const consensus = await swarm.consensus('What is the best programming language for beginners?', {
    agents: consensusAgents,
    onVote: (vote) => {
      console.log(`   🗳️  ${vote.agent.split('/').pop()}: ${vote.answer}`);
    },
  });
  
  console.log('\n📊 CONSENSUS RESULTS:');
  console.log(`   Winner: "${consensus.consensus}" with ${consensus.votes} votes`);
  console.log(`   Total responses: ${consensus.totalResponses}`);
  console.log('\n   Vote distribution:');
  for (const [answer, count] of Object.entries(consensus.distribution).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`     ${answer}: ${'█'.repeat(count)} (${count})`);
  }

  // Test 3: Round-robin braille conversation
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('TEST 3: ROUND-ROBIN BRAILLE CONVERSATION');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const conversationAgents = swarm.getModelsByCategory('flagship').slice(0, 4);
  for (const id of conversationAgents) {
    if (!swarm.agents.has(id)) swarm.createAgent(id);
  }
  
  console.log(`\nStarting conversation between: ${conversationAgents.map(a => a.split('/').pop()).join(' → ')}`);
  console.log('Topic: "Design a simple REST API for a todo app"');
  console.log('─'.repeat(50));
  
  const conversation = await swarm.roundRobin('Design a simple REST API for a todo app. Be concise.', {
    agents: conversationAgents,
    rounds: 1,
    onMessage: (msg) => {
      const agentName = msg.agent.split('/').pop();
      console.log(`\n   [${agentName}]`);
      if (msg.braille) {
        console.log(`   Braille: ${msg.braille.slice(0, 60)}...`);
      }
      if (msg.decoded || msg.text) {
        console.log(`   Decoded: ${(msg.decoded || msg.text).slice(0, 100)}...`);
      }
    },
  });
  
  console.log(`\nConversation complete: ${conversation.length} messages`);

  // Final stats
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('FINAL STATISTICS');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const finalStats = swarm.getStats();
  console.log(`\n   Active agents: ${finalStats.activeAgents}`);
  console.log(`   Total models in registry: ${finalStats.registry.total}`);
  
  let totalCalls = 0;
  let totalErrors = 0;
  for (const [id, agentStats] of Object.entries(finalStats.agentStats)) {
    totalCalls += agentStats.calls;
    totalErrors += agentStats.errors;
  }
  console.log(`   Total API calls: ${totalCalls}`);
  console.log(`   Total errors: ${totalErrors}`);
  console.log(`   Success rate: ${((1 - totalErrors/totalCalls) * 100).toFixed(1)}%`);

  console.log('\n\n✅ MASSIVE BRAILLE SWARM TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
