const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

function encodeMessage(message) {
  const payload = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`;
}

function createParser(onMessage) {
  let buffer = '';

  return (chunk) => {
    buffer += chunk.toString('utf8');

    while (true) {
      const sepIndex = buffer.indexOf('\r\n\r\n');
      if (sepIndex === -1) {
        return;
      }

      const header = buffer.slice(0, sepIndex);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = '';
        return;
      }

      const contentLength = Number(match[1]);
      const bodyStart = sepIndex + 4;
      const bodyEnd = bodyStart + contentLength;

      if (buffer.length < bodyEnd) {
        return;
      }

      const body = buffer.slice(bodyStart, bodyEnd);
      buffer = buffer.slice(bodyEnd);
      onMessage(JSON.parse(body));
    }
  };
}

test('mcp server script exists and includes core MCP methods', () => {
  const path = 'scripts/mcp-server.mjs';
  assert.equal(fs.existsSync(path), true);

  const content = fs.readFileSync(path, 'utf8');
  assert.match(content, /method === 'initialize'/);
  assert.match(content, /method === 'tools\/list'/);
  assert.match(content, /method === 'tools\/call'/);
  assert.match(content, /run_runtime_loop/);
  assert.match(content, /get_interface_sensor_snapshot/);
});

test('mcp server responds to initialize and tool calls', async () => {
  const child = spawn(process.execPath, ['scripts/mcp-server.mjs'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const responses = new Map();
  const parser = createParser((msg) => {
    if (Object.prototype.hasOwnProperty.call(msg, 'id')) {
      responses.set(msg.id, msg);
    }
  });

  child.stdout.on('data', parser);

  const request = (id, method, params) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 3000);

    const interval = setInterval(() => {
      if (responses.has(id)) {
        clearTimeout(timer);
        clearInterval(interval);
        resolve(responses.get(id));
      }
    }, 10);

    child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }));
  });

  try {
    const init = await request(1, 'initialize', {});
    assert.equal(init.result.serverInfo.name, 'ai-native-ide-mcp');

    const toolList = await request(2, 'tools/list', {});
    const toolNames = toolList.result.tools.map((tool) => tool.name);
    assert.deepEqual(toolNames.sort(), ['get_interface_sensor_snapshot', 'run_runtime_loop']);

    const toolCall = await request(3, 'tools/call', {
      name: 'run_runtime_loop',
      arguments: { goal: 'verify mcp' },
    });

    assert.equal(toolCall.result.content[0].type, 'text');
    assert.match(toolCall.result.content[0].text, /"status": "completed"/);
  } finally {
    child.kill('SIGTERM');
  }
});
