import { execSync } from 'node:child_process';
import fs from 'node:fs';

function countWithSS() {
  const output = execSync('ss -tanH', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const lines = output.split('\n').filter(Boolean);

  const total = lines.length;
  const established = lines.filter((line) => line.includes('ESTAB')).length;
  const listening = lines.filter((line) => line.includes('LISTEN')).length;

  return { total, established, listening, source: 'ss' };
}

function countWithNetstat() {
  const output = execSync('netstat -tan', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const lines = output
    .split('\n')
    .filter((line) => line.startsWith('tcp'));

  const total = lines.length;
  const established = lines.filter((line) => line.includes('ESTABLISHED')).length;
  const listening = lines.filter((line) => line.includes('LISTEN')).length;

  return { total, established, listening, source: 'netstat' };
}

function countWithProcNet() {
  const parse = (path) => {
    if (!fs.existsSync(path)) {
      return [];
    }

    return fs
      .readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .map((line) => line.trim().split(/\s+/)[3]);
  };

  const tcpStates = [...parse('/proc/net/tcp'), ...parse('/proc/net/tcp6')];
  const total = tcpStates.length;
  const established = tcpStates.filter((state) => state === '01').length;
  const listening = tcpStates.filter((state) => state === '0A').length;

  return { total, established, listening, source: '/proc/net' };
}

function getSocketStats() {
  try {
    return countWithSS();
  } catch {
    try {
      return countWithNetstat();
    } catch {
      return countWithProcNet();
    }
  }
}

const intervalMs = Number(process.env.SOCKET_MONITOR_INTERVAL_MS || 2000);
const once = process.argv.includes('--once');

function printStats() {
  const stats = getSocketStats();
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} sockets total=${stats.total} established=${stats.established} listening=${stats.listening} source=${stats.source}`);
}

printStats();

if (!once) {
  setInterval(printStats, intervalMs);
}
