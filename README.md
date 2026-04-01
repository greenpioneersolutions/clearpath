# CoPilot Commander

**The desktop control tower for AI coding agents.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-31-47848F.svg)](https://electronjs.org)
[![Platform: macOS](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)](#)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](#)

CoPilot Commander is an Electron desktop app that gives non-technical team members full access to GitHub Copilot CLI and Claude Code — without ever opening a terminal. It spawns and manages CLI processes in the background, streams their output to a clean React UI, and exposes every flag, agent, and permission as a visual control.

If your team has Copilot or Claude licensed but only 20% of people are actually using it, this is why.

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Key Features](#key-features)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [For Enterprise Teams](#for-enterprise-teams)
- [Supported CLI Flags](#supported-cli-flags)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## The Problem

GitHub Copilot CLI and Claude Code are genuinely powerful agentic tools. They can explore codebases, write and run code, manage pull requests, coordinate sub-agents, and operate autonomously for long tasks. The people who would benefit most from that capability — engineering managers reviewing work, tech leads coordinating across teams, product-adjacent technical staff — are the exact people least likely to have terminal fluency.

This creates an adoption gap that doesn't get talked about enough. Organizations pay for Copilot Business or Enterprise seats. Engineers use them from the terminal. Everyone else doesn't. The ROI argument falls apart because most of the team never touches the tool.

The barrier isn't intelligence or interest. It's the interface.

---

## The Solution

CoPilot Commander wraps these CLIs in a desktop app. Under the hood it's the same `copilot` and `claude` binaries your engineers use — the app just spawns them as child processes, reads their output, and routes everything through a GUI.

- No new credentials. If you're already authenticated with Copilot at work, the app detects that and starts immediately.
- No terminal knowledge required. Every flag, every agent toggle, every permission setting is a button or dropdown.
- No separate backend. The app runs entirely on your local machine, communicating only with the CLIs you already have installed.
- Configurable for your whole team. Export a settings profile and share it so everyone is working with the same agent setup and permission policies.

---

## Key Features

### Dual CLI Support
Runs both **GitHub Copilot CLI** (primary) and **Claude Code** (secondary) from one app. Switch between them per session. Each CLI has its own adapter — the UI stays the same regardless of which backend is running.

### Visual Agent Management
Browse built-in agents (Explore, Task, Code Review, Plan) and any custom agents from your project's agent files. Toggle agents on or off with a single click. Set one as the active agent for new sessions. Create new agents through a step-by-step wizard that writes the correct markdown file format automatically. Edit agent definitions in an in-app editor.

### Session Management
Start new sessions with a working directory and optional initial prompt. Sessions stream output in real time with type-specific rendering: plain text, collapsible tool-use cards, permission request dialogs with Allow/Deny buttons, thinking blocks (dimmed italic), and error highlighting. Switch between **Normal**, **Plan**, and **Autopilot** modes using the mode indicator bar. Browse session history and resume any past session by ID.

### Slash Command Autocomplete
The input bar knows every slash command for both CLIs — type `/` to see suggestions, arrow keys to navigate, Tab or Enter to select. Commands that need no arguments (like `/clear`, `/compact`, `/yolo`) execute immediately. Commands that take arguments insert with a trailing space so you can keep typing. The `!` prefix for shell passthrough is also supported for Copilot.

### Tool & Permission Controls
Visual toggles for every tool permission. Set permission mode (Default, Plan, AcceptEdits, BypassPermissions, Auto). Configure allowed and denied tool patterns. Manage MCP server connections. Every permission decision the CLI exposes is surfaced in the UI — nothing is buried in a flag you have to remember.

### Configuration Profiles
Save your current agent configuration as a named profile. Load a profile to restore the exact combination of enabled agents, active agent, and settings. Share profiles with teammates as a standardized setup. Useful for teams that want everyone using the same configuration for specific project types.

### CLI Flag Builder
Every CLI flag for both Copilot and Claude Code is represented as a UI control — model selector, budget limits, session options, output format, system prompt overrides, MCP config, debug categories, and more. Nothing is left out. If the CLI supports it, the app can set it.

### Auth Detection & Login Flows
On startup the app checks whether each CLI is installed and authenticated. It detects API keys from environment variables (`ANTHROPIC_API_KEY`, `GH_TOKEN`, `GITHUB_TOKEN`), credential files, and the CLIs' own auth status commands. If you need to log in, the app walks you through the flow with streaming output so you can see the device code or URL without switching to a terminal.

### Login-Shell PATH Resolution
On macOS, Electron apps start without a login shell, meaning tools installed by Homebrew, nvm, or in `~/.local/bin` are invisible to the app. CoPilot Commander solves this at startup by sourcing your shell's PATH and using it for all child process spawns — so if `which copilot` works in your terminal, it works in the app.

---

## Screenshots

![Dashboard](docs/screenshots/dashboard.png)
*Dashboard — auth status for both CLIs, install detection, one-click login flows*

![Agent Panel](docs/screenshots/agents.png)
*Agent Panel — built-in and custom agents, toggle controls, wizard for creating new agents, profile manager*

![Session View](docs/screenshots/sessions.png)
*Session View — streaming output, mode indicator, slash command autocomplete, session history sidebar*

![Settings](docs/screenshots/settings.png)
*Settings — CLI flag builder, model selection, MCP config, permission controls*

![Sub-Agent Monitor](docs/screenshots/subagents.png)
*Sub-Agent Monitor — running agents, output streams, process controls*

---

## Quick Start

### Prerequisites

- **Node.js 22+** — required by the Copilot CLI
- **At least one of:**
  - [GitHub Copilot CLI](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line) installed and authenticated
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- macOS (Windows support planned — see [Roadmap](#roadmap))

### Run locally

```bash
git clone https://github.com/your-org/copilot-commander.git
cd copilot-commander
npm install
npm run dev
```

On first launch the app checks which CLIs are installed and their auth status. If a CLI is installed and already authenticated (via environment variable or existing credential files), it shows as ready immediately. If not, you'll see a Connect button that starts the login flow.

### Build for distribution

```bash
npm run package
```

Outputs a `.dmg` (macOS) or `.AppImage` (Linux) to `dist-electron/`.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Electron App                    │
│  ┌───────────────────────────────────────────┐  │
│  │           React Renderer (UI)             │  │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐  │  │
│  │  │ Agent   │ │ Session  │ │ Dashboard │  │  │
│  │  │ Panel   │ │ Viewer   │ │ + Auth    │  │  │
│  │  └─────────┘ └──────────┘ └───────────┘  │  │
│  └──────────────────┬────────────────────────┘  │
│                     │ IPC Bridge (contextBridge) │
│  ┌──────────────────┴────────────────────────┐  │
│  │         Main Process (Node.js)            │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │        CLIManager Service           │  │  │
│  │  │  ┌───────────┐  ┌───────────────┐   │  │  │
│  │  │  │ Copilot   │  │ Claude Code   │   │  │  │
│  │  │  │ Adapter   │  │ Adapter       │   │  │  │
│  │  │  └───────────┘  └───────────────┘   │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  │  ┌──────────┐  ┌─────────────┐            │  │
│  │  │ Auth     │  │ Agent       │            │  │
│  │  │ Manager  │  │ Manager     │            │  │
│  │  └──────────┘  └─────────────┘            │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
┌─────────────────┐    ┌─────────────────────┐
│  copilot CLI    │    │  claude CLI         │
│ (child_process) │    │ (child_process)     │
└─────────────────┘    └─────────────────────┘
```

### How it works

**Main process** — Node.js environment. Manages CLI child processes via `CLIManager`, handles authentication via `AuthManager`, reads and writes agent definition files via `AgentManager`, and persists session history to `electron-store`. Communicates with the renderer through Electron's IPC bridge.

**Renderer** — React 18 + TypeScript + Tailwind CSS. Receives streaming CLI output via IPC push events (`cli:output`, `cli:error`, `cli:exit`, `cli:permission-request`) and renders them in real time. All user interactions (starting sessions, sending input, toggling agents) go back through `window.electronAPI.invoke`.

**Adapter pattern** — Each CLI is implemented as an `ICLIAdapter`. The interface is small:

```typescript
interface ICLIAdapter {
  isInstalled(): Promise<boolean>
  isAuthenticated(): Promise<boolean>
  buildArgs(options: SessionOptions): string[]
  parseOutput(data: string): ParsedOutput
  startSession(options: SessionOptions): ChildProcess
  sendInput(proc: ChildProcess, input: string): void
  sendSlashCommand(proc: ChildProcess, command: string): void
}
```

Adding support for a new CLI tool — Cursor, Aider, Codex CLI, Gemini CLI — means writing one new adapter class. No UI changes required. The session UI, agent panel, and permission controls all work against the adapter interface.

**Shell PATH fix** — macOS GUI apps start without a login shell. `initShellEnv()` runs `zsh -l -c 'echo $PATH'` at startup and caches the result. All child process spawns use this enriched PATH so tools installed by Homebrew, nvm, or in `~/.local/bin` are always found.

---

## For Enterprise Teams

### Uses your existing authentication

CoPilot Commander does not store, manage, or transmit credentials. It delegates completely to the CLI's own auth system. If a developer has a valid Copilot Business or Enterprise session, or has `ANTHROPIC_API_KEY` set, the app detects it and works immediately. No additional service accounts, no API proxies, no new attack surface.

### Respects org-level policies

Because the app spawns the real CLI binary, all organizational Copilot policies apply exactly as they would in a terminal session. If your Copilot Business configuration restricts certain models or disables specific tools, those restrictions are in effect in the app too.

### Standardize setups with profiles

Create a configuration profile with the agents, tools, and permission settings appropriate for your team's workflows. Export it. Share the file. Everyone loads the same profile and is working from the same baseline — same agents enabled, same permission policy, same model selection.

### Onboard non-engineers

The people who could benefit most from AI coding assistance but never use it because of the terminal barrier: engineering managers who review PRs, tech leads who need to draft technical specs, QA engineers who need to understand code, developer advocates writing documentation. CoPilot Commander gives them a path in.

### No raw token handling

The app reads auth status (installed/authenticated, yes or no) and nothing else. It never reads, logs, or stores the actual tokens or credentials. The credential files stay exactly where the CLI put them.

---

## Supported CLI Flags

CoPilot Commander exposes every documented flag for both CLIs as a UI control. The full reference tables — including all flags for GitHub Copilot CLI and all flags for Claude Code — are in [CLAUDE.md](CLAUDE.md).

**Copilot CLI flags covered:** `--model`, `--agent`, `--yolo`, `--allow-all`, `--allow-tool`, `--deny-tool`, `--available-tools`, `--excluded-tools`, `--experimental`, `--output-format`, `--additional-mcp-config`, `--disable-builtin-mcps`, `--plugin-dir`, `--resume`, `--continue`, `--config-dir`, `--alt-screen`, `--screen-reader`, `--streamer-mode`, `--acp`, `--save-gist`, and more.

**Claude Code flags covered:** `--model`, `--fallback-model`, `--permission-mode`, `--allowedTools`, `--disallowedTools`, `--tools`, `--system-prompt`, `--append-system-prompt`, `--output-format`, `--input-format`, `--mcp-config`, `--strict-mcp-config`, `--agent`, `--agents`, `--max-budget-usd`, `--max-turns`, `--session-id`, `--resume`, `--continue`, `--fork-session`, `--worktree`, `--add-dir`, `--verbose`, `--debug`, `--settings`, `--ide`, `--chrome`, and more.

Both adapters also include a `flags` catch-all that passes arbitrary `--key value` pairs through to the CLI for anything not explicitly modeled.

---

## Roadmap

- **Windows support** — Cowork integration and Windows PATH resolution
- **Team dashboard** — aggregate view of all running agents across developers on your team
- **Plugin marketplace** — shareable agent templates and skill packages
- **GitHub Issues + PR integration** — start sessions directly from an issue or PR, push results back
- **Voice commands** — start and control sessions hands-free
- **Cursor CLI adapter** — full Cursor agent support via the same adapter pattern
- **Codex CLI adapter** — OpenAI Codex CLI support
- **Task queue** — queue overnight tasks with automatic rate-limit handling and retry
- **xterm.js terminal view** — optional raw terminal rendering for power users who want full TUI output
- **Audit log** — per-session log of every tool use and permission decision for compliance contexts

---

## Contributing

```bash
git clone https://github.com/your-org/copilot-commander.git
cd copilot-commander
npm install
npm run dev
```

**Branch naming:** `feat/description`, `fix/description`, `chore/description`

**Adding a new CLI adapter:**
1. Create `src/main/cli/YourAdapter.ts` implementing `ICLIAdapter`
2. Register it in `CLIManager.ts`
3. Add the CLI name to the `cli` union type in `src/renderer/src/types/ipc.ts`
4. Update `AuthManager` to check install/auth status for the new CLI

No UI changes needed for basic support — the session view, agent panel, and all controls work against the adapter interface.

**Pull requests:** Open against `main`. Include a description of what changed and why. For new adapters, include a note about how you tested against the real CLI binary.

---

## License

MIT — see [LICENSE](LICENSE).

---

*Built by engineers for the people who work alongside them.*
