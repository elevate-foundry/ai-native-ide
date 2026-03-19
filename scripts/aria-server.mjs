#!/usr/bin/env node
/**
 * Aria HTTP Server - Backend API for the frontend chat interface
 * 
 * Exposes Aria's agent capabilities via HTTP endpoints with streaming support.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { config } from 'dotenv';
import os from 'os';

import crypto from 'crypto';

config();

const execAsync = promisify(exec);

const PORT = process.env.ARIA_PORT || 3200;
const WS_PORT = process.env.BRAILLE_WS_PORT || 3201;

// ============================================================================
// Security: Auth Token
// ============================================================================

const AUTH_TOKEN = process.env.ARIA_AUTH_TOKEN || crypto.randomBytes(32).toString('hex');
const AUTH_ENABLED = process.env.ARIA_AUTH !== 'disabled';

function checkAuth(req, res) {
  if (!AUTH_ENABLED) return true;
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token === AUTH_TOKEN) return true;
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized. Set Authorization: Bearer <token> header.' }));
  return false;
}

// ============================================================================
// Security: Path Traversal Protection
// ============================================================================

function safePath(requestedPath, allowedRoot) {
  const resolved = path.resolve(requestedPath);
  if (!resolved.startsWith(allowedRoot)) {
    return null;
  }
  return resolved;
}

function safeProjectPath(requestedPath) {
  return safePath(requestedPath, PROJECT_ROOT);
}

function safeBrowsePath(requestedPath) {
  return safePath(requestedPath, HOME_DIR);
}

// ============================================================================
// Security: Exec Sandboxing
// ============================================================================

const ALLOWED_EXEC_PREFIXES = [
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'fd',
  'git status', 'git log', 'git diff', 'git branch', 'git show', 'git rev-parse',
  'git add', 'git commit', 'git push', 'git pull', 'git fetch', 'git stash',
  'git checkout', 'git merge', 'git rebase', 'git remote', 'git tag',
  'node', 'npm', 'npx', 'python', 'python3', 'pip', 'pip3',
  'cargo', 'rustc', 'go', 'make', 'cmake',
  'echo', 'which', 'env', 'pwd', 'date', 'whoami', 'uname',
  'sort', 'uniq', 'cut', 'awk', 'sed', 'tr', 'diff',
  'curl', 'wget',
  'mkdir', 'touch', 'cp', 'mv',
  'lsof', 'ps',
];

const BLOCKED_SHELL_PATTERNS = [
  /;/,       // command chaining
  /\|\|/,   // OR chaining
  /&&/,      // AND chaining
  /`/,       // backtick subshell
  /\$\(/,   // subshell
  />{1,2}/, // output redirection
  /<\(/,    // process substitution
];

function isExecAllowed(command) {
  if (!command || typeof command !== 'string') return false;
  const trimmed = command.trim();

  // Check against blocked shell metacharacters
  for (const pattern of BLOCKED_SHELL_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // Check command starts with an allowed prefix
  const lower = trimmed.toLowerCase();
  return ALLOWED_EXEC_PREFIXES.some(prefix =>
    lower === prefix || lower.startsWith(prefix + ' ')
  );
}

const require = createRequire(import.meta.url);
const { AriaAgent } = require('../src/agent.js');
const { fileHistory } = require('../src/file-history.js');
const { BrailleWebSocketServer, toBraille, fromBraille } = require('../src/braille-websocket.js');
const { ConversationStore } = require('../src/conversation-store.js');

const PROJECT_ROOT = process.cwd();
const HOME_DIR = os.homedir();

// Directories to skip when indexing
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '__pycache__', '.pytest_cache',
  '.venv', 'venv', 'env', '.env', 'dist', 'build', 'target', '.next',
  '.nuxt', '.output', 'coverage', '.nyc_output', '.cache', '.parcel-cache',
  'vendor', 'Pods', '.gradle', '.idea', '.vscode', '.DS_Store',
  'Library', 'Applications', '.Trash', '.npm', '.yarn', '.pnpm-store',
]);

// File extensions to index
const CODE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.jsonc',
  '.py', '.pyw', '.pyi', '.ipynb',
  '.rs', '.go', '.rb', '.php', '.java', '.kt', '.scala', '.clj',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.cs', '.swift', '.m', '.mm',
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
  '.md', '.mdx', '.txt', '.rst', '.adoc',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql', '.prisma',
  '.xml', '.svg', '.wasm',
  '.dockerfile', '.containerfile', '.tf', '.hcl',
]);

const DESKTOP_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'desktop');

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Serve static file from desktop directory
function serveStatic(req, res, filePath) {
  const fullPath = path.join(DESKTOP_DIR, filePath);
  
  // Security: prevent directory traversal
  if (!fullPath.startsWith(DESKTOP_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    // Inject auth token into HTML pages so the frontend can authenticate
    let output = data;
    if (ext === '.html' && AUTH_ENABLED) {
      const html = data.toString('utf-8');
      output = html.replace(
        '<script>',
        `<script>window.__ARIA_AUTH_TOKEN__='${AUTH_TOKEN}';`
      );
    }
    
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(output);
  });
}

// Create a single agent instance
const agent = new AriaAgent({
  workingDirectory: process.cwd(),
});

// Track files Aria has modified (for UI highlighting)
const ariaModifiedFiles = new Set();

// Conversation persistence
const conversationStore = new ConversationStore();
conversationStore.initialize().then(() => {
  console.log(`💬 Conversation store loaded (${conversationStore.conversations.size} conversations)`);
}).catch(e => {
  console.error('Failed to init conversation store:', e);
});

// CORS headers
const ALLOWED_ORIGINS = (process.env.ARIA_CORS_ORIGINS || 'http://localhost:4173,http://localhost:3200,http://127.0.0.1:4173,http://127.0.0.1:3200').split(',');

function getCorsHeaders(req) {
  const origin = req.headers['origin'] || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

// Backward-compatible: endpoints that used `corsHeaders` now call getCorsHeaders(req)

// ============================================================================
// File System Utilities
// ============================================================================

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

function isCodeFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return CODE_EXTENSIONS.has(ext) || filename === 'Dockerfile' || filename === 'Makefile';
}

function getFileStats(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
    };
  } catch {
    return null;
  }
}

// Recursively walk directory tree
function walkDir(dir, options = {}) {
  const { maxDepth = 10, currentDepth = 0, maxFiles = 5000 } = options;
  const results = [];
  
  if (currentDepth > maxDepth || results.length >= maxFiles) {
    return results;
  }
  
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      if (results.length >= maxFiles) break;
      
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        if (!shouldSkipDir(item.name)) {
          results.push({
            name: item.name,
            path: fullPath,
            type: 'directory',
          });
          
          // Recurse into subdirectory
          const children = walkDir(fullPath, {
            maxDepth,
            currentDepth: currentDepth + 1,
            maxFiles: maxFiles - results.length,
          });
          results.push(...children);
        }
      } else if (item.isFile()) {
        const stats = getFileStats(fullPath);
        results.push({
          name: item.name,
          path: fullPath,
          type: 'file',
          extension: path.extname(item.name),
          ...stats,
        });
      }
    }
  } catch (e) {
    // Permission denied or other error - skip this directory
  }
  
  return results;
}

// Search for files by name pattern
function searchFiles(rootDir, pattern, options = {}) {
  const { maxResults = 100, caseSensitive = false } = options;
  const results = [];
  const regex = new RegExp(pattern, caseSensitive ? '' : 'i');
  
  function search(dir, depth = 0) {
    if (depth > 10 || results.length >= maxResults) return;
    
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        if (results.length >= maxResults) break;
        
        const fullPath = path.join(dir, item.name);
        
        if (item.isDirectory()) {
          if (!shouldSkipDir(item.name)) {
            if (regex.test(item.name)) {
              results.push({ name: item.name, path: fullPath, type: 'directory' });
            }
            search(fullPath, depth + 1);
          }
        } else if (item.isFile()) {
          if (regex.test(item.name)) {
            results.push({
              name: item.name,
              path: fullPath,
              type: 'file',
              extension: path.extname(item.name),
            });
          }
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }
  
  search(rootDir);
  return results;
}

// Search file contents with grep-like functionality
async function searchContent(rootDir, query, options = {}) {
  const { maxResults = 50, caseSensitive = false, filePattern = null } = options;
  const results = [];
  
  // Try grep first (more universally available than ripgrep)
  try {
    const grepFlags = caseSensitive ? '-rn' : '-rin';
    const includeFlag = filePattern ? `--include="${filePattern}"` : '';
    const cmd = `grep ${grepFlags} ${includeFlag} -l "${query}" . 2>/dev/null | head -${maxResults}`;
    
    const { stdout } = await execAsync(cmd, { cwd: rootDir, timeout: 10000 });
    const files = stdout.trim().split('\n').filter(Boolean);
    
    for (const file of files.slice(0, maxResults)) {
      try {
        const matchCmd = `grep ${grepFlags} -m 3 "${query}" "${file}" 2>/dev/null`;
        const { stdout: matches } = await execAsync(matchCmd, { cwd: rootDir, timeout: 5000 });
        
        results.push({
          file: file.replace(/^\.\//, ''),
          matches: matches.trim().split('\n').slice(0, 3).map(line => {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
              const lineNum = parseInt(line.slice(0, colonIdx));
              return { line: lineNum, content: line.slice(colonIdx + 1).slice(0, 200) };
            }
            return { line: 0, content: line.slice(0, 200) };
          }),
        });
      } catch {
        results.push({ file: file.replace(/^\.\//, ''), matches: [] });
      }
    }
    
    if (results.length > 0) return results;
  } catch {
    // grep failed - fall back to manual search
  }
  
  // Manual search fallback
  const files = walkDir(rootDir, { maxDepth: 5, maxFiles: 500 })
    .filter(f => f.type === 'file' && isCodeFile(f.name));
  
  for (const file of files) {
    if (results.length >= maxResults) break;
    
    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      const lines = content.split('\n');
      const matches = [];
      
      const searchRegex = new RegExp(query, caseSensitive ? 'g' : 'gi');
      
      for (let i = 0; i < lines.length && matches.length < 3; i++) {
        if (searchRegex.test(lines[i])) {
          matches.push({ line: i + 1, content: lines[i].slice(0, 200) });
        }
      }
      
      if (matches.length > 0) {
        results.push({
          file: path.relative(rootDir, file.path),
          matches,
        });
      }
    } catch {
      // Skip files we can't read
    }
  }
  
  return results;
}

// Get recent files (sorted by modification time)
function getRecentFiles(rootDir, options = {}) {
  const { limit = 20, extensions = null } = options;
  
  const files = walkDir(rootDir, { maxDepth: 5, maxFiles: 1000 })
    .filter(f => {
      if (f.type !== 'file') return false;
      if (extensions && !extensions.includes(path.extname(f.name))) return false;
      return isCodeFile(f.name);
    })
    .sort((a, b) => new Date(b.modified) - new Date(a.modified))
    .slice(0, limit);
  
  return files;
}

// Get workspace summary
function getWorkspaceSummary(rootDir) {
  const files = walkDir(rootDir, { maxDepth: 6, maxFiles: 2000 });
  
  const summary = {
    root: rootDir,
    totalFiles: 0,
    totalDirectories: 0,
    byExtension: {},
    topDirectories: [],
  };
  
  const dirCounts = {};
  
  for (const item of files) {
    if (item.type === 'file') {
      summary.totalFiles++;
      const ext = item.extension || '(no extension)';
      summary.byExtension[ext] = (summary.byExtension[ext] || 0) + 1;
    } else {
      summary.totalDirectories++;
      const parent = path.dirname(item.path);
      dirCounts[parent] = (dirCounts[parent] || 0) + 1;
    }
  }
  
  // Sort extensions by count
  summary.byExtension = Object.fromEntries(
    Object.entries(summary.byExtension)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
  );
  
  return summary;
}

const server = http.createServer(async (req, res) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Serve IDE UI at root
  if (req.method === 'GET' && (req.url === '/' || req.url === '/ide' || req.url === '/ide.html')) {
    serveStatic(req, res, 'ide.html');
    return;
  }

  // Serve static files from desktop directory
  const urlPath = req.url.split('?')[0]; // Strip query string
  if (req.method === 'GET' && (urlPath.endsWith('.css') || urlPath.endsWith('.js') || 
      urlPath.endsWith('.ico') || urlPath.endsWith('.svg') || urlPath.endsWith('.png'))) {
    const filePath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
    serveStatic(req, res, filePath);
    return;
  }

  // Health check (no auth required)
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', agent: 'aria' }));
    return;
  }

  // --- All endpoints below require authentication ---
  if (!checkAuth(req, res)) return;

  // Get context stats
  if (req.method === 'GET' && req.url === '/stats') {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(agent.getContextStats()));
    return;
  }

  // Clear history
  if (req.method === 'POST' && req.url === '/clear') {
    agent.clearHistory();
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Chat endpoint (streaming)
  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { message, images } = JSON.parse(body);
        
        if (!message && (!images || images.length === 0)) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'message or images required' }));
          return;
        }

        // Set up SSE for streaming
        res.writeHead(200, {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        // Override agent callbacks for this request
        const originalOnChunk = agent.onChunk;
        const originalOnToolCall = agent.onToolCall;
        const originalOnToolResult = agent.onToolResult;
        const originalOnCompaction = agent.onCompaction;

        agent.onChunk = (chunk) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        };

        agent.onToolCall = (tool) => {
          res.write(`data: ${JSON.stringify({ type: 'tool_call', name: tool.name, arguments: tool.arguments })}\n\n`);
        };

        agent.onToolResult = (name, result) => {
          res.write(`data: ${JSON.stringify({ type: 'tool_result', name, success: result.success, preview: JSON.stringify(result).slice(0, 200) })}\n\n`);
        };

        agent.onCompaction = (stats) => {
          res.write(`data: ${JSON.stringify({ type: 'compaction', ...stats })}\n\n`);
        };

        try {
          // Pass images to the agent if present
          const response = await agent.chatStream(message, { images });
          res.write(`data: ${JSON.stringify({ type: 'done', content: response })}\n\n`);
        } catch (error) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        }

        // Restore original callbacks
        agent.onChunk = originalOnChunk;
        agent.onToolCall = originalOnToolCall;
        agent.onToolResult = originalOnToolResult;
        agent.onCompaction = originalOnCompaction;

        res.end();
      } catch (error) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Search files by name
  if (req.method === 'GET' && req.url.startsWith('/search/files')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const query = url.searchParams.get('q') || '';
    const rootDir = safeProjectPath(url.searchParams.get('root') || PROJECT_ROOT);
    if (!rootDir) { res.writeHead(403, corsHeaders); res.end(JSON.stringify({ error: 'Path outside project root' })); return; }
    const maxResults = parseInt(url.searchParams.get('limit')) || 100;
    
    try {
      const results = searchFiles(rootDir, query, { maxResults });
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ query, results, count: results.length }));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Search file contents (grep-like)
  if (req.method === 'GET' && req.url.startsWith('/search/content')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const query = url.searchParams.get('q') || '';
    const rootDir = safeProjectPath(url.searchParams.get('root') || PROJECT_ROOT);
    if (!rootDir) { res.writeHead(403, corsHeaders); res.end(JSON.stringify({ error: 'Path outside project root' })); return; }
    const maxResults = parseInt(url.searchParams.get('limit')) || 50;
    const filePattern = url.searchParams.get('pattern') || null;
    
    try {
      const results = await searchContent(rootDir, query, { maxResults, filePattern });
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ query, results, count: results.length }));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Get recent files
  if (req.method === 'GET' && req.url.startsWith('/recent')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const rootDir = safeProjectPath(url.searchParams.get('root') || PROJECT_ROOT);
    if (!rootDir) { res.writeHead(403, corsHeaders); res.end(JSON.stringify({ error: 'Path outside project root' })); return; }
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    
    try {
      const files = getRecentFiles(rootDir, { limit });
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files, count: files.length }));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Get workspace summary
  if (req.method === 'GET' && req.url.startsWith('/workspace')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const rootDir = safeProjectPath(url.searchParams.get('root') || PROJECT_ROOT);
    if (!rootDir) { res.writeHead(403, corsHeaders); res.end(JSON.stringify({ error: 'Path outside project root' })); return; }
    
    try {
      const summary = getWorkspaceSummary(rootDir);
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summary));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Walk entire directory tree
  if (req.method === 'GET' && req.url.startsWith('/tree')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const rootDir = safeProjectPath(url.searchParams.get('root') || PROJECT_ROOT);
    if (!rootDir) { res.writeHead(403, corsHeaders); res.end(JSON.stringify({ error: 'Path outside project root' })); return; }
    const maxDepth = parseInt(url.searchParams.get('depth')) || 5;
    const maxFiles = parseInt(url.searchParams.get('limit')) || 1000;
    
    try {
      const files = walkDir(rootDir, { maxDepth, maxFiles });
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ root: rootDir, files, count: files.length }));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Git status for a directory
  if (req.method === 'GET' && req.url.startsWith('/git-status')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let dirPath = url.searchParams.get('path') || PROJECT_ROOT;
    
    if (dirPath.startsWith('~')) {
      dirPath = dirPath.replace('~', HOME_DIR);
    }
    dirPath = safeBrowsePath(dirPath);
    if (!dirPath) { res.writeHead(403, corsHeaders); res.end(JSON.stringify({ error: 'Path outside home directory' })); return; }
    
    try {
      // Run git status --porcelain to get file statuses
      const { stdout } = await execAsync('git status --porcelain', { cwd: dirPath });
      const files = {};
      
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        const status = line.slice(0, 2).trim();
        const filePath = line.slice(3);
        
        // Map git status codes to simple letters
        let simpleStatus = '';
        if (status.includes('M') || status.includes('A') || status.includes('R')) {
          simpleStatus = 'M'; // Modified/Added/Renamed
        } else if (status.includes('?')) {
          simpleStatus = 'U'; // Untracked
        } else if (status.includes('D')) {
          simpleStatus = 'D'; // Deleted
        }
        
        if (simpleStatus) {
          files[filePath] = simpleStatus;
          // Also add just the filename for matching
          files[path.basename(filePath)] = simpleStatus;
        }
      }
      
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: dirPath, files }));
    } catch (e) {
      // Not a git repo or git not available
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: dirPath, files: {}, error: 'Not a git repository' }));
    }
    return;
  }

  // Get files Aria has modified
  if (req.method === 'GET' && req.url === '/aria-modified') {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ files: [...ariaModifiedFiles] }));
    return;
  }

  // Git commit (Aria can commit her changes)
  if (req.method === 'POST' && req.url === '/git-commit') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { message, files } = JSON.parse(body);
        const cwd = PROJECT_ROOT;
        
        // Stage files - either specific files or all Aria-modified files
        const filesToStage = files || [...ariaModifiedFiles];
        if (filesToStage.length === 0) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No files to commit' }));
          return;
        }
        
        // Stage each file
        for (const f of filesToStage) {
          await execAsync(`git add "${f}"`, { cwd });
        }
        
        // Commit with message
        const commitMsg = (message || `Aria: updated ${filesToStage.length} file(s)`)
          .replace(/["\\`$]/g, '')  // Strip dangerous shell characters
          .slice(0, 500);            // Limit length
        const { stdout } = await execAsync(`git commit -m "${commitMsg}"`, { cwd });
        
        // Clear tracked files that were committed
        for (const f of filesToStage) {
          ariaModifiedFiles.delete(f);
        }
        
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: commitMsg, output: stdout.trim(), filesCommitted: filesToStage.length }));
      } catch (e) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Git push (Aria can push to remote)
  if (req.method === 'POST' && req.url === '/git-push') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { remote, branch } = JSON.parse(body || '{}');
        const cwd = PROJECT_ROOT;
        
        // Get current branch if not specified
        let pushBranch = branch;
        if (!pushBranch) {
          const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });
          pushBranch = stdout.trim();
        }
        
        const pushRemote = remote || 'origin';
        const { stdout, stderr } = await execAsync(`git push ${pushRemote} ${pushBranch}`, { cwd, timeout: 30000 });
        
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, remote: pushRemote, branch: pushBranch, output: (stdout + stderr).trim() }));
      } catch (e) {
        // If no upstream, try with --set-upstream
        if (e.message.includes('no upstream') || e.stderr?.includes('--set-upstream')) {
          try {
            const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT });
            const pushBranch = branchOut.trim();
            const { stdout, stderr } = await execAsync(`git push --set-upstream origin ${pushBranch}`, { cwd: PROJECT_ROOT, timeout: 30000 });
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, remote: 'origin', branch: pushBranch, output: (stdout + stderr).trim(), setUpstream: true }));
          } catch (e2) {
            res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e2.message }));
          }
        } else {
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      }
    });
    return;
  }

  // Browse any directory (including home)
  if (req.method === 'GET' && req.url.startsWith('/browse')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let dirPath = url.searchParams.get('path') || HOME_DIR;
    
    // Expand ~ to home directory
    if (dirPath.startsWith('~')) {
      dirPath = dirPath.replace('~', HOME_DIR);
    }
    dirPath = safeBrowsePath(dirPath);
    if (!dirPath) {
      res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Path outside home directory' }));
      return;
    }
    
    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      const files = items
        .filter(item => !item.name.startsWith('.') || url.searchParams.get('hidden') === 'true')
        .map(item => ({
          name: item.name,
          path: path.join(dirPath, item.name),
          type: item.isDirectory() ? 'directory' : 'file',
          extension: item.isFile() ? path.extname(item.name) : null,
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        path: dirPath, 
        parent: path.dirname(dirPath),
        files, 
        count: files.length,
      }));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // List files in directory
  if (req.method === 'GET' && req.url.startsWith('/files')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const dirPath = safeProjectPath(url.searchParams.get('path') || PROJECT_ROOT);
    if (!dirPath) { res.writeHead(403, corsHeaders); res.end(JSON.stringify({ error: 'Path outside project root' })); return; }
    
    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      const files = items
        .filter(item => !item.name.startsWith('.') && item.name !== 'node_modules')
        .map(item => ({
          name: item.name,
          type: item.isDirectory() ? 'folder' : 'file',
          path: path.join(dirPath, item.name),
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      
      // Recursively get children for folders (1 level deep)
      for (const file of files) {
        if (file.type === 'folder') {
          try {
            const children = fs.readdirSync(file.path, { withFileTypes: true });
            file.children = children
              .filter(item => !item.name.startsWith('.') && item.name !== 'node_modules')
              .map(item => ({
                name: item.name,
                type: item.isDirectory() ? 'folder' : 'file',
                path: path.join(file.path, item.name),
              }))
              .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
              });
          } catch (e) {
            file.children = [];
          }
        }
      }
      
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Read file
  if (req.method === 'GET' && req.url.startsWith('/file')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let filePath = url.searchParams.get('path');
    
    // Resolve relative paths
    if (filePath && !path.isAbsolute(filePath)) {
      filePath = path.join(PROJECT_ROOT, filePath);
    }
    filePath = safeBrowsePath(filePath);
    if (!filePath) {
      res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Path outside home directory' }));
      return;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/plain' });
      res.end(content);
    } catch (e) {
      res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Write file (with history tracking)
  if (req.method === 'POST' && req.url === '/file') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { path: filePath, content, description } = JSON.parse(body);
        
        let fullPath = filePath;
        if (!path.isAbsolute(filePath)) {
          fullPath = path.join(PROJECT_ROOT, filePath);
        }
        fullPath = safeBrowsePath(fullPath);
        if (!fullPath) {
          res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Path outside home directory' }));
          return;
        }
        
        // Get old content for history
        let oldContent = null;
        const isNew = !fs.existsSync(fullPath);
        if (!isNew) {
          try {
            oldContent = fs.readFileSync(fullPath, 'utf-8');
          } catch {}
        }
        
        // Ensure directory exists
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write file
        fs.writeFileSync(fullPath, content, 'utf-8');
        
        // Track as Aria-modified
        ariaModifiedFiles.add(fullPath);
        
        // Record in history
        let historyEntry;
        if (isNew) {
          historyEntry = fileHistory.recordCreate(fullPath, content, description);
        } else {
          historyEntry = fileHistory.recordEdit(fullPath, oldContent, content, description);
        }
        
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, path: fullPath, history: historyEntry }));
      } catch (e) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Execute command (sandboxed)
  if (req.method === 'POST' && req.url === '/exec') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { command, cwd } = JSON.parse(body);
        
        // Security: validate command against allowlist
        if (!isExecAllowed(command)) {
          res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false,
            error: `Command blocked by security policy. Allowed prefixes: ${ALLOWED_EXEC_PREFIXES.slice(0, 10).join(', ')}...`,
          }));
          return;
        }
        
        // Security: validate working directory
        const workDir = safeProjectPath(cwd || PROJECT_ROOT);
        if (!workDir) {
          res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Working directory outside project root' }));
          return;
        }
        
        const { stdout, stderr } = await execAsync(command, { 
          cwd: workDir,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        });
        
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ stdout, stderr, success: true }));
      } catch (e) {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          stdout: e.stdout || '', 
          stderr: e.stderr || e.message,
          success: false,
          code: e.code,
        }));
      }
    });
    return;
  }

  // ============================================================================
  // History API
  // ============================================================================

  // Get file timeline/history
  if (req.method === 'GET' && req.url.startsWith('/history/file')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const filePath = url.searchParams.get('path');
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    
    try {
      const timeline = fileHistory.getTimeline(filePath, limit);
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ filePath, timeline }));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Get recent operations across all files
  if (req.method === 'GET' && req.url.startsWith('/history/recent')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    
    try {
      const operations = fileHistory.getRecentOperations(limit);
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ operations }));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Get undo/redo status
  if (req.method === 'GET' && req.url === '/history/status') {
    try {
      const status = fileHistory.getStatus();
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Undo last operation
  if (req.method === 'POST' && req.url === '/history/undo') {
    try {
      const result = fileHistory.undo();
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Redo last undone operation
  if (req.method === 'POST' && req.url === '/history/redo') {
    try {
      const result = fileHistory.redo();
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Restore file to specific point
  if (req.method === 'POST' && req.url === '/history/restore') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filePath, entryId } = JSON.parse(body);
        const result = fileHistory.restoreToPoint(filePath, entryId);
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ============================================================================
  // Conversations API
  // ============================================================================

  // List all conversations
  if (req.method === 'GET' && req.url === '/conversations') {
    try {
      const conversations = await conversationStore.getAllConversations();
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversations }));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Get a specific conversation
  if (req.method === 'GET' && req.url.startsWith('/conversations/') && !req.url.includes('/rename')) {
    const id = req.url.split('/conversations/')[1].split('?')[0];
    try {
      const messages = await conversationStore.getConversation(id);
      const conv = conversationStore.conversations.get(id);
      if (!messages) {
        res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation not found' }));
        return;
      }
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, title: conv?.title, messages }));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Create a new conversation
  if (req.method === 'POST' && req.url === '/conversations') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { title } = JSON.parse(body || '{}');
        const id = conversationStore.generateId();
        const conv = await conversationStore.saveConversation(id, [], title || 'New Conversation');
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: conv.id, title: conv.title }));
      } catch (e) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Save a message to a conversation
  if (req.method === 'POST' && req.url.match(/^\/conversations\/[^/]+\/messages$/)) {
    const id = req.url.split('/conversations/')[1].split('/messages')[0];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { role, content } = JSON.parse(body);
        const messages = await conversationStore.addMessage(id, { role, content });
        const conv = conversationStore.conversations.get(id);
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id, title: conv?.title, messageCount: messages.length }));
      } catch (e) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Rename a conversation
  if (req.method === 'POST' && req.url.match(/^\/conversations\/[^/]+\/rename$/)) {
    const id = req.url.split('/conversations/')[1].split('/rename')[0];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { title } = JSON.parse(body);
        const conv = await conversationStore.renameConversation(id, title);
        if (!conv) {
          res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Conversation not found' }));
          return;
        }
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: conv.id, title: conv.title }));
      } catch (e) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Delete a conversation
  if (req.method === 'DELETE' && req.url.startsWith('/conversations/')) {
    const id = req.url.split('/conversations/')[1].split('?')[0];
    try {
      const success = await conversationStore.deleteConversation(id);
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
    } catch (e) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start Braille WebSocket server (non-fatal if port in use)
const brailleWS = new BrailleWebSocketServer({ port: WS_PORT });
try {
  brailleWS.start();
} catch (e) {
  console.warn(`⚠️  BrailleWS failed to start: ${e.message} (non-fatal)`);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`⚠️  Port ${PORT} in use, killing stale process and retrying...`);
    try {
      const { execSync } = require('child_process');
      execSync(`lsof -ti :${PORT} 2>/dev/null | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
    } catch {}
    setTimeout(() => {
      server.listen(PORT, '0.0.0.0');
    }, 1000);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Aria IDE running at http://localhost:${PORT}`);
  console.log(`⠃⠗ Braille WebSocket at ws://localhost:${WS_PORT}`);
  if (AUTH_ENABLED) {
    console.log(`\n🔒 Auth token: ${AUTH_TOKEN}`);
    console.log(`   Set ARIA_AUTH_TOKEN in .env to use a fixed token.`);
    console.log(`   Set ARIA_AUTH=disabled to disable auth (dev only).`);
  } else {
    console.log(`\n⚠️  Auth DISABLED (ARIA_AUTH=disabled). Do not use in production.`);
  }
  console.log(`\n🖥️  UI:`);
  console.log(`   GET  /               - Aria IDE (full interface)`);
  console.log(`   GET  /ide            - Aria IDE (alias)`);
  console.log(`\n📁 File System:`);
  console.log(`   GET  /files          - List files in directory`);
  console.log(`   GET  /file           - Read file content`);
  console.log(`   POST /file           - Write file content`);
  console.log(`   GET  /browse         - Browse any directory (including ~)`);
  console.log(`   GET  /tree           - Walk entire directory tree`);
  console.log(`   GET  /recent         - Get recently modified files`);
  console.log(`   GET  /workspace      - Get workspace summary`);
  console.log(`\n🔍 Search:`);
  console.log(`   GET  /search/files   - Search files by name`);
  console.log(`   GET  /search/content - Search file contents (grep)`);
  console.log(`\n💬 Chat:`);
  console.log(`   POST /chat           - Send a message (streaming SSE)`);
  console.log(`   GET  /stats          - Get context statistics`);
  console.log(`   POST /clear          - Clear conversation history`);
  console.log(`\n⚡ Commands:`);
  console.log(`   POST /exec           - Execute shell command`);
  console.log(`   GET  /health         - Health check`);
  console.log(`\n📜 History:`);
  console.log(`   GET  /history/file   - Get file timeline`);
  console.log(`   GET  /history/recent - Get recent operations`);
  console.log(`   GET  /history/status - Get undo/redo status`);
  console.log(`   POST /history/undo   - Undo last operation`);
  console.log(`   POST /history/redo   - Redo last undone operation`);
  console.log(`   POST /history/restore - Restore file to point`);
  console.log(`\n⠃⠗ Braille WebSocket:`);
  console.log(`   ws://localhost:${WS_PORT} - Real-time braille braiding`);
  console.log(`   Messages: chat, swarm, encode, decode, feedback`);
});
