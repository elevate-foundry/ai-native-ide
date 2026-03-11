const runButton = document.getElementById('runLoop');
const goalInput = document.getElementById('goal');
const loopOutput = document.getElementById('loopOutput');
const domState = document.getElementById('domState');
const consoleState = document.getElementById('consoleState');
const networkState = document.getElementById('networkState');

// Chat elements
const chatHistory = document.getElementById('chatHistory');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChat');
const clearChatBtn = document.getElementById('clearChat');
const chatStats = document.getElementById('chatStats');

// Layout elements
const layout = document.getElementById('layout');
const leftPanel = document.getElementById('leftPanel');
const rightPanel = document.getElementById('rightPanel');

// Settings elements
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');

// ============================================================================
// Settings & Persistence
// ============================================================================

const DEFAULT_SETTINGS = {
  leftPanelWidth: 320,
  rightPanelWidth: 360,
  model: 'anthropic/claude-3.5-sonnet',
  maxTokens: 4096,
  temperature: 0.7,
  ariaServer: 'http://localhost:3200',
  collapsedSections: [],
};

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const saved = localStorage.getItem('aria-settings');
    if (saved) {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  applySettings();
}

function saveSettings() {
  try {
    localStorage.setItem('aria-settings', JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

function applySettings() {
  document.documentElement.style.setProperty('--left-panel-width', settings.leftPanelWidth + 'px');
  document.documentElement.style.setProperty('--right-panel-width', settings.rightPanelWidth + 'px');
  
  // Update settings panel inputs
  const leftWidth = document.getElementById('leftWidth');
  const rightWidth = document.getElementById('rightWidth');
  const modelSelect = document.getElementById('modelSelect');
  const maxTokens = document.getElementById('maxTokens');
  const temperature = document.getElementById('temperature');
  const ariaServer = document.getElementById('ariaServer');
  
  if (leftWidth) {
    leftWidth.value = settings.leftPanelWidth;
    document.getElementById('leftWidthVal').textContent = settings.leftPanelWidth;
  }
  if (rightWidth) {
    rightWidth.value = settings.rightPanelWidth;
    document.getElementById('rightWidthVal').textContent = settings.rightPanelWidth;
  }
  if (modelSelect) modelSelect.value = settings.model;
  if (maxTokens) maxTokens.value = settings.maxTokens;
  if (temperature) {
    temperature.value = settings.temperature * 100;
    document.getElementById('tempVal').textContent = settings.temperature.toFixed(1);
  }
  if (ariaServer) ariaServer.value = settings.ariaServer;
  
  // Apply collapsed sections
  settings.collapsedSections.forEach(id => {
    const section = document.getElementById(id);
    const icon = document.getElementById(id + '-icon');
    if (section) section.classList.add('collapsed');
    if (icon) icon.classList.add('collapsed');
  });
}

function getAriaServer() {
  return settings.ariaServer || DEFAULT_SETTINGS.ariaServer;
}

// Settings panel toggle
settingsToggle?.addEventListener('click', () => {
  settingsPanel?.classList.toggle('open');
});

// Close settings when clicking outside
document.addEventListener('click', (e) => {
  if (settingsPanel?.classList.contains('open') && 
      !settingsPanel.contains(e.target) && 
      e.target !== settingsToggle) {
    settingsPanel.classList.remove('open');
  }
});

// Settings input handlers
document.getElementById('leftWidth')?.addEventListener('input', (e) => {
  settings.leftPanelWidth = parseInt(e.target.value);
  document.getElementById('leftWidthVal').textContent = settings.leftPanelWidth;
  document.documentElement.style.setProperty('--left-panel-width', settings.leftPanelWidth + 'px');
});

document.getElementById('rightWidth')?.addEventListener('input', (e) => {
  settings.rightPanelWidth = parseInt(e.target.value);
  document.getElementById('rightWidthVal').textContent = settings.rightPanelWidth;
  document.documentElement.style.setProperty('--right-panel-width', settings.rightPanelWidth + 'px');
});

document.getElementById('temperature')?.addEventListener('input', (e) => {
  settings.temperature = parseInt(e.target.value) / 100;
  document.getElementById('tempVal').textContent = settings.temperature.toFixed(1);
});

document.getElementById('saveSettings')?.addEventListener('click', () => {
  settings.model = document.getElementById('modelSelect')?.value || settings.model;
  settings.maxTokens = parseInt(document.getElementById('maxTokens')?.value) || settings.maxTokens;
  settings.ariaServer = document.getElementById('ariaServer')?.value || settings.ariaServer;
  saveSettings();
  settingsPanel?.classList.remove('open');
});

document.getElementById('resetSettings')?.addEventListener('click', () => {
  settings = { ...DEFAULT_SETTINGS };
  applySettings();
  saveSettings();
});

// ============================================================================
// Collapsible Sections
// ============================================================================

window.toggleSection = function(sectionId) {
  const section = document.getElementById(sectionId);
  const icon = document.getElementById(sectionId + '-icon');
  
  if (section) {
    section.classList.toggle('collapsed');
    icon?.classList.toggle('collapsed');
    
    // Update settings
    const idx = settings.collapsedSections.indexOf(sectionId);
    if (section.classList.contains('collapsed')) {
      if (idx === -1) settings.collapsedSections.push(sectionId);
    } else {
      if (idx !== -1) settings.collapsedSections.splice(idx, 1);
    }
    saveSettings();
  }
};

// ============================================================================
// Resizable Panels (drag handles)
// ============================================================================

let isResizing = false;
let currentHandle = null;
let startX = 0;
let startWidth = 0;

document.querySelectorAll('.resize-handle').forEach(handle => {
  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    currentHandle = handle;
    startX = e.clientX;
    
    const panel = handle.dataset.panel;
    if (panel === 'left') {
      startWidth = settings.leftPanelWidth;
    } else if (panel === 'right') {
      startWidth = settings.rightPanelWidth;
    }
    
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing || !currentHandle) return;
  
  const panel = currentHandle.dataset.panel;
  const delta = e.clientX - startX;
  
  if (panel === 'left') {
    const newWidth = Math.max(200, Math.min(500, startWidth + delta));
    settings.leftPanelWidth = newWidth;
    document.documentElement.style.setProperty('--left-panel-width', newWidth + 'px');
    document.getElementById('leftWidth').value = newWidth;
    document.getElementById('leftWidthVal').textContent = newWidth;
  } else if (panel === 'right') {
    const newWidth = Math.max(200, Math.min(500, startWidth - delta));
    settings.rightPanelWidth = newWidth;
    document.documentElement.style.setProperty('--right-panel-width', newWidth + 'px');
    document.getElementById('rightWidth').value = newWidth;
    document.getElementById('rightWidthVal').textContent = newWidth;
  }
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    currentHandle?.classList.remove('active');
    currentHandle = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveSettings();
  }
});

// Load settings on startup
loadSettings();

// ============================================================================
// System Info Detection
// ============================================================================
function getSystemInfo() {
  const ua = navigator.userAgent;
  const platform = navigator.platform || 'Unknown';
  const language = navigator.language || 'en';
  const cores = navigator.hardwareConcurrency || 'Unknown';
  const memory = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Unknown';
  const screenRes = `${screen.width}x${screen.height}`;
  const colorDepth = `${screen.colorDepth}-bit`;
  const online = navigator.onLine ? 'Online' : 'Offline';
  const cookiesEnabled = navigator.cookieEnabled ? 'Yes' : 'No';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  
  // Detect OS
  let os = 'Unknown OS';
  if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    const version = match ? match[1].replace(/_/g, '.') : '';
    os = `macOS ${version}`;
  } else if (ua.includes('Windows NT 10')) {
    os = 'Windows 10/11';
  } else if (ua.includes('Windows')) {
    os = 'Windows';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  } else if (ua.includes('Android')) {
    os = 'Android';
  } else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS';
  }
  
  // Detect browser
  let browser = 'Unknown Browser';
  if (ua.includes('Tauri')) {
    browser = 'Tauri WebView';
  } else if (ua.includes('Chrome') && !ua.includes('Edg')) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    browser = `Chrome ${match ? match[1] : ''}`;
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/([\d.]+)/);
    browser = `Safari ${match ? match[1] : ''}`;
  } else if (ua.includes('Firefox')) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    browser = `Firefox ${match ? match[1] : ''}`;
  } else if (ua.includes('Edg')) {
    const match = ua.match(/Edg\/([\d.]+)/);
    browser = `Edge ${match ? match[1] : ''}`;
  }
  
  // Detect architecture
  let arch = 'Unknown';
  if (ua.includes('arm64') || ua.includes('aarch64')) {
    arch = 'ARM64 (Apple Silicon)';
  } else if (ua.includes('x86_64') || ua.includes('x64') || ua.includes('Win64') || ua.includes('WOW64')) {
    arch = 'x86_64';
  } else if (ua.includes('i686') || ua.includes('i386')) {
    arch = 'x86 (32-bit)';
  } else if (platform.includes('Mac')) {
    arch = 'Apple Silicon / Intel';
  }
  
  return {
    os,
    browser,
    arch,
    platform,
    cores,
    memory,
    screenRes,
    colorDepth,
    language,
    timezone,
    online,
    cookiesEnabled,
    timestamp: now.toLocaleString(),
  };
}

