/**
 * Aria IDE - Main JavaScript
 * 
 * Full IDE with:
 * - File tree explorer
 * - Monaco code editor
 * - Integrated terminal
 * - Chat with Aria
 * - Diff view for AI changes
 */

// ============================================================================
// Configuration
// ============================================================================

const ARIA_SERVER = 'http://localhost:3200';
const HOME_DIR = '/Users/ryanbarrett';
let currentBrowsePath = HOME_DIR; // Start at home, not just project

// ============================================================================
// State
// ============================================================================

let editor = null;
let diffEditor = null;
let currentFile = null;
let openFiles = new Map(); // path -> { content, modified }
let pendingChanges = []; // AI-proposed changes
let currentDiffIndex = null;

// ============================================================================
// Monaco Editor Setup
// ============================================================================

require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });

require(['vs/editor/editor.main'], function () {
  // Set dark theme
  monaco.editor.defineTheme('aria-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#e6edf3',
      'editorLineNumber.foreground': '#6e7681',
      'editorCursor.foreground': '#58a6ff',
      'editor.selectionBackground': '#264f78',
    },
  });
  monaco.editor.setTheme('aria-dark');

  editor = monaco.editor.create(document.getElementById('monacoEditor'), {
    value: '',
    language: 'javascript',
    theme: 'aria-dark',
    fontSize: 13,
    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on',
  });

  // Track cursor position
  editor.onDidChangeCursorPosition((e) => {
    document.getElementById('cursorPosition').textContent = 
      `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });

  // Track content changes
  editor.onDidChangeModelContent(() => {
    if (currentFile) {
      const fileState = openFiles.get(currentFile);
      if (fileState) {
        fileState.modified = true;
        updateTabState(currentFile, true);
      }
    }
  });

  // Keyboard shortcuts
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCurrentFile);
});

// ============================================================================
// File Tree
// ============================================================================

async function loadFileTree(browsePath = null) {
  const fileTree = document.getElementById('fileTree');
  fileTree.innerHTML = '<div class="loading">Loading files...</div>';
  
  if (browsePath) {
    currentBrowsePath = browsePath;
  }
  
  // Update path display
  updatePathDisplay();

  try {
    const response = await fetch(`${ARIA_SERVER}/browse?path=${encodeURIComponent(currentBrowsePath)}`);
    if (!response.ok) throw new Error('Failed to load files');
    
    const data = await response.json();
    fileTree.innerHTML = '';
    
    // Add parent directory link if not at root
    if (data.parent && data.path !== '/') {
      const parentDiv = document.createElement('div');
      parentDiv.className = 'tree-item directory parent-dir';
      parentDiv.innerHTML = '<span class="icon">⬆️</span><span class="name">..</span>';
      parentDiv.addEventListener('click', () => loadFileTree(data.parent));
      fileTree.appendChild(parentDiv);
    }
    
    // Render files from browse response
    renderBrowseResults(data.files, fileTree);
  } catch (e) {
    fileTree.innerHTML = `<div class="error">Error loading files: ${e.message}</div>`;
  }
}

function updatePathDisplay() {
  const pathEl = document.getElementById('currentPath');
  if (pathEl) {
    // Show shortened path
    let displayPath = currentBrowsePath;
    if (displayPath.startsWith(HOME_DIR)) {
      displayPath = '~' + displayPath.slice(HOME_DIR.length);
    }
    pathEl.textContent = displayPath;
    pathEl.title = currentBrowsePath;
  }
}

function renderBrowseResults(files, container) {
  files.forEach(item => {
    const div = document.createElement('div');
    div.className = `tree-item ${item.type}`;
    div.dataset.path = item.path;
    
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = item.type === 'directory' ? '📁' : getFileIcon(item.name);
    
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.name;
    
    div.appendChild(icon);
    div.appendChild(name);
    container.appendChild(div);
    
    if (item.type === 'directory') {
      div.addEventListener('click', () => {
        loadFileTree(item.path);
      });
    } else {
      div.addEventListener('click', () => {
        openFile(item.path);
      });
    }
  });
}

function navigateToPath(path) {
  loadFileTree(path);
}

function goHome() {
  loadFileTree(HOME_DIR);
}

function goToProject(projectPath) {
  loadFileTree(projectPath);
}

function getFilePath(element) {
  // Use data-path attribute if available
  if (element.dataset && element.dataset.path) {
    return element.dataset.path;
  }
  
  const parts = [];
  let current = element;
  
  while (current && current.classList) {
    if (current.classList.contains('tree-item')) {
      const name = current.querySelector('.name')?.textContent;
      if (name) parts.unshift(name);
    }
    current = current.parentElement;
  }
  
  return parts.join('/');
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    js: '📜', mjs: '📜', ts: '📘', tsx: '⚛️', jsx: '⚛️',
    json: '📋', html: '🌐', css: '🎨', md: '📝',
    py: '🐍', rs: '🦀', go: '🔵', rb: '💎',
    sh: '⚡', yml: '⚙️', yaml: '⚙️', toml: '⚙️',
    svg: '🖼️', png: '🖼️', jpg: '🖼️',
  };
  return icons[ext] || '📄';
}

// ============================================================================
// File Operations
// ============================================================================

async function openFile(path) {
  if (!path) return;
  
  // Show editor, hide welcome
  document.getElementById('editorWelcome').style.display = 'none';
  document.getElementById('monacoEditor').style.display = 'block';
  
  // Check if already open
  if (openFiles.has(path)) {
    switchToFile(path);
    return;
  }
  
  // Load file content
  try {
    const response = await fetch(`${ARIA_SERVER}/file?path=${encodeURIComponent(path)}`);
    let content;
    
    if (response.ok) {
      content = await response.text();
    } else {
      // Fallback: try to read from local mock
      content = `// File: ${path}\n// (Content would be loaded from server)\n`;
    }
    
    openFiles.set(path, { content, modified: false });
    addTab(path);
    switchToFile(path);
    
  } catch (e) {
    console.error('Failed to open file:', e);
    setStatus(`Failed to open ${path}`, 'error');
  }
}

