#!/usr/bin/env node
/**
 * Multi-Model OpenRouter Server
 * 
 * Spins up multiple HTTP servers, each dedicated to a specific LLM model.
 * This "warms up" the models by making initial requests and keeps them ready.
 * 
 * Usage:
 *   OPENROUTER_API_KEY=xxx node scripts/model-servers.mjs
 * 
 * Each model gets its own port starting from 3100.
 */

import http from 'http';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY environment variable is required');
  console.error('   Get your key at: https://openrouter.ai/keys');
  process.exit(1);
}

// Models to warm up - covering major providers
const MODELS = [
  // Anthropic
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', port: 3100 },
  { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', port: 3101 },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', port: 3102 },
  
  // OpenAI
  { id: 'openai/gpt-4o', name: 'GPT-4o', port: 3110 },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', port: 3111 },
  { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', port: 3112 },
  { id: 'openai/o1-preview', name: 'o1 Preview', port: 3113 },
  { id: 'openai/o1-mini', name: 'o1 Mini', port: 3114 },
  
  // Google
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', port: 3120 },
  { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5', port: 3121 },
  
  // Meta Llama
  { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', port: 3130 },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', port: 3131 },
  { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', port: 3132 },
  
  // Mistral
  { id: 'mistralai/mistral-large', name: 'Mistral Large', port: 3140 },
  { id: 'mistralai/mixtral-8x22b-instruct', name: 'Mixtral 8x22B', port: 3141 },
  { id: 'mistralai/mistral-7b-instruct', name: 'Mistral 7B', port: 3142 },
  
  // Cohere
  { id: 'cohere/command-r-plus', name: 'Command R+', port: 3150 },
  { id: 'cohere/command-r', name: 'Command R', port: 3151 },
  
  // DeepSeek
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', port: 3160 },
  { id: 'deepseek/deepseek-coder', name: 'DeepSeek Coder', port: 3161 },
  
  // Qwen
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', port: 3170 },
  { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', port: 3171 },
];

const ARIA_SYSTEM_PROMPT = `You are Aria (AI Runtime Interactive Agent), a runtime-aware coding assistant.
You observe, execute, and repair code in real-time with access to DOM, console, and network sensors.
Be concise and technical. Provide actionable responses.`;

async function callOpenRouter(model, messages, maxTokens = 1024) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://github.com/elevate-foundry/ai-native-ide',
      'X-Title': 'Aria IDE',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: ARIA_SYSTEM_PROMPT },
        ...messages,
      ],
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${error}`);
  }

  return response.json();
}

async function warmUpModel(model) {
  console.log(`🔥 Warming up ${model.name} (${model.id})...`);
  
  try {
    const start = Date.now();
    const response = await callOpenRouter(model.id, [
      { role: 'user', content: 'Say "ready" in one word.' }
    ], 10);
    
    const latency = Date.now() - start;
    const content = response.choices?.[0]?.message?.content || '';
    console.log(`✅ ${model.name}: Ready (${latency}ms) - "${content.trim()}"`);
    return { success: true, latency, response: content };
  } catch (error) {
    console.log(`⚠️  ${model.name}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function createModelServer(model) {
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        model: model.id, 
        name: model.name,
        port: model.port 
      }));
      return;
    }

    // Model info
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        model: model.id,
        name: model.name,
        port: model.port,
        endpoints: {
          chat: 'POST /chat',
          complete: 'POST /complete',
          health: 'GET /health',
        }
      }));
      return;
    }

    // Chat endpoint
    if (req.method === 'POST' && (req.url === '/chat' || req.url === '/complete')) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const messages = data.messages || [{ role: 'user', content: data.prompt || data.content }];
          const maxTokens = data.max_tokens || 1024;
          
          const start = Date.now();
          const response = await callOpenRouter(model.id, messages, maxTokens);
          const latency = Date.now() - start;
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            model: model.id,
            latency_ms: latency,
            content: response.choices?.[0]?.message?.content || '',
            usage: response.usage,
            raw: response,
          }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Aria Multi-Model OpenRouter Servers              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const servers = [];
  const results = [];

  // Start all servers
  for (const model of MODELS) {
    const server = createModelServer(model);
    
    try {
      await new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(model.port, '0.0.0.0', () => {
          console.log(`🚀 ${model.name.padEnd(25)} → http://localhost:${model.port}`);
          resolve();
        });
      });
      servers.push({ model, server });
    } catch (error) {
      console.log(`❌ ${model.name.padEnd(25)} → Port ${model.port} unavailable`);
    }
  }

  console.log('\n────────────────────────────────────────────────────────────');
  console.log('Warming up models (this may take a minute)...\n');

  // Warm up models in parallel batches
  const batchSize = 5;
  for (let i = 0; i < servers.length; i += batchSize) {
    const batch = servers.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(({ model }) => warmUpModel(model))
    );
    results.push(...batchResults);
  }

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`✅ ${successful} models ready | ⚠️  ${failed} unavailable`);
  console.log('════════════════════════════════════════════════════════════\n');

  // Print port mapping
  console.log('📋 Model → Port Mapping:\n');
  for (const { model } of servers) {
    console.log(`   curl http://localhost:${model.port}/chat -d '{"prompt":"Hello"}'`);
  }

  console.log('\n🛑 Press Ctrl+C to stop all servers\n');

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down servers...');
    for (const { server, model } of servers) {
      server.close();
      console.log(`   Closed ${model.name}`);
    }
    process.exit(0);
  });
}

main().catch(console.error);