function generateAriaIntro() {
  const sys = getSystemInfo();
  
  return `👋 Hello! I'm **Aria** — your AI Runtime Interactive Agent.

I'm a runtime-aware coding assistant that can observe, execute, and repair code in real-time. I also use **BBID** (Braille-encoded Behavioral Biometrics) to understand your unique interaction patterns.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖥️  **Your System**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• **OS:**           ${sys.os}
• **Architecture:** ${sys.arch}
• **Browser:**      ${sys.browser}
• **CPU Cores:**    ${sys.cores}
• **Memory:**       ${sys.memory}
• **Display:**      ${sys.screenRes} @ ${sys.colorDepth}
• **Timezone:**     ${sys.timezone}
• **Language:**     ${sys.language}
• **Network:**      ${sys.online}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄  **What I Can Do**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Change code based on your goals
2. Run and observe the system
3. Inspect runtime state & UI via sensors
4. Repair failures automatically
5. Track behavioral biometrics (mouse, keyboard, scroll)
6. Generate braille-encoded identity fingerprints

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⠃⠃⠊⠙  **BBID Active**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your device fingerprint and behavioral patterns are being tracked in the right panel. Move your mouse, type, and scroll to see your unique biometric signature emerge.

Enter a goal on the left and click "Run Runtime Loop" to begin!

🕐 Session started: ${sys.timestamp}`;
}

