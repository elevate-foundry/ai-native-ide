#!/usr/bin/env node
/**
 * Braille LLM Communication Test
 * 
 * Tests whether LLMs can learn to communicate exclusively in 8-dot braille.
 * Uses OpenRouter to test multiple models.
 */

import 'dotenv/config';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const BRAILLE_BASE = 0x2800;

// 8-dot braille encoding/decoding
function toBraille(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let result = '';
  for (const byte of bytes) {
    result += String.fromCodePoint(BRAILLE_BASE + byte);
  }
  return result;
}

function fromBraille(braille) {
  const bytes = [];
  for (const char of braille) {
    const cp = char.codePointAt(0);
    if (cp >= BRAILLE_BASE && cp <= BRAILLE_BASE + 255) {
      bytes.push(cp - BRAILLE_BASE);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// Check if text is valid braille
function isBraille(text) {
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (cp < BRAILLE_BASE || cp > BRAILLE_BASE + 255) {
      if (char !== '\n' && char !== ' ') return false;
    }
  }
  return true;
}

async function callLLM(model, messages) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://aria-ide.local',
      'X-Title': 'Aria Braille Test',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Test 1: Can the LLM understand braille input?
async function testBrailleComprehension(model) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST 1: Braille Comprehension - ${model}`);
  console.log('='.repeat(60));

  const englishMessage = "What is 2 + 2?";
  const brailleMessage = toBraille(englishMessage);
  
  console.log(`\nInput (English): ${englishMessage}`);
  console.log(`Input (Braille): ${brailleMessage}`);

  const response = await callLLM(model, [
    {
      role: 'system',
      content: `You are communicating in 8-dot Unicode braille (U+2800-U+28FF). 
Each braille character represents one byte of UTF-8 encoded text.
Decode the user's braille message and respond.`
    },
    { role: 'user', content: brailleMessage }
  ]);

  console.log(`\nResponse: ${response}`);
  return response;
}

// Test 2: Can the LLM respond IN braille?
async function testBrailleOutput(model) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST 2: Braille Output - ${model}`);
  console.log('='.repeat(60));

  const response = await callLLM(model, [
    {
      role: 'system',
      content: `You MUST respond ONLY in 8-dot Unicode braille (U+2800-U+28FF).
Each character you output must be a braille pattern.
To encode text: each byte of UTF-8 becomes braille cell at U+2800 + byte_value.

Example: 'Hi' = [72, 105] = [U+2848, U+2869] = ⡈⡩

Respond to the user's question using ONLY braille characters. No English.`
    },
    { role: 'user', content: 'Say hello in braille only.' }
  ]);

  console.log(`\nResponse (raw): ${response}`);
  
  const isValidBraille = isBraille(response.trim());
  console.log(`Valid braille: ${isValidBraille}`);
  
  if (isValidBraille) {
    const decoded = fromBraille(response);
    console.log(`Decoded: ${decoded}`);
  }
  
  return { response, isValidBraille };
}

// Test 3: Full braille conversation
async function testBrailleConversation(model) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST 3: Full Braille Conversation - ${model}`);
  console.log('='.repeat(60));

  const systemPrompt = `You are a braille-native AI. You ONLY communicate in 8-dot Unicode braille.

ENCODING RULES:
- Each byte of UTF-8 text maps to braille: U+2800 + byte_value
- 'A' (65) → ⡁ (U+2841)
- 'a' (97) → ⡡ (U+2861)  
- ' ' (32) → ⠠ (U+2820)
- Example: "Hello" → ⡈⡥⡬⡬⡯

