<p align="center">
  <img src="src/renderer/src/assets/brand/logo-full.svg" alt="ClearPathAI" width="400" />
</p>

<p align="center">
  <strong>No code. No confusion. Just go.</strong>
</p>

<p align="center">
  <a href="#key-features">Features</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#brand">Brand</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
</p>

---

## Why ClearPathAI Exists

AI tools are incredible — if you're allowed to use them. In the enterprise world, that's a big "if." Most organizations have locked things down to GitHub Copilot, and the most powerful way to use it is through the CLI. But here's the reality: the majority of people on your team — project managers, designers, analysts — are never going to open a terminal and type `copilot --experimental --model claude-sonnet-4.5 --allow-tool "shell(git:*)"`. They just won't. And that means they're getting a fraction of the value from tools the company is already paying for.

I built ClearPathAI because I ran into this exact problem. I watched talented people get left behind — not because they lacked ability, but because the tools assumed everyone thinks in flags and shell commands. The open-source world has beautiful AI interfaces, but when you're inside an enterprise with compliance requirements, budget constraints, and approved tooling, you need something that works within those walls while still feeling modern.

ClearPathAI wraps GitHub Copilot CLI (and Claude Code CLI for teams that have access) in a clean desktop app. No terminal. No memorizing flags. Your team opens it, types in plain language, and gets the full power of the AI agent — sessions, sub-agents, scheduling, templates — through a conversation interface they already understand. Meanwhile, admins get the guardrails they need: policy enforcement, cost tracking, audit logging, and compliance controls.

## Key Features

- **Intuitive 4-screen navigation** — Home dashboard, Work session with contextual panels, Insights analytics, and Configure settings. No menu maze.
- **Multi-CLI support** — GitHub Copilot CLI (primary) and Claude Code CLI (secondary) with adapter pattern for adding more backends
- **Real-time session management** — Streaming output display, slash command autocomplete, mode switching (normal/plan/autopilot)
- **Agent management** — Toggle built-in and custom agents, create agent definitions, agent profiles
- **Sub-agent process monitor** — Delegate tasks to background CLI processes, monitor progress, kill/pause/resume
- **Cost analytics** — Real-time token usage tracking, budget alerts, cost-per-task metrics, CSV export
- **Prompt template library** — 30+ built-in templates across 12 categories with variable placeholders
- **Task scheduler** — Cron-based scheduled tasks with node-cron, missed run detection, execution history
- **Policy guardrails** — Configurable policy presets (Cautious/Standard/Unrestricted) with violation logging
- **Team collaboration** — Config bundle export/import, shared folder sync, agent marketplace
- **Compliance & security** — Audit logging, sensitive data scanning, file protection patterns, compliance snapshot export
- **Knowledge base generation** — AI-generated codebase documentation with incremental updates
- **Voice interface** — Speech-to-text input, voice commands, hands-free mode, audio notifications
- **Git workflow tools** — Visual git status, PR builder, worktree management, branch protection awareness
- **Multi-repo workspaces** — Broadcast tasks across repos, cross-repo activity feed
- **Local model support** — Ollama and LM Studio integration for offline AI
- **Customizable dashboard** — Widget layout with 12 widget types and preset layouts
- **Unified notifications** — Bell inbox, desktop push, webhook delivery (Slack/JSON), quiet hours

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Clear Path                     │
│  ┌───────────────────────────────────────────┐  │
│  │    4-Screen React Renderer (UI)           │  │
│  │  Home │ Work │ Insights │ Configure       │  │
│  └──────────────────┬────────────────────────┘  │
│                     │ IPC Bridge                 │
│  ┌──────────────────┴────────────────────────┐  │
│  │         Main Process (Node.js)            │  │
│  │  CLIManager · NotificationManager         │  │
│  │  SchedulerService · 24 IPC Modules        │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

## Download

Grab the latest release for your platform from the [Releases page](../../releases):

| Platform | File |
|----------|------|
| macOS | `ClearPathAI-x.x.x-arm64.dmg` |
| Windows | `ClearPathAI Setup x.x.x.exe` |
| Linux | `ClearPathAI-x.x.x.AppImage` |

> **macOS note:** The app is not code-signed. After downloading, run this in Terminal before opening:
> ```bash
> xattr -cr ~/Downloads/ClearPathAI-*.dmg
> ```
> Then open the `.dmg` and drag ClearPathAI to Applications. On first launch you may need to right-click → Open → Open.

**Prerequisites:** Install the CLI(s) you want to use:
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) — `npm install -g @github/copilot`
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — `npm install -g @anthropic-ai/claude-code`

## Building from Source

```bash
# Package for your current platform (macOS, Linux, or Windows)
npm run package

# Or target a specific platform
npm run package:mac     # → dist-electron/ClearPathAI-x.x.x.dmg
npm run package:linux   # → dist-electron/ClearPathAI-x.x.x.AppImage
npm run package:win     # → dist-electron/ClearPathAI Setup x.x.x.exe
```

Releases are built automatically via GitHub Actions for all three platforms when a version tag is pushed.

## Tech Stack

- **Electron** — Desktop shell
- **React 18** + **TypeScript** — Renderer UI
- **Tailwind CSS** — Styling
- **Recharts** — Data visualization
- **electron-store** — Persistent settings
- **node-cron** — Task scheduling

## Navigation

Clear Path uses a streamlined 4-screen navigation:

| Screen | Purpose |
|--------|---------|
| **Home** | Customizable widget dashboard with preset layouts |
| **Work** | Session chat + contextual panel toolbar (Agents, Tools, Files, Git, Templates, Sub-Agents, Knowledge Base) |
| **Insights** | Analytics, Compliance, and Usage tabs |
| **Configure** | Settings, Policies, Integrations, Memory, Workspaces, Team Hub, Scheduler, Learn |

Managers see 4 screens, not 18 pages. Power users access everything through contextual panels in the Work view.

## Enterprise Ready

- **Policy guardrails** prevent unauthorized tool use, enforce permission modes, and cap budgets
- **Compliance tracking** with append-only audit log and one-click snapshot export
- **Sensitive data scanning** catches credentials before they reach the AI
- **Team config sharing** via export/import bundles — no server required
- **ROI tracking** with estimated hours saved metrics

## Brand

### Colors

| Role | Swatch | Hex |
|------|--------|-----|
| Primary (compass bg) | ![#5B4FC4](https://via.placeholder.com/12/5B4FC4/5B4FC4.png) | `#5B4FC4` |
| "Path" text | ![#7F77DD](https://via.placeholder.com/12/7F77DD/7F77DD.png) | `#7F77DD` |
| "AI" text / accent | ![#1D9E75](https://via.placeholder.com/12/1D9E75/1D9E75.png) | `#1D9E75` |
| Clear path line | ![#5DCAA5](https://via.placeholder.com/12/5DCAA5/5DCAA5.png) | `#5DCAA5` |
| Neural network | ![#85B7EB](https://via.placeholder.com/12/85B7EB/85B7EB.png) | `#85B7EB` |

### Assets

Brand assets are in [`src/renderer/src/assets/brand/`](src/renderer/src/assets/brand/):

| File | Usage |
|------|-------|
| `icon-512.svg` | App icon (512x512) |
| `logo-full.svg` | Full logo with compass + wordmark (README, marketing) |
| `logo-navbar.svg` | Sidebar/navbar logo (icon + wordmark, 220x40) |
| `logo-wordmark.svg` | Text-only wordmark |
| `logo-footer.svg` | Footer-size logo with tagline |
| `github-banner.svg` | GitHub social preview banner (1280x320) |

## License

MIT