// Show intro on load
loopOutput.textContent = generateAriaIntro();

// ============================================================================
// BBID Integration
// ============================================================================
let ariaBBID = null;

// Privacy consent state
const CONSENT_KEY = 'aria-bbid-consent';
const BBID_DATA_KEY = 'aria-bbid-data';

function getConsentStatus() {
  return localStorage.getItem(CONSENT_KEY);
}

function setConsentStatus(status) {
  localStorage.setItem(CONSENT_KEY, status);
  localStorage.setItem(CONSENT_KEY + '-timestamp', new Date().toISOString());
}

function showConsentBanner() {
  const banner = document.getElementById('consentBanner');
  if (banner) banner.classList.add('show');
}

function hideConsentBanner() {
  const banner = document.getElementById('consentBanner');
  if (banner) banner.classList.remove('show');
}

function disableBBIDUI() {
  const bbidSection = document.getElementById('bbidSection');
  if (bbidSection) {
    bbidSection.classList.add('bbid-disabled');
  }
  document.getElementById('visitorId').textContent = 'Disabled';
  document.getElementById('brailleId').textContent = '⠀⠀⠀⠀';
  document.getElementById('mouseMetrics').textContent = '-';
  document.getElementById('keystrokeMetrics').textContent = '-';
  document.getElementById('scrollMetrics').textContent = '-';
  document.getElementById('entropyMetrics').textContent = '-';
}

