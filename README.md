# Aria — AI Runtime Interactive Agent

This repository contains **Aria**, a working prototype of a runtime-native AI coding assistant inspired by the Playwright-Native AI IDE manifesto.

## Quick Start

```bash
git clone https://github.com/elevate-foundry/ai-native-ide.git
cd ai-native-ide
./bootstrap.sh
```

That's it! The bootstrap script will:
1. Check for Node.js
2. Install dependencies
3. Set up your OpenRouter API key
4. Start the Aria server and IDE
5. Open the IDE in your browser

**IDE:** http://localhost:4173/ide  
**API:** http://localhost:3200  
**CLI:** `npm run aria`

To stop: `./stop.sh`

## What is included

- A formal manifesto document.
- A JavaScript implementation of a runtime-native agent loop.
- Sensor abstractions for:
  - code state
  - execution state
  - interface state
- Semantic interaction primitives that sit above raw browser actions.
- A comprehensive, test-driven suite that validates core loop behavior and semantic interaction contracts.
- A **Tauri desktop shell scaffold** with a 3-panel IDE-like layout and backend commands.
- An **Ollama-style installer script** in `scripts/install.sh` that installs an `ai-native-ide` command.
- Socket monitoring tooling and npm network tuning (`maxsockets=10`).

## Install options

### Option A — one-liner installer (Ollama style)

```bash
curl -fsSL https://raw.githubusercontent.com/elevate-foundry/ai-native-ide/HEAD/scripts/install.sh | bash
```

After install:

```bash
ai-native-ide dev
```

> The URL above should point at your repo's raw `scripts/install.sh`.

If macOS prints “The default interactive shell is now zsh”, that is informational.
You can still run the installer with bash using the command above (note the `| bash`).


If you get `curl: (22) ... 404`, usually one of these is true:

- the repository is private,
- the default branch has not been updated yet,
- or the path/organization is incorrect.

Fallback that always works if you can clone:

```bash
git clone https://github.com/elevate-foundry/ai-native-ide.git ai-native-ide
cd ai-native-ide
bash scripts/install.sh
```

### Option B — clone and run

```bash
git clone https://github.com/elevate-foundry/ai-native-ide.git ai-native-ide
cd ai-native-ide
npm install
npm test
npm run tauri:dev
```

### About `apt-get` style installs

A command like this works only after publishing a Debian package and apt repository:

```bash
sudo apt-get update && sudo apt-get install ai-native-ide -y
```

This repo currently ships a script-based installer, not an apt package.

## Socket monitoring + npm maxsockets tuning

Run socket monitor once:

```bash
npm run monitor:sockets:once
```

Run continuous socket monitor:

```bash
npm run monitor:sockets
```

Apply npm network tuning:

```bash
npm config set maxsockets 10
# or
npm run npm:maxsockets
```

If you installed via `scripts/install.sh`, this tuning is applied automatically during install.

Launcher equivalents:

```bash
ai-native-ide sockets:once
ai-native-ide sockets
ai-native-ide tune
```

## MCP server

You can run an MCP (Model Context Protocol) server over stdio:

```bash
npm run mcp
```

If you installed the launcher:

```bash
ai-native-ide mcp
```

The MCP server exposes two tools:

- `run_runtime_loop`
- `get_interface_sensor_snapshot`

## Quick start

```bash
npm test
```

For OS-specific startup commands (macOS, Linux, Windows/Surface), see `docs/RUNNING_THE_IDE.md`.


## Tauri app (desktop shell)

### Prerequisites

- Rust toolchain (stable)
- Tauri CLI (`cargo install tauri-cli --version '^2.0.0'`)

### Run browser preview of the desktop UI

```bash
npm run tauri:web
```

Then open `http://127.0.0.1:4173`.

### Run as a real Tauri app

```bash
npm run tauri:dev
```

This launches the desktop window and wires frontend calls to Rust commands in `src-tauri/src/main.rs`.

### Build desktop bundles

```bash
npm run tauri:build
```

## TDD workflow

1. Add or update tests in `test/` for the behavior you want to guarantee.
2. Run `npm test` and confirm the new test fails first.
3. Implement the behavior in `src/`, `desktop/`, or `src-tauri/`.
4. Re-run `npm test` and ensure all tests pass.

The test suite currently covers:

- constructor contract validation,
- successful completion paths,
- repair/replan behavior,
- max-iteration exhaustion behavior,
- context/history propagation,
- Playwright observer adapter sequencing,
- semantic browser action call order,
- Tauri scaffold contract checks (scripts/config/commands),
- installer script and launcher contract checks,
- socket monitor contract checks,
- MCP server tool discovery and calls.

## Project structure

- `manifesto/PLAYWRIGHT_NATIVE_AI_IDE_MANIFESTO.md` — manifesto text.
- `src/core.js` — loop engine and sensor contracts.
- `src/semanticActions.js` — semantic browser operations.
- `src/index.js` — public exports.
- `desktop/` — Tauri frontend shell (3-panel runtime observatory UI).
- `src-tauri/` — Rust backend commands and Tauri config.
- `scripts/serve-desktop.mjs` — static dev server for desktop frontend preview.
- `scripts/install.sh` — one-line install entrypoint.
- `scripts/monitor-sockets.mjs` — socket count monitor.
- `scripts/mcp-server.mjs` — stdio MCP server with runtime tools.
- `test/core.test.js` — loop, sensor, and observer tests.
- `test/semanticActions.test.js` — semantic interaction tests.
- `test/desktopScaffold.test.js` — desktop shell scaffold tests.
- `test/installer.test.js` — installer and launcher behavior tests.
- `test/socketMonitor.test.js` — socket monitoring checks.

## Why this exists

The goal is to move from **text-first coding assistance** to **runtime-aware system operation** where an AI can:

1. change code,
2. run the system,
3. inspect runtime,
4. inspect UI state through Playwright-like sensors,
5. repair based on observed failures.

This repo is intentionally minimal, but designed to be extended with a real Playwright adapter and real build/test/runtime process hooks.