function switchToFile(path) {
  currentFile = path;
  const fileState = openFiles.get(path);
  
  if (editor && fileState) {
    const language = getLanguage(path);
    const model = monaco.editor.createModel(fileState.content, language);
    editor.setModel(model);
    
    document.getElementById('fileLanguage').textContent = language;
    updateTabsUI();
  }
}

function getLanguage(path) {
  const ext = path.split('.').pop().toLowerCase();
  const languages = {
    js: 'javascript', mjs: 'javascript', ts: 'typescript',
    tsx: 'typescript', jsx: 'javascript', json: 'json',
    html: 'html', css: 'css', md: 'markdown',
    py: 'python', rs: 'rust', go: 'go', rb: 'ruby',
    sh: 'shell', yml: 'yaml', yaml: 'yaml', toml: 'toml',
  };
  return languages[ext] || 'plaintext';
}

async function saveCurrentFile() {
  if (!currentFile) return;
  
  const content = editor.getValue();
  
  try {
    const response = await fetch(`${ARIA_SERVER}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFile, content }),
    });
    
    if (response.ok) {
      openFiles.get(currentFile).content = content;
      openFiles.get(currentFile).modified = false;
      updateTabState(currentFile, false);
      setStatus(`Saved ${currentFile}`, 'success');
    } else {
      throw new Error('Save failed');
    }
  } catch (e) {
    setStatus(`Failed to save ${currentFile}`, 'error');
  }
}

// ============================================================================
// Tabs
// ============================================================================

function addTab(path) {
  const tabs = document.getElementById('editorTabs');
  const filename = path.split('/').pop();
  
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.path = path;
  tab.innerHTML = `
    <span class="tab-name">${filename}</span>
    <span class="close-tab" onclick="closeTab('${path}', event)">×</span>
  `;
  tab.addEventListener('click', () => switchToFile(path));
  tabs.appendChild(tab);
}

function closeTab(path, event) {
  event?.stopPropagation();
  
  openFiles.delete(path);
  const tab = document.querySelector(`.tab[data-path="${path}"]`);
  tab?.remove();
  
  if (currentFile === path) {
    const remaining = Array.from(openFiles.keys());
    if (remaining.length > 0) {
      switchToFile(remaining[remaining.length - 1]);
    } else {
      currentFile = null;
      document.getElementById('editorWelcome').style.display = 'flex';
      document.getElementById('monacoEditor').style.display = 'none';
    }
  }
}

function updateTabsUI() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.path === currentFile);
  });
}

function updateTabState(path, modified) {
  const tab = document.querySelector(`.tab[data-path="${path}"]`);
  if (tab) {
    const name = tab.querySelector('.tab-name');
    const filename = path.split('/').pop();
    name.textContent = modified ? `● ${filename}` : filename;
  }
}

// ============================================================================
// Terminal
// ============================================================================

const terminalHistory = [];
let historyIndex = -1;

document.getElementById('terminalInput')?.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const input = e.target;
    const command = input.value.trim();
    
    if (command) {
      terminalHistory.push(command);
      historyIndex = terminalHistory.length;
      
      appendTerminalOutput(`$ ${command}`, 'command');
      input.value = '';
      
      await executeCommand(command);
    }
  } else if (e.key === 'ArrowUp') {
    if (historyIndex > 0) {
      historyIndex--;
      e.target.value = terminalHistory[historyIndex];
    }
  } else if (e.key === 'ArrowDown') {
    if (historyIndex < terminalHistory.length - 1) {
      historyIndex++;
      e.target.value = terminalHistory[historyIndex];
    } else {
      historyIndex = terminalHistory.length;
      e.target.value = '';
    }
  }
});

async function executeCommand(command) {
  try {
    const response = await fetch(`${ARIA_SERVER}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    
    const result = await response.json();
    
    if (result.stdout) {
      appendTerminalOutput(result.stdout, 'stdout');
    }
    if (result.stderr) {
      appendTerminalOutput(result.stderr, 'stderr');
    }
  } catch (e) {
    appendTerminalOutput(`Error: ${e.message}`, 'stderr');
  }
}

function appendTerminalOutput(text, type = 'stdout') {
  const output = document.getElementById('terminalOutput');
  const line = document.createElement('div');
  line.className = type;
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

document.getElementById('clearTerminal')?.addEventListener('click', () => {
  document.getElementById('terminalOutput').innerHTML = '';
});

document.getElementById('toggleTerminal')?.addEventListener('click', () => {
  const container = document.getElementById('terminalContainer');
  container.classList.toggle('collapsed');
  const btn = document.getElementById('toggleTerminal');
  btn.textContent = container.classList.contains('collapsed') ? '▲' : '▼';
});

// ============================================================================
// Chat with Aria
// ============================================================================

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;
  
  input.value = '';
  appendChatMessage('user', message);
  
  try {
    const response = await fetch(`${ARIA_SERVER}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message,
        context: {
          currentFile,
          fileContent: currentFile ? editor?.getValue() : null,
        },
      }),
    });
    
    if (!response.ok) throw new Error('Chat failed');
    
    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMessage = '';
    let messageEl = null;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'content') {
              assistantMessage += data.content;
              if (!messageEl) {
                messageEl = appendChatMessage('assistant', assistantMessage);
              } else {
                messageEl.textContent = assistantMessage;
              }
            } else if (data.type === 'tool_call') {
              appendChatMessage('tool', `🔧 ${data.name}: ${JSON.stringify(data.args).slice(0, 100)}...`);
              
              // Handle file edits
              if (data.name === 'write_file' || data.name === 'edit_file') {
                addPendingChange(data.args);
              }
            } else if (data.type === 'tool_result') {
              appendChatMessage('tool', `✓ ${data.result?.slice?.(0, 100) || 'Done'}`);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    
  } catch (e) {
    appendChatMessage('assistant', `Error: ${e.message}. Is the Aria server running?`);
  }
}

function appendChatMessage(role, content) {
  const messages = document.getElementById('chatMessages');
  const msg = document.createElement('div');
  msg.className = `chat-message ${role}`;
  msg.textContent = content;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
  return msg;
}

document.getElementById('sendChatBtn')?.addEventListener('click', sendChatMessage);
document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

document.getElementById('clearChatBtn')?.addEventListener('click', () => {
  document.getElementById('chatMessages').innerHTML = '';
});

// ============================================================================
// Pending Changes (Diff View)
// ============================================================================

function addPendingChange(change) {
  // Get original content if it's an edit
  if (change.path && !change.originalContent) {
    const fileState = openFiles.get(change.path);
    if (fileState) {
      change.originalContent = fileState.content;
    }
  }
  
  pendingChanges.push(change);
  renderPendingChanges();
  updatePendingCount();
  
  // Switch to diff panel and show the diff
  document.querySelector('[data-panel="diff"]').click();
  showDiffView(pendingChanges.length - 1);
}

function updatePendingCount() {
  const badge = document.getElementById('pendingCount');
  if (badge) {
    badge.textContent = pendingChanges.length;
    badge.style.display = pendingChanges.length > 0 ? 'inline' : 'none';
  }
}

function renderPendingChanges() {
  const list = document.getElementById('diffList');
  
  if (pendingChanges.length === 0) {
    list.innerHTML = '<div class="no-changes">No pending changes</div>';
    hideDiffEditor();
    return;
  }
  
  list.innerHTML = pendingChanges.map((change, index) => `
    <div class="diff-item ${currentDiffIndex === index ? 'selected' : ''}" data-index="${index}" onclick="showDiffView(${index})">
      <div class="diff-item-header">
        <span class="change-type ${change.content ? 'new' : 'edit'}">${change.content ? 'NEW' : 'EDIT'}</span>
        <span class="filename">${change.path || 'unknown'}</span>
      </div>
      <div class="diff-summary">
        ${getDiffSummary(change)}
      </div>
    </div>
  `).join('');
}

function getDiffSummary(change) {
  if (change.content) {
    const lines = change.content.split('\n').length;
    return `<span class="add-count">+${lines} lines</span> (new file)`;
  }
  if (change.old_string && change.new_string) {
    const oldLines = change.old_string.split('\n').length;
    const newLines = change.new_string.split('\n').length;
    return `<span class="remove-count">-${oldLines}</span> <span class="add-count">+${newLines}</span>`;
  }
  return 'Unknown change';
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showDiffView(index) {
  currentDiffIndex = index;
  const change = pendingChanges[index];
  if (!change) return;
  
  // Update selection in list
  document.querySelectorAll('.diff-item').forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });
  
  // Show diff editor
  const diffContainer = document.getElementById('diffEditorContainer');
  const diffActions = document.getElementById('diffActions');
  diffContainer.style.display = 'block';
  diffActions.style.display = 'flex';
  
  // Update file info
  document.getElementById('diffFileName').textContent = change.path || 'New File';
  
  // Get original and modified content
  let originalContent = '';
  let modifiedContent = '';
  
  if (change.content) {
    // New file
    originalContent = '';
    modifiedContent = change.content;
  } else if (change.old_string && change.new_string) {
    // Edit - show context
    originalContent = change.originalContent || change.old_string;
    modifiedContent = originalContent.replace(change.old_string, change.new_string);
  }
  
  // Create or update diff editor
  if (!diffEditor) {
    diffEditor = monaco.editor.createDiffEditor(document.getElementById('diffEditor'), {
      theme: 'aria-dark',
      fontSize: 12,
      readOnly: true,
      renderSideBySide: true,
      automaticLayout: true,
      minimap: { enabled: false },
    });
  }
  
  const language = getLanguage(change.path || '');
  diffEditor.setModel({
    original: monaco.editor.createModel(originalContent, language),
    modified: monaco.editor.createModel(modifiedContent, language),
  });
}

function hideDiffEditor() {
  const diffContainer = document.getElementById('diffEditorContainer');
  const diffActions = document.getElementById('diffActions');
  if (diffContainer) diffContainer.style.display = 'none';
  if (diffActions) diffActions.style.display = 'none';
  currentDiffIndex = null;
}

async function applyChange(index) {
  const change = pendingChanges[index];
  if (!change) return;
  
  try {
    let content;
    if (change.content) {
      // New file
      content = change.content;
    } else if (change.old_string && change.new_string) {
      // Edit existing file
      const originalContent = change.originalContent || '';
      content = originalContent.replace(change.old_string, change.new_string);
    }
    
    const response = await fetch(`${ARIA_SERVER}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: change.path, content }),
    });
    
    if (response.ok) {
      pendingChanges.splice(index, 1);
      renderPendingChanges();
      updatePendingCount();
      setStatus(`✓ Applied change to ${change.path}`, 'success');
      
      // Reload file if it's open
      if (openFiles.has(change.path)) {
        openFiles.delete(change.path);
        openFile(change.path);
      }
      
      // Refresh file tree
      loadFileTree();
      
      // Show next diff or hide
      if (pendingChanges.length > 0) {
        showDiffView(Math.min(index, pendingChanges.length - 1));
      } else {
        hideDiffEditor();
      }
    }
  } catch (e) {
    setStatus(`Failed to apply change: ${e.message}`, 'error');
  }
}