async function initBBID() {
  if (typeof AriaBBID === 'undefined') {
    console.warn('BBID not loaded');
    return;
  }
  
  ariaBBID = new AriaBBID();
  await ariaBBID.initialize();
  
  // Save fingerprint data
  localStorage.setItem(BBID_DATA_KEY, JSON.stringify(ariaBBID.getFullIdentity()));
  
  // Update UI with initial values
  document.getElementById('visitorId').textContent = ariaBBID.getVisitorId();
  document.getElementById('brailleId').textContent = ariaBBID.getBrailleId();
  
  // Remove disabled state
  const bbidSection = document.getElementById('bbidSection');
  if (bbidSection) bbidSection.classList.remove('bbid-disabled');
  
  // Update metrics every 500ms
  setInterval(updateBBIDMetrics, 500);
}

function updateBBIDMetrics() {
  if (!ariaBBID) return;
  
  const metrics = ariaBBID.getBehavioralMetrics();
  
  document.getElementById('mouseMetrics').textContent = 
    `${metrics.mouseMovements} moves\n${metrics.mouseVelocity.toFixed(2)} px/ms`;
  document.getElementById('keystrokeMetrics').textContent = metrics.keystrokeRhythm;
  document.getElementById('scrollMetrics').textContent = `${metrics.scrollVelocity} px/s`;
  document.getElementById('entropyMetrics').textContent = metrics.interactionEntropy;
  
  // Periodically save behavioral data
  if (ariaBBID && Math.random() < 0.1) {
    localStorage.setItem(BBID_DATA_KEY, JSON.stringify(ariaBBID.getFullIdentity()));
  }
}

// Consent banner handlers
document.getElementById('acceptConsent')?.addEventListener('click', () => {
  setConsentStatus('accepted');
  hideConsentBanner();
  initBBID().catch(console.error);
});

document.getElementById('declineConsent')?.addEventListener('click', () => {
  setConsentStatus('declined');
  hideConsentBanner();
  disableBBIDUI();
});

// Privacy modal handlers
document.getElementById('showPrivacyDetails')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('privacyModal')?.classList.add('show');
});

document.getElementById('closePrivacyModal')?.addEventListener('click', () => {
  document.getElementById('privacyModal')?.classList.remove('show');
});

document.getElementById('viewMyData')?.addEventListener('click', () => {
  const data = localStorage.getItem(BBID_DATA_KEY);
  if (data) {
    const parsed = JSON.parse(data);
    alert('Your BBID Data:\n\n' + JSON.stringify(parsed, null, 2).slice(0, 2000) + '...');
  } else {
    alert('No BBID data collected yet.');
  }
});

document.getElementById('deleteMyData')?.addEventListener('click', () => {
  if (confirm('Are you sure you want to delete all BBID data? This cannot be undone.')) {
    localStorage.removeItem(BBID_DATA_KEY);
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(CONSENT_KEY + '-timestamp');
    ariaBBID = null;
    disableBBIDUI();
    alert('All BBID data has been deleted.');
    showConsentBanner();
  }
});

// Close modal on outside click
document.getElementById('privacyModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'privacyModal') {
    document.getElementById('privacyModal')?.classList.remove('show');
  }
});

// Check consent on load
const consentStatus = getConsentStatus();
if (consentStatus === 'accepted') {
  initBBID().catch(console.error);
} else if (consentStatus === 'declined') {
  disableBBIDUI();
} else {
  // No consent yet - show banner
  showConsentBanner();
  disableBBIDUI();
}

