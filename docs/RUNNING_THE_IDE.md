# Running the Playwright-Native AI IDE

This runbook collects the most useful startup commands in one place.

## 1) Quick start (from cloned repo)

```bash
git clone https://github.com/elevate-foundry/ai-native-ide.git ai-native-ide
cd ai-native-ide
npm install
```

Then choose one mode:

### Desktop mode (Tauri)

```bash
npm run tauri:dev
```

### Web preview mode

```bash
npm run tauri:web
```

Open: <http://127.0.0.1:4173>

## 2) One-line installer mode (Ollama style)

```bash
curl -fsSL https://raw.githubusercontent.com/elevate-foundry/ai-native-ide/HEAD/scripts/install.sh | bash
```

Then:

```bash
ai-native-ide dev
```

## 2.1) macOS shell note

If you see this message:

```
The default interactive shell is now zsh.
```

that is expected on macOS and does not indicate an install failure.
Use the installer with `| bash` (not `| sh`) for best compatibility.


## 2.2) If curl returns 404

If you see:

```
curl: (22) The requested URL returned error: 404
```

common causes are:

- the repository is private,
- the default branch does not yet include `scripts/install.sh`,
- or the org/repo path is wrong.

Fallback install via clone:

```bash
git clone https://github.com/elevate-foundry/ai-native-ide.git ai-native-ide
cd ai-native-ide
bash scripts/install.sh
```

## 3) OS-specific commands

## macOS

### Repo mode

```bash
git clone https://github.com/elevate-foundry/ai-native-ide.git ai-native-ide
cd ai-native-ide
npm install
npm run tauri:dev
```

### Installer mode

```bash
curl -fsSL https://raw.githubusercontent.com/elevate-foundry/ai-native-ide/HEAD/scripts/install.sh | bash
ai-native-ide dev
```

## Linux

Commands are the same as macOS.

### Repo mode

```bash
git clone https://github.com/elevate-foundry/ai-native-ide.git ai-native-ide
cd ai-native-ide
npm install
npm run tauri:dev
```

### Installer mode

```bash
curl -fsSL https://raw.githubusercontent.com/elevate-foundry/ai-native-ide/HEAD/scripts/install.sh | bash
ai-native-ide dev
```

## Windows / Surface / 2-in-1

Recommended: use WSL (Ubuntu) and run the Linux commands above.

If using Git Bash directly, installer mode also works:

```bash
curl -fsSL https://raw.githubusercontent.com/elevate-foundry/ai-native-ide/HEAD/scripts/install.sh | bash
ai-native-ide dev
```

If Tauri CLI is not installed, launcher fallback starts web mode:

```bash
ai-native-ide web
```

## 4) Useful operational commands

### Run tests

```bash
npm test
```

### Monitor sockets once

```bash
npm run monitor:sockets:once
```

### Tune npm concurrency

```bash
npm config set maxsockets 10
# or
npm run npm:maxsockets
```

## 5) Prerequisites

- Node + npm
- Rust (for Tauri desktop mode)
- Tauri CLI (`cargo install tauri-cli --version '^2.0.0'`)

## MCP mode (all platforms)

If you want to connect an MCP client (for example, an editor or agent host), run:

```bash
ai-native-ide mcp
```

Or from the repository:

```bash
npm run mcp
```