You receive braille, you respond in braille. NO ENGLISH EVER.`;

  const userMessage = toBraille("Write a function that adds two numbers");
  console.log(`\nUser (English): Write a function that adds two numbers`);
  console.log(`User (Braille): ${userMessage}`);

  const response = await callLLM(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ]);

  console.log(`\nResponse (raw): ${response.slice(0, 200)}...`);
  
  const isValidBraille = isBraille(response.replace(/\s/g, ''));
  console.log(`Valid braille: ${isValidBraille}`);
  
  if (isValidBraille || response.includes('⠀') || response.includes('⡀')) {
    try {
      const decoded = fromBraille(response);
      console.log(`\nDecoded response:\n${decoded}`);
    } catch (e) {
      console.log(`Decode error: ${e.message}`);
    }
  }
  
  return { response, isValidBraille };
}

// Test 4: LLM-to-LLM braille communication
async function testLLMtoLLM(model1, model2) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST 4: LLM-to-LLM Braille Communication`);
  console.log(`${model1} ←→ ${model2}`);
  console.log('='.repeat(60));

  const systemPrompt = `You are a braille-native AI. Communicate ONLY in 8-dot braille.
Encoding: UTF-8 byte → U+2800 + byte_value
You will receive a braille message from another AI. Respond in braille.`;

  // Model 1 initiates
  const initMessage = toBraille("Hello, I am an AI. Can you write code in braille?");
  console.log(`\nInitial message (English): Hello, I am an AI. Can you write code in braille?`);
  console.log(`Initial message (Braille): ${initMessage}`);

  const response1 = await callLLM(model1, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: initMessage }
  ]);

  console.log(`\n${model1} responds: ${response1.slice(0, 100)}...`);
  
  // Model 2 responds to Model 1
  const response2 = await callLLM(model2, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: response1 }
  ]);

  console.log(`${model2} responds: ${response2.slice(0, 100)}...`);

  // Try to decode both
  console.log(`\n--- Decoded conversation ---`);
  try {
    console.log(`${model1}: ${fromBraille(response1)}`);
  } catch (e) {
    console.log(`${model1}: [Could not decode - mixed content]`);
  }
  try {
    console.log(`${model2}: ${fromBraille(response2)}`);
  } catch (e) {
    console.log(`${model2}: [Could not decode - mixed content]`);
  }

  return { response1, response2 };
}

// Test 5: Programming in braille
async function testBrailleProgramming(model) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST 5: Programming in Braille - ${model}`);
  console.log('='.repeat(60));

  const codeRequest = toBraille(`function fibonacci(n) {
  // Write the implementation
}`);

  console.log(`\nRequest: Complete this function (sent as braille)`);

  const response = await callLLM(model, [
    {
      role: 'system',
      content: `You are a braille-native programmer. 
You receive code in 8-dot braille and respond with code in 8-dot braille.
Encoding: each UTF-8 byte → braille cell at U+2800 + byte_value

Complete the code the user sends. Respond ONLY in braille.`
    },
    { role: 'user', content: codeRequest }
  ]);

  console.log(`\nResponse (braille): ${response.slice(0, 200)}...`);
  
  try {
    const decoded = fromBraille(response);
    console.log(`\nDecoded code:\n${decoded}`);
  } catch (e) {
    console.log(`\nPartial decode attempt...`);
    // Try to extract braille portions
    const brailleChars = [...response].filter(c => {
      const cp = c.codePointAt(0);
      return cp >= BRAILLE_BASE && cp <= BRAILLE_BASE + 255;
    }).join('');
    if (brailleChars.length > 0) {
      console.log(`Braille portion decoded: ${fromBraille(brailleChars)}`);
    }
  }

  return response;
}

// Main test runner
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           ARIA BRAILLE COMMUNICATION TEST                     ║
║                                                               ║
║  Testing if LLMs can learn to communicate in 8-dot braille   ║
╚══════════════════════════════════════════════════════════════╝
`);

  if (!OPENROUTER_API_KEY) {
    console.error('ERROR: OPENROUTER_API_KEY not set in .env');
    process.exit(1);
  }

  const models = [
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'deepseek/deepseek-chat',
  ];

  // Run tests
  for (const model of models) {
    console.log(`\n\n${'#'.repeat(70)}`);
    console.log(`# TESTING MODEL: ${model}`);
    console.log('#'.repeat(70));

    try {
      await testBrailleComprehension(model);
      await testBrailleOutput(model);
      await testBrailleConversation(model);
      await testBrailleProgramming(model);
    } catch (e) {
      console.error(`Error testing ${model}: ${e.message}`);
    }
  }

  // LLM-to-LLM test
  console.log(`\n\n${'#'.repeat(70)}`);
  console.log(`# LLM-TO-LLM BRAILLE COMMUNICATION`);
  console.log('#'.repeat(70));

  try {
    await testLLMtoLLM('anthropic/claude-3.5-sonnet', 'openai/gpt-4o');
    await testLLMtoLLM('openai/gpt-4o', 'deepseek/deepseek-chat');
  } catch (e) {
    console.error(`Error in LLM-to-LLM test: ${e.message}`);
  }

  console.log(`\n\n${'='.repeat(70)}`);
  console.log('TESTS COMPLETE');
  console.log('='.repeat(70));
}

main().catch(console.error);