async function invokeTauri(command, args = {}) {
  if (window.__TAURI__?.core?.invoke) {
    return window.__TAURI__.core.invoke(command, args);
  }

  if (command === 'run_runtime_loop') {
    return {
      status: 'completed',
      iterations: 2,
      result: { reason: 'mocked browser sensor feedback reached stable state' },
      history: [
        { iteration: 1, evaluation: { done: false, repairPlan: { next: 'retry with semantic login' } } },
        { iteration: 2, evaluation: { done: true, reason: 'stable' } },
      ],
    };
  }

  if (command === 'get_interface_sensor_snapshot') {
    // Dogfood: observe our own DOM
    return getInterfaceSensorSnapshot();
  }

  throw new Error(`Unsupported command in browser-only mode: ${command}`);
}

// ============================================================================
// Interface Sensor - Dogfooding (observe our own runtime)
// ============================================================================

const consoleLogs = [];
const networkRequests = [];

// Intercept console
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

console.log = (...args) => {
  consoleLogs.push({ type: 'log', message: args.map(String).join(' '), time: Date.now() });
  if (consoleLogs.length > 50) consoleLogs.shift();
  originalConsole.log(...args);
};

console.warn = (...args) => {
  consoleLogs.push({ type: 'warn', message: args.map(String).join(' '), time: Date.now() });
  if (consoleLogs.length > 50) consoleLogs.shift();
  originalConsole.warn(...args);
};

console.error = (...args) => {
  consoleLogs.push({ type: 'error', message: args.map(String).join(' '), time: Date.now() });
  if (consoleLogs.length > 50) consoleLogs.shift();
  originalConsole.error(...args);
};

// Intercept fetch for network monitoring
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
  const method = args[1]?.method || 'GET';
  const startTime = Date.now();
  
  try {
    const response = await originalFetch(...args);
    networkRequests.push({
      url: url.slice(0, 60),
      method,
      status: response.status,
      duration: Date.now() - startTime,
      time: Date.now(),
    });
    if (networkRequests.length > 20) networkRequests.shift();
    return response;
  } catch (e) {
    networkRequests.push({
      url: url.slice(0, 60),
      method,
      status: 'ERR',
      error: e.message,
      time: Date.now(),
    });
    if (networkRequests.length > 20) networkRequests.shift();
    throw e;
  }
};

function getDOMSnapshot() {
  const elements = [];
  
  // Get key interactive elements
  const selectors = ['button', 'input', 'textarea', 'a', 'select', '[role="button"]'];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => {
      const id = el.id ? `#${el.id}` : '';
      const classes = el.className ? `.${el.className.split(' ').slice(0, 2).join('.')}` : '';
      const text = el.textContent?.slice(0, 20) || el.value?.slice(0, 20) || '';
      elements.push(`${el.tagName.toLowerCase()}${id}${classes} "${text}"`);
    });
  }
  
  return elements.slice(0, 15).join('\n');
}

function getInterfaceSensorSnapshot() {
  return {
    dom: getDOMSnapshot(),
    consoleErrors: consoleLogs.filter(l => l.type === 'error' || l.type === 'warn').slice(-5),
    networkRequests: networkRequests.slice(-10),
  };
}

function updateInterfaceSensor() {
  const snapshot = getInterfaceSensorSnapshot();
  
  // Update DOM display
  const domEl = document.getElementById('domState');
  if (domEl) {
    domEl.textContent = snapshot.dom || '(no elements)';
  }
  
  // Update Console display
  const consoleEl = document.getElementById('consoleState');
  if (consoleEl) {
    if (snapshot.consoleErrors.length === 0) {
      consoleEl.textContent = '✓ No errors';
      consoleEl.style.color = '#4ade80';
    } else {
      consoleEl.textContent = snapshot.consoleErrors
        .map(e => `[${e.type}] ${e.message.slice(0, 40)}`)
        .join('\n');
      consoleEl.style.color = '#f87171';
    }
  }
  
  // Update Network display
  const networkEl = document.getElementById('networkState');
  if (networkEl) {
    if (snapshot.networkRequests.length === 0) {
      networkEl.textContent = '(no requests)';
    } else {
      networkEl.textContent = snapshot.networkRequests
        .map(r => `${r.method} ${r.url.slice(0, 30)} ${r.status} ${r.duration}ms`)
        .join('\n');
    }
  }
}

