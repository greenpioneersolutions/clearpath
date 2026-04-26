<p align="center">
  <img src="src/renderer/src/assets/brand/logo-full.svg" alt="ClearPathAI" width="400" />
</p>

<p align="center">
  <strong>No code. No confusion. Just go.</strong>
</p>

<p align="center">
  <a href="#key-features">Features</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#enterprise-ready">Enterprise</a> &middot;
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

- **Intuitive sidebar navigation** — Home dashboard, Work session, Insights analytics, Clear Memory workspace, Connect (integrations & extensions), and Settings. No menu maze.
- **Multi-CLI support** — GitHub Copilot CLI (primary) and Claude Code CLI (secondary) with adapter pattern for adding more backends
- **Real-time session management** — Streaming output display, slash command autocomplete, mode switching (normal/plan/autopilot)
- **Agent management** — Toggle built-in and custom agents, create agent definitions, agent profiles
- **Sub-agent process monitor** — Delegate tasks to background CLI processes, monitor progress, kill/pause/resume
- **Usage analytics** — Real-time token usage tracking, session activity feed, per-model breakdowns
- **Prompt template library** — 30+ built-in templates across 12 categories with variable placeholders
- **Task scheduler** — Cron-based scheduled tasks with node-cron, missed run detection, execution history
- **Policy guardrails** — Configurable policy presets (Cautious/Standard/Unrestricted) with violation logging
- **Team collaboration** — Config bundle export/import, shared folder sync, agent marketplace
- **PR Scores (Experimental)** — Score GitHub pull requests 0-100 with breakdown analysis, repo dashboards, and AI-powered code review
- **Extension system** — Dynamic extensions loaded at runtime, sandboxed in iframes with MessageChannel SDK, per-extension encrypted storage, permission-gated access to integrations. Build and distribute your own extensions. **[Read the Extension Guide](docs/extensions.md)**
- **Compliance & security** — Audit logging, encrypted credential storage, OS keychain integration, CSP headers, IPC whitelisting, rate limiting
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
│  │    Sidebar React Renderer (UI)            │  │
│  │  Home · Work · Insights · Clear Memory    │  │
│  │  Connect · Settings                       │  │
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

Clear Path uses a streamlined sidebar with the following entries:

| Screen | Purpose |
|--------|---------|
| **Home** | Dashboard / HomeHub greeting, quick prompt input, and recent sessions |
| **Work** | Session chat with mode toggle (Session, Wizard, Compose, Schedule, Memory) |
| **Insights** | Activity (merged Analytics + Usage Analytics) and Compliance tabs, plus extension-contributed tabs when installed |
| **Clear Memory** | ClearMemory IDE workspace |
| **Connect** | Integrations, Extensions, MCP Servers, Environment, Plugins, Webhooks |
| **PR Scores** | Experimental — GitHub PR scoring, repo dashboards, AI review (feature-flagged) |
| **Settings** | Setup Wizard, Accessibility, Prompts, Playbooks, Notes & Context, General, Tools & Permissions, Session Wizard, Policies, Workspaces, Team Hub, Scheduler, Branding |
| **Learn** | Optional, feature-flagged — onboarding and learning paths |

Managers see a focused sidebar, not 18 pages. Power users reach every detail through the sub-tabs inside each screen.

## Extensions

ClearPathAI supports a dynamic extension system that lets you add custom features to the app after installation. Extensions run in sandboxed iframes with a permission-gated SDK — they can render custom UI, access integration data (GitHub, Jira, etc.), store data persistently, and add sidebar navigation entries, all without ever touching raw tokens or the host app's internals.

**What extensions can do:**
- Render React-based UI pages, panels, and dashboard widgets
- Access GitHub repos, PRs, and issues through a secure proxy (token never leaves the main process)
- Store up to 50 MB of encrypted, per-extension persistent data
- Send notifications to the user
- Make HTTP requests to declared domains
- Register custom IPC handlers for backend logic

**What extensions cannot do:**
- Access raw API tokens or credentials
- Make undeclared network requests
- Read or modify the host app's DOM
- Access other extensions' data
- Crash the host app (errors are contained in the iframe)

Extensions are managed in **Connect > Extensions** where users can install from zip files, enable/disable, and grant or revoke individual permissions.

**[Read the full Extension Developer Guide](docs/extensions.md)** for architecture details, the manifest spec, SDK API reference, security model, and step-by-step tutorials for building your own extensions.

## Enterprise Ready

ClearPathAI is built for organizations that need AI tooling they can control, audit, and deploy within their own walls. No SaaS dependency, no server infrastructure, no data leaving your environment unless you decide it should. You take it, you own it, you make it yours.

| Capability | What It Means |
|-----------|---------------|
| **Policy guardrails** | Prevent unauthorized tool use, enforce permission modes, cap turn limits, protect sensitive files |
| **Compliance & audit** | Immutable audit log with JSONL archival, one-click compliance snapshot export |
| **Sensitive data scanning** | Catches credentials, API keys, and PII in prompts before they reach the AI |
| **Encryption at rest** | OS keychain for secrets (macOS Keychain, DPAPI, libsecret), AES-encrypted electron-store, CSP headers, IPC whitelisting |
| **Team onboarding** | Built-in Learning Center with role-based paths, interactive lessons, and progress tracking |
| **Session limits** | Configurable max-turns per session via Settings > Session Limits |
| **Config sharing** | Export/import settings, policies, templates, and agents as team bundles — no server required |
| **Air-gapped deployment** | Full offline operation with local models via Ollama — zero external network calls |
| **Open source (MIT)** | Read every line. Fork it. Rebrand it. Customize it. No vendor lock-in, ever. |

The entire point is that you can bring this inside your organization, customize it to your needs, and have complete control. Your IT team reviews the code. Your compliance team sets the policies. Your team members get a modern AI interface without opening a terminal.

**→ [Read the full Enterprise Guide](ENTERPRISE.md)** for deployment options, security model, compliance details, and a step-by-step getting started checklist.

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