function rejectChange(index) {
  pendingChanges.splice(index, 1);
  renderPendingChanges();
  updatePendingCount();
  
  if (pendingChanges.length > 0) {
    showDiffView(Math.min(index, pendingChanges.length - 1));
  } else {
    hideDiffEditor();
  }
}

function applyCurrentChange() {
  if (currentDiffIndex !== null) {
    applyChange(currentDiffIndex);
  }
}

function rejectCurrentChange() {
  if (currentDiffIndex !== null) {
    rejectChange(currentDiffIndex);
  }
}

async function applyAllChanges() {
  for (let i = pendingChanges.length - 1; i >= 0; i--) {
    await applyChange(0); // Always apply first since array shifts
  }
}

async function rejectAllChanges() {
  pendingChanges = [];
  renderPendingChanges();
  updatePendingCount();
  hideDiffEditor();
}

document.getElementById('applyAllChanges')?.addEventListener('click', applyAllChanges);

// ============================================================================
// Sidebar Tabs
// ============================================================================

document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const panel = tab.dataset.panel;
    const sidebar = tab.closest('.sidebar');
    
    sidebar.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    sidebar.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(`${panel}Panel`).classList.add('active');
  });
});

// ============================================================================
// Resize Handles
// ============================================================================

let isResizing = false;
let resizeTarget = null;
let startX = 0;
let startY = 0;
let startSize = 0;