// Update interface sensor every second
setInterval(updateInterfaceSensor, 1000);
updateInterfaceSensor();

// OpenRouter API Key (for local development only - don't commit to public repos)
const OPENROUTER_API_KEY = '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';

// Streaming chat with OpenRouter
async function streamAriaResponse(prompt, onChunk) {
  const apiKey = OPENROUTER_API_KEY || window.OPENROUTER_API_KEY || localStorage.getItem('OPENROUTER_API_KEY');
  
  if (!apiKey) {
    throw new Error('OpenRouter API key not set. Add it to localStorage or window.OPENROUTER_API_KEY');
  }
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/elevate-foundry/ai-native-ide',
      'X-Title': 'Aria IDE',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        { 
          role: 'system', 
          content: `You are Aria (AI Runtime Interactive Agent), a runtime-aware coding assistant.
You observe, execute, and repair code in real-time with access to DOM, console, and network sensors.
Be concise and technical. Structure responses as: Observation → Analysis → Action.`
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2048,
      stream: true,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;
      
      try {
        const json = JSON.parse(trimmed.slice(6));
        const content = json.choices?.[0]?.delta?.content;
        if (content) {
          fullContent += content;
          onChunk(content, fullContent);
        }
      } catch (e) {
        // Skip malformed chunks
      }
    }
  }
  
  return fullContent;
}

// ============================================================================
// Chat with Aria (via backend server)
// ============================================================================

