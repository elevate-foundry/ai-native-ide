#!/usr/bin/env node
import { RuntimeNativeIDE, PlaywrightInterfaceObserver } from '../src/index.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, isAbsolute } from 'path';

const PROTOCOL_VERSION = '2024-11-05';
const WORKSPACE_ROOT = process.cwd();

function safeReadFile(relativePath) {
  const safePath = resolvePath(relativePath);
  try {
    return readFileSync(safePath, 'utf8');
  } catch (e) {
    throw new Error(`Failed to read file: ${e.message}`);
  }
}

function safeWriteFile(relativePath, content) {
  const safePath = resolvePath(relativePath);
  try {
    writeFileSync(safePath, content, 'utf8');
    return `Wrote ${relativePath}`;
  } catch (e) {
    throw new Error(`Failed to write file: ${e.message}`);
  }
}

function safeRunShell(command) {
  if (!command || typeof command !== 'string') {
    throw new Error('Command is required');
  }
  const dangerous = ['rm -rf /', 'mkfs', 'dd if=', '> /dev/sda'];
  if (dangerous.some(d => command.includes(d))) {
    throw new Error('Command blocked for safety');
  }
  try {
    return execSync(command, { cwd: WORKSPACE_ROOT, encoding: 'utf8', timeout: 30000 });
  } catch (e) {
    return e.stdout + e.stderr;
  }
}

function resolvePath(relativePath) {
  const resolved = isAbsolute(relativePath) ? relativePath : resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Path outside workspace not allowed');
  }
  return resolved;
}

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
        {
          name: 'read_file',
          description: 'Read the contents of a file from the workspace.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path to the file' },
            },
            required: ['path'],
          },
        },
        {
          name: 'write_file',
          description: 'Write content to a file in the workspace.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path to the file' },
              content: { type: 'string', description: 'Content to write' },
            },
            required: ['path', 'content'],
          },
        },
        {
          name: 'run_shell',
          description: 'Run a shell command in the workspace directory.',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'Shell command to execute' },
            },
            required: ['command'],
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

    if (name === 'read_file') {
      const data = safeReadFile(argumentsPayload.path);
      sendResult(id, { content: [{ type: 'text', text: data }] });
      return;
    }

    if (name === 'write_file') {
      const data = safeWriteFile(argumentsPayload.path, argumentsPayload.content);
      sendResult(id, { content: [{ type: 'text', text: data }] });
      return;
    }

    if (name === 'run_shell') {
      const data = safeRunShell(argumentsPayload.command);
      sendResult(id, { content: [{ type: 'text', text: data }] });
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