document.querySelectorAll('.resize-handle').forEach(handle => {
  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeTarget = handle.dataset.resize;
    startX = e.clientX;
    startY = e.clientY;
    
    if (resizeTarget === 'left') {
      startSize = document.getElementById('leftSidebar').offsetWidth;
    } else if (resizeTarget === 'right') {
      startSize = document.getElementById('rightSidebar').offsetWidth;
    } else if (resizeTarget === 'terminal') {
      startSize = document.getElementById('terminalContainer').offsetHeight;
    }
    
    document.body.style.cursor = handle.classList.contains('vertical') ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  
  if (resizeTarget === 'left') {
    const newWidth = Math.max(200, Math.min(500, startSize + (e.clientX - startX)));
    document.getElementById('leftSidebar').style.width = `${newWidth}px`;
  } else if (resizeTarget === 'right') {
    const newWidth = Math.max(200, Math.min(500, startSize - (e.clientX - startX)));
    document.getElementById('rightSidebar').style.width = `${newWidth}px`;
  } else if (resizeTarget === 'terminal') {
    const newHeight = Math.max(100, Math.min(400, startSize - (e.clientY - startY)));
    document.getElementById('terminalContainer').style.height = `${newHeight}px`;
  }
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    resizeTarget = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

// ============================================================================
// Status & Connection
// ============================================================================

function setStatus(message, type = 'info') {
  const el = document.getElementById('statusMessage');
  el.textContent = message;
  el.style.color = type === 'error' ? '#f85149' : type === 'success' ? '#3fb950' : '#8b949e';
  
  setTimeout(() => {
    el.textContent = '';
  }, 3000);
}

async function checkConnection() {
  const dot = document.getElementById('connectionStatus');
  const status = document.getElementById('ariaStatus');
  
  try {
    const response = await fetch(`${ARIA_SERVER}/health`);
    if (response.ok) {
      dot.classList.add('online');
      dot.classList.remove('offline');
      status.textContent = 'Aria: Connected';
    } else {
      throw new Error('Not OK');
    }
  } catch (e) {
    dot.classList.remove('online');
    dot.classList.add('offline');
    status.textContent = 'Aria: Offline';
  }
}

// ============================================================================
// Initialize
// ============================================================================

window.openFile = openFile;
window.closeTab = closeTab;
window.applyChange = applyChange;
window.rejectChange = rejectChange;
window.showDiffView = showDiffView;
window.applyCurrentChange = applyCurrentChange;
window.rejectCurrentChange = rejectCurrentChange;
window.applyAllChanges = applyAllChanges;
window.rejectAllChanges = rejectAllChanges;
window.goHome = goHome;
window.goToProject = goToProject;
window.loadFileTree = loadFileTree;

// Initial setup
loadFileTree();
checkConnection();
setInterval(checkConnection, 10000);

// Welcome message
appendChatMessage('assistant', "Hi! I'm Aria. I can help you write and edit code. Try asking me to create a new feature or fix a bug!");

// Test function to demo the diff view
window.testDiffView = function() {
  addPendingChange({
    path: 'test/hello.js',
    content: `// Hello World Test File
function greet(name) {
  return \`Hello, \${name}!\`;
}

module.exports = { greet };
`
  });
};