function appendToChat(role, content, isStreaming = false) {
  const msgDiv = document.createElement('div');
  msgDiv.style.marginBottom = '8px';
  msgDiv.style.padding = '6px 8px';
  msgDiv.style.borderRadius = '4px';
  
  if (role === 'user') {
    msgDiv.style.background = '#2d2d44';
    msgDiv.style.textAlign = 'right';
    msgDiv.innerHTML = `<strong>You:</strong> ${content}`;
  } else if (role === 'aria') {
    msgDiv.style.background = '#1e3a5f';
    msgDiv.id = isStreaming ? 'aria-streaming' : '';
    msgDiv.innerHTML = `<strong>🤖 Aria:</strong> <span class="aria-content">${content}</span>`;
  } else if (role === 'tool') {
    msgDiv.style.background = '#2d3d2d';
    msgDiv.style.fontSize = '11px';
    msgDiv.innerHTML = `<span style="color: #8f8;">🔧 ${content}</span>`;
  } else if (role === 'error') {
    msgDiv.style.background = '#5f1e1e';
    msgDiv.innerHTML = `<strong>❌ Error:</strong> ${content}`;
  }
  
  chatHistory.appendChild(msgDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return msgDiv;
}

function updateStreamingMessage(content) {
  const streaming = document.getElementById('aria-streaming');
  if (streaming) {
    streaming.querySelector('.aria-content').textContent = content;
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }
}

async function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;
  
  chatInput.value = '';
  sendChatBtn.disabled = true;
  sendChatBtn.textContent = '⏳';
  
  appendToChat('user', message);
  
  try {
    const response = await fetch(`${getAriaServer()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    // Create streaming message placeholder
    appendToChat('aria', '', true);
    let fullContent = '';
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        
        try {
          const data = JSON.parse(line.slice(6));
          
          if (data.type === 'chunk') {
            fullContent += data.content;
            updateStreamingMessage(fullContent);
          } else if (data.type === 'tool_call') {
            appendToChat('tool', `${data.name}(${JSON.stringify(data.arguments).slice(0, 50)}...)`);
          } else if (data.type === 'tool_result') {
            appendToChat('tool', `✓ ${data.name}: ${data.success ? 'success' : 'failed'}`);
          } else if (data.type === 'compaction') {
            chatStats.textContent = `📦 Compacted: ${data.reduction}% reduction`;
          } else if (data.type === 'error') {
            appendToChat('error', data.message);
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }
    
    // Remove streaming ID
    const streaming = document.getElementById('aria-streaming');
    if (streaming) streaming.id = '';
    
    // Update stats
    updateChatStats();
    
  } catch (error) {
    appendToChat('error', `${error.message}. Make sure Aria server is running: node scripts/aria-server.mjs`);
  } finally {
    sendChatBtn.disabled = false;
    sendChatBtn.textContent = 'Send';
  }
}

async function updateChatStats() {
  try {
    const response = await fetch(`${getAriaServer()}/stats`);
    if (response.ok) {
      const stats = await response.json();
      chatStats.textContent = `💬 ${stats.messageCount} msgs | ~${stats.estimatedTokens} tokens`;
    }
  } catch (e) {
    // Server not running
  }
}

async function clearChatHistory() {
  try {
    await fetch(`${getAriaServer()}/clear`, { method: 'POST' });
    chatHistory.innerHTML = '';
    chatStats.textContent = '';
    appendToChat('aria', "Hi! I'm Aria. How can I help you?");
  } catch (e) {
    chatHistory.innerHTML = '';
    appendToChat('aria', "Hi! I'm Aria. Start the server with: node scripts/aria-server.mjs");
  }
}

// Chat event listeners
sendChatBtn?.addEventListener('click', sendChatMessage);
chatInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});
clearChatBtn?.addEventListener('click', clearChatHistory);

// Initialize chat
if (chatHistory) {
  appendToChat('aria', "Hi! I'm Aria. How can I help you? (Start server: node scripts/aria-server.mjs)");
  updateChatStats();
}

// ============================================================================
// Server Status Monitoring
// ============================================================================

const MODEL_PORTS = [
  { port: 3100, name: 'Claude 3.5 Sonnet', model: 'anthropic/claude-3.5-sonnet' },
  { port: 3101, name: 'Claude 3 Opus', model: 'anthropic/claude-3-opus' },
  { port: 3102, name: 'Claude 3 Haiku', model: 'anthropic/claude-3-haiku' },
  { port: 3110, name: 'GPT-4o', model: 'openai/gpt-4o' },
  { port: 3111, name: 'GPT-4o Mini', model: 'openai/gpt-4o-mini' },
  { port: 3112, name: 'GPT-4 Turbo', model: 'openai/gpt-4-turbo' },
  { port: 3130, name: 'Llama 3.1 405B', model: 'meta-llama/llama-3.1-405b-instruct' },
  { port: 3131, name: 'Llama 3.1 70B', model: 'meta-llama/llama-3.1-70b-instruct' },
  { port: 3132, name: 'Llama 3.1 8B', model: 'meta-llama/llama-3.1-8b-instruct' },
  { port: 3140, name: 'Mistral Large', model: 'mistralai/mistral-large' },
  { port: 3141, name: 'Mixtral 8x22B', model: 'mistralai/mixtral-8x22b-instruct' },
  { port: 3160, name: 'DeepSeek Chat', model: 'deepseek/deepseek-chat' },
  { port: 3170, name: 'Qwen 2.5 72B', model: 'qwen/qwen-2.5-72b-instruct' },
  { port: 3171, name: 'Qwen 2.5 Coder', model: 'qwen/qwen-2.5-coder-32b-instruct' },
];

async function checkServerStatus() {
  const ariaStatus = document.getElementById('ariaServerStatus');
  const modelStatus = document.getElementById('modelStatus');
  
  if (!ariaStatus) return;
  
  // Check Aria backend
  try {
    const response = await fetch(`${getAriaServer()}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    if (response.ok) {
      ariaStatus.innerHTML = `<span style="color: #4ade80;">✅ Aria Backend: Online</span>`;
    } else {
      ariaStatus.innerHTML = `<span style="color: #f87171;">❌ Aria Backend: Error ${response.status}</span>`;
    }
  } catch (e) {
    ariaStatus.innerHTML = `<span style="color: #f87171;">❌ Aria Backend: Offline</span>`;
  }
  
  // Check model servers
  if (!modelStatus) return;
  
  const results = await Promise.all(
    MODEL_PORTS.map(async ({ port, name, model }) => {
      try {
        const response = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(1000)
        });
        if (response.ok) {
          return { name, port, model, status: 'online' };
        }
        return { name, port, model, status: 'error' };
      } catch {
        return { name, port, model, status: 'offline' };
      }
    })
  );
  
  const online = results.filter(r => r.status === 'online');
  const offline = results.filter(r => r.status !== 'online');
  
  let html = `<div style="margin-bottom: 6px;"><strong>${online.length}/${results.length} models available</strong></div>`;
  
  if (online.length > 0) {
    html += `<div style="color: #4ade80; margin-bottom: 4px;">`;
    online.forEach(m => {
      html += `<div style="font-size: 11px;">✅ ${m.name} <span style="color: #666;">:${m.port}</span></div>`;
    });
    html += `</div>`;
  }
  
  if (offline.length > 0 && offline.length < results.length) {
    html += `<details style="margin-top: 4px;"><summary style="cursor: pointer; color: #666; font-size: 11px;">${offline.length} unavailable</summary>`;
    html += `<div style="color: #f87171; font-size: 10px; margin-top: 4px;">`;
    offline.forEach(m => {
      html += `<div>❌ ${m.name}</div>`;
    });
    html += `</div></details>`;
  }
  
  modelStatus.innerHTML = html;
}

