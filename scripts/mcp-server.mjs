#!/usr/bin/env node
import { RuntimeNativeIDE, PlaywrightInterfaceObserver } from '../src/index.js';

const PROTOCOL_VERSION = '2024-11-05';

let readBuffer = '';

function writeMessage(message) {
  const payload = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n`;
  process.stdout.write(header + payload);
}

function sendResult(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
}

function getDefaultObserver() {
  const observer = new PlaywrightInterfaceObserver({
    openApp: async () => {},
    runScenario: async () => {},
    collectSignals: async () => ({
      dom: '<main data-mcp="true">Playwright sensor placeholder</main>',
      consoleErrors: [],
      network: [],
    }),
  });

  return observer;
}

async function runRuntimeLoop(input) {
  const goal = input?.goal ?? 'Run runtime-native IDE loop';
  const maxIterations = Number.isInteger(input?.maxIterations) ? input.maxIterations : 3;
  const observer = getDefaultObserver();

  const ide = new RuntimeNativeIDE({
    planner: async (requestedGoal) => ({ next: `Plan for: ${requestedGoal}` }),
    modifier: async () => {},
    executor: async ({ iteration }) => ({ status: 'ok', iteration }),
    observer,
    evaluator: async (_snapshot, { iteration }) => {
      if (iteration >= 1) {
        return { done: true, reason: 'MCP loop completed' };
      }

      return { done: false };
    },
    maxIterations,
  });

  return ide.run(goal);
}

async function getInterfaceSensorSnapshot() {
  const observer = getDefaultObserver();
  return observer.observe({ source: 'mcp' });
}

async function handleRequest(request) {
  const { id, method, params } = request;

  if (!method) {
    sendError(id ?? null, -32600, 'Invalid Request: method is required');
    return;
  }

  if (method === 'initialize') {
    sendResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'ai-native-ide-mcp',
        version: '0.1.0',
      },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'tools/list') {
    sendResult(id, {
      tools: [
        {
          name: 'run_runtime_loop',
          description: 'Run the runtime-native IDE loop and return iteration history.',
          inputSchema: {
            type: 'object',
            properties: {
              goal: { type: 'string' },
              maxIterations: { type: 'integer', minimum: 1 },
            },
            required: ['goal'],
          },
        },
        {
          name: 'get_interface_sensor_snapshot',
          description: 'Collect a Playwright-style interface sensor snapshot.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    });
    return;
  }

  if (method === 'tools/call') {
    const name = params?.name;
    const argumentsPayload = params?.arguments ?? {};

    if (name === 'run_runtime_loop') {
      const data = await runRuntimeLoop(argumentsPayload);
      sendResult(id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      });
      return;
    }

    if (name === 'get_interface_sensor_snapshot') {
      const data = await getInterfaceSensorSnapshot(argumentsPayload);
      sendResult(id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      });
      return;
    }

    sendError(id, -32602, `Unknown tool: ${name}`);
    return;
  }

  sendError(id, -32601, `Method not found: ${method}`);
}

function parseAndHandle() {
  while (true) {
    const separatorIndex = readBuffer.indexOf('\r\n\r\n');
    if (separatorIndex === -1) {
      return;
    }

    const header = readBuffer.slice(0, separatorIndex);
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);

    if (!contentLengthMatch) {
      readBuffer = '';
      return;
    }

    const contentLength = Number(contentLengthMatch[1]);
    const messageStart = separatorIndex + 4;
    const messageEnd = messageStart + contentLength;

    if (readBuffer.length < messageEnd) {
      return;
    }

    const body = readBuffer.slice(messageStart, messageEnd);
    readBuffer = readBuffer.slice(messageEnd);

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      sendError(null, -32700, 'Parse error');
      continue;
    }

    Promise.resolve(handleRequest(parsed)).catch((error) => {
      sendError(parsed?.id ?? null, -32000, error instanceof Error ? error.message : String(error));
    });
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  readBuffer += chunk;
  parseAndHandle();
});