// Check status on load and periodically
checkServerStatus();
setInterval(checkServerStatus, 30000); // Every 30 seconds

// ============================================================================
// Runtime Loop
// ============================================================================

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  runButton.textContent = '⏳ Running...';
  
  try {
    const goal = goalInput.value.trim();
    const sys = getSystemInfo();
    
    // Check if we have an API key for streaming
    const apiKey = window.OPENROUTER_API_KEY || localStorage.getItem('OPENROUTER_API_KEY');
    
    if (apiKey) {
      // Stream response from LLM
      loopOutput.textContent = '🔄 Aria is thinking...\n\n';
      
      const prompt = `## Goal
${goal}

## System Context
- OS: ${sys.os}
- Architecture: ${sys.arch}
- Browser: ${sys.browser}
- Cores: ${sys.cores}
- Timezone: ${sys.timezone}

Analyze this goal and provide a plan to achieve it. If it's a coding task, provide the implementation.`;

      await streamAriaResponse(prompt, (chunk, full) => {
        loopOutput.textContent = '🤖 Aria:\n\n' + full;
        loopOutput.scrollTop = loopOutput.scrollHeight;
      });
      
      // Update sensors
      const sensor = await invokeTauri('get_interface_sensor_snapshot');
      domState.textContent = sensor.dom;
      consoleState.textContent = JSON.stringify(sensor.consoleErrors, null, 2);
      networkState.textContent = JSON.stringify(sensor.networkRequests, null, 2);
      
    } else {
      // Fall back to mock response
      const result = await invokeTauri('run_runtime_loop', { goal });
      const sensor = await invokeTauri('get_interface_sensor_snapshot');

      loopOutput.textContent = `✅ Runtime Loop Complete\n\n${JSON.stringify(result, null, 2)}`;
      domState.textContent = sensor.dom;
      consoleState.textContent = JSON.stringify(sensor.consoleErrors, null, 2);
      networkState.textContent = JSON.stringify(sensor.networkRequests, null, 2);
    }
  } catch (error) {
    loopOutput.textContent = `❌ Error: ${error.message}\n\n💡 To enable streaming, set your API key:\n   localStorage.setItem('OPENROUTER_API_KEY', 'your-key')`;
  } finally {
    runButton.disabled = false;
    runButton.textContent = 'Run Runtime Loop';
  }
});
