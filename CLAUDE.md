# CoPilot Commander — Electron GUI for CLI AI Agents

## Project Overview
CoPilot Commander is an Electron + React + TypeScript application that provides a manager-friendly GUI wrapper around **GitHub Copilot CLI** (primary) and **Claude Code CLI** (secondary). Non-technical users never touch the terminal — the app spawns, manages, and parses CLI processes behind a polished UI.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Electron App                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              React Renderer (UI)                   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │  │
│  │  │ Sidebar  │ │ Work     │ │ Context Panels    │  │  │
│  │  │ Nav      │ │ Area     │ │ (Agents, Tools,   │  │  │
│  │  │          │ │ (Chat +  │ │  Files, Git,      │  │  │
│  │  │          │ │ Compose) │ │  Templates, etc.) │  │  │
│  │  └──────────┘ └──────────┘ └───────────────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │  │
│  │  │ Dashboard│ │ Settings │ │ Insights &        │  │  │
│  │  │ & Home   │ │ & Config │ │ Analytics         │  │  │
│  │  └──────────┘ └──────────┘ └───────────────────┘  │  │
│  └───────────────────┬────────────────────────────────┘  │
│                      │ IPC Bridge                        │
│  ┌───────────────────┴────────────────────────────────┐  │
│  │           Main Process (Node.js)                   │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │           CLIManager Service                 │  │  │
│  │  │  ┌───────────┐ ┌──────────┐ ┌────────────┐  │  │  │
│  │  │  │ Copilot   │ │ Claude   │ │ Local      │  │  │  │
│  │  │  │ Adapter   │ │ Adapter  │ │ Model      │  │  │  │
│  │  │  └───────────┘ └──────────┘ └────────────┘  │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐          │  │
│  │  │ Auth     │ │ Agent    │ │ Notif.   │          │  │
│  │  │ Manager  │ │ Manager  │ │ Manager  │          │  │
│  │  └──────────┘ └──────────┘ └──────────┘          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐          │  │
│  │  │ Scheduler│ │ Cost     │ │ Session  │          │  │
│  │  │ Service  │ │ Tracker  │ │ Store    │          │  │
│  │  └──────────┘ └──────────┘ └──────────┘          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
         │              │               │
         ▼              ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│ copilot CLI  │ │ claude CLI  │ │ Ollama /     │
│ (child_proc) │ │ (child_proc)│ │ LM Studio    │
└──────────────┘ └─────────────┘ │ (HTTP API)   │
                                 └──────────────┘
```

## Tech Stack
- **Electron 31** — Desktop shell
- **React 18** with TypeScript — Renderer UI
- **Tailwind CSS 3** — All styling
- **Node.js child_process** — CLI spawning/management
- **electron-store** — Persistent settings, sessions, costs, notifications
- **react-markdown** + remark-gfm + rehype-raw — Chat markdown rendering
- **Recharts** — Analytics charts
- **CodeMirror** — In-app file editors (markdown, JSON)
- **react-grid-layout** — Dashboard widget layout
- **node-cron** — Scheduled task execution

## Brand Colors

| Role | Hex | Usage |
|------|-----|-------|
| Primary purple | `#5B4FC4` | Compass background, sidebar bg accents, button primary |
| Light purple | `#7F77DD` | "Path" in wordmark, secondary highlights |
| Teal accent | `#1D9E75` | "AI" in wordmark, success states |
| Light teal | `#5DCAA5` | Clear path line, compass beacon, active indicators |
| Neural blue | `#85B7EB` | Neural network nodes, informational accents |

Brand assets are in `src/renderer/src/assets/brand/` (icon, logos, banner).

## Conventions
- TypeScript strict mode throughout
- All CLI interactions go through CLIManager service with adapter pattern
- IPC bridge for main ↔ renderer communication
- Tailwind for all styling, no CSS modules
- Feature-based folder structure under `src/`
- electron-store for all persistent data (no external database)

## Data Persistence
All user data is stored via electron-store in `~/Library/Application Support/clear-path/`:
| Store file | Contents |
|------------|----------|
| `clear-path-sessions.json` | Session message logs, metadata, archive status (max 50 sessions) |
| `clear-path-settings.json` | App settings, flags, model config, env vars, profiles |
| `clear-path-notifications.json` | Notification history, webhooks, preferences (max 500) |
| `clear-path-cost.json` | Cost records, budget config, fired alerts (max 10k records) |
| `clear-path-history.json` | Session history metadata (max 100) |
| `clear-path-plugins.json` | CLI plugin custom paths and per-CLI enable lists |
| `clear-path-mcps.json` | MCP registry entries (source of truth for MCP servers) |

MCP secrets (API tokens, DB URLs) are stored separately in `<userData>/mcp-secrets.json`, encrypted via Electron `safeStorage` when available.

Knowledge base files are stored in the project directory at `.clear-path/knowledge-base/`.

---

## CLI Reference: GitHub Copilot CLI (PRIMARY)

### Installation & Auth
- Install: `npm install -g @github/copilot` (requires Node.js 22+)
- Also via: Homebrew (`brew install copilot-cli`), WinGet, shell script
- Auth: `/login` slash command or via `GH_TOKEN` / `GITHUB_TOKEN` env vars
- PAT auth: Fine-grained PAT with "Copilot Requests" permission
- CI/CD auth: Set `GITHUB_ASKPASS` to executable returning token
- Entry point: `copilot` command (also `gh copilot` via GitHub CLI)
- Default model: Claude Sonnet 4.5

### All CLI Flags

#### Mode & Behavior
| Flag | Type | Description |
|------|------|-------------|
| `--experimental` | boolean | Enable experimental features (autopilot, alt-screen, dynamic retrieval). Persists in config once set |
| `--no-experimental` | boolean | Explicitly disable experimental features, overriding config |
| `--prompt` / `-p` | boolean | Non-interactive/headless mode. Process single prompt and exit. No permission prompts. Nonzero exit on errors |
| `--acp` | boolean | Start as Agent Client Protocol server for SDK integration |
| `--banner` | boolean | Show the startup banner |

#### Session Management
| Flag | Type | Description |
|------|------|-------------|
| `--resume [SESSION_ID\|TASK_ID]` | optional string | Continue previous session or task. Opens picker if no ID |
| `--continue` | boolean | Resume most recently closed session without picker |
| `--config-dir PATH` | string | Override default config directory (`~/.copilot`). Affects session state, plugins, history |

#### Tool & Permission Control
| Flag | Type | Description |
|------|------|-------------|
| `--yolo` | boolean | Auto-approve ALL tool permissions for session. Executes without prompts |
| `--allow-all` | boolean | Enable all permissions at once (more explicit than --yolo) |
| `--allow-all-tools` | boolean | Auto-approve all file system paths in prompt mode (-p) |
| `--allow-tool PATTERN` | string | Allow specific tool pattern, e.g. `shell(git:*)`, `MyMCP(create_issue)` |
| `--deny-tool PATTERN` | string | Deny specific tool pattern. Deny rules override allow rules |
| `--available-tools TOOL1,TOOL2,...` | comma-separated | Filter which tools model can use. Supports glob patterns |
| `--excluded-tools TOOL1,TOOL2,...` | comma-separated | Exclude specific tools from use |

#### Model Configuration
| Flag | Type | Description |
|------|------|-------------|
| `--model MODEL_NAME` | string | Specify AI model. Default: `claude-sonnet-4.5`. Options include Claude Sonnet 4, GPT-5, Gemini 3 Pro, etc. |
| `--agent AGENT_NAME` | string | Invoke a custom agent |

#### UI & Accessibility
| Flag | Type | Description |
|------|------|-------------|
| `--alt-screen [on\|off]` | boolean/explicit | Alternate screen buffer mode (default: on). Cleaner terminal experience |
| `--screen-reader` | boolean | Accessibility optimizations for screen readers |
| `--streamer-mode` | boolean | Hide preview model names and quota details for recording |

#### MCP & Extensions
| Flag | Type | Description |
|------|------|-------------|
| `--enable-all-github-mcp-tools` | boolean | Enable full suite of GitHub MCP tools including write operations |
| `--additional-mcp-config PATH` | string | Add MCP servers for single session |
| `--disable-builtin-mcps` | boolean | Disable all built-in MCP servers |
| `--disable-mcp-server NAME` | string | Disable specific built-in MCP server |
| `--plugin-dir PATH` | string | Load plugin from local directory |

#### Output & Logging
| Flag | Type | Description |
|------|------|-------------|
| `--output-format FORMAT` | string | Output format: `json` (JSONL for programmatic use) |
| `--save-gist` | boolean | Save session as GitHub gist (non-interactive mode) |
| `--stream` | boolean | Controls token-by-token streaming |
| `--bash-env` | boolean | Source BASH_ENV file in shell sessions |

#### Help & Info
| Flag | Type | Description |
|------|------|-------------|
| `--help` | boolean | Show help with descriptions, examples, sorted flags |
| `--version` | boolean | Show current CLI version |

### All Slash Commands (In-Session)

#### Session & Context
| Command | Description |
|---------|-------------|
| `/clear` | Wipe session context / conversation history |
| `/compact` | Manually compress context. Auto-triggers at 95% token limit |
| `/context` | Show detailed token usage breakdown |
| `/usage` | View session statistics (premium requests used, duration, code changes) |
| `/session` | Show session info and metrics |
| `/exit` | End CLI session |

#### Model & Mode
| Command | Description |
|---------|-------------|
| `/model` | Switch AI model mid-session. Shows available models for your plan |
| `/experimental [on\|off]` | Toggle experimental features |
| `Shift+Tab` | Cycle between modes: normal → plan → autopilot |

#### Directory & File Access
| Command | Description |
|---------|-------------|
| `/cwd PATH` or `/cd PATH` | Change working directory without restarting session |
| `/add-dir PATH` | Grant Copilot access to additional directory |
| `/list-dirs` | Show currently accessible directories |
| `/list-files` | Show files Copilot can access |

#### Permissions
| Command | Description |
|---------|-------------|
| `/allow-all` | Allow all tool permissions for rest of session |
| `/yolo` | Same as --yolo — auto-approve everything |

#### GitHub Integration
| Command | Description |
|---------|-------------|
| `/login` | Authenticate with GitHub |
| `/delegate [PROMPT]` | Push current session to Copilot coding agent on GitHub (creates PR) |
| `/resume` | Switch between local and remote coding agent sessions |
| `/review` | Analyze code changes directly in CLI |

#### Shell & Advanced
| Command | Description |
|---------|-------------|
| `!COMMAND` | Run shell command directly (bypasses AI) |
| `&PROMPT` | Delegate prompt to background coding agent |
| `/fleet` | Coordinate sub-agents in background |
| `/help` | Show all available slash commands |
| `Ctrl+T` | Toggle model reasoning visibility |

### Configuration Precedence (Copilot CLI)
1. **Command-line flags** (highest)
2. **Environment variables** (`GH_TOKEN`, `GITHUB_TOKEN`, `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`)
3. **Repository configuration** (`.github/copilot/settings.json`)
4. **Local overrides** (`.github/copilot/settings.local.json` — add to .gitignore)
5. **User configuration** (`~/.copilot/config`)

### Key Config Files (Copilot CLI)
- `~/.copilot/config` — User settings (persisted experimental mode, etc.)
- `.github/copilot/settings.json` — Repo-level settings (shared)
- `.github/copilot/settings.local.json` — Local repo overrides (gitignored)
- `~/.copilot/mcp-config.json` — Persistent MCP server config
- `AGENTS.md` / `.agent.md` files — Custom agent definitions
- Skill files in directories — Markdown-based agent skills

### Built-in Specialized Agents (Copilot CLI)
- **Explore** — Fast codebase analysis
- **Task** — Running builds and tests
- **Code Review** — High-signal change review
- **Plan** — Implementation planning
- Multiple agents can run in parallel

### Memory & Context (Copilot CLI)
- **Repository memory**: Remembers conventions, patterns, preferences across sessions
- **Cross-session memory**: Ask about past work, files, and PRs across sessions
- **Auto-compaction**: At 95% token limit, automatically compresses history

---

## CLI Reference: Claude Code CLI (SECONDARY)

### Installation & Auth
- Install: `npm install -g @anthropic-ai/claude-code`
- Update: `npm update -g @anthropic-ai/claude-code`
- Auth: `claude auth login` (or `claude auth login --console` for API billing)
- Entry point: `claude` command

### All CLI Flags

#### Session Management
| Flag | Short | Description |
|------|-------|-------------|
| `--continue` | `-c` | Continue most recent conversation in current directory |
| `--resume` | `-r` | Resume specific session by ID/name, or show picker |
| `--from-pr NUMBER\|URL` | | Resume sessions linked to specific GitHub PR |
| `--fork-session` | | Create new session ID when resuming (use with -r or -c) |
| `--session-id UUID` | | Use specific session ID (must be valid UUID) |
| `--no-session-persistence` | | Disable session persistence (print mode only) |
| `--remote` | | Create new web session on claude.ai |
| `--teleport` | | Resume web session in local terminal |
| `-n` / `--name NAME` | `-n` | Set display name for session at startup |

#### Model & Configuration
| Flag | Short | Description |
|------|-------|-------------|
| `--model NAME` | | Set model: `sonnet`, `opus`, `haiku` or full ID |
| `--fallback-model NAME` | | Auto-fallback model when default is overloaded (print mode) |
| `--betas LIST` | | Beta headers for API requests (API key users only) |

#### Permissions & Security
| Flag | Short | Description |
|------|-------|-------------|
| `--dangerously-skip-permissions` | | Skip ALL permission prompts (extreme caution) |
| `--allow-dangerously-skip-permissions` | | Enable bypass as option without activating |
| `--permission-mode MODE` | | `default`, `plan`, `acceptEdits`, `bypassPermissions`, `auto` |
| `--allowedTools TOOLS` | | Tools that execute without prompting |
| `--disallowedTools TOOLS` | | Tools removed from model context entirely |
| `--tools TOOLS` | | Restrict built-in tools (`""` to disable all) |
| `--permission-prompt-tool TOOL` | | MCP tool to handle permission prompts in non-interactive mode |

#### Output & Format
| Flag | Short | Description |
|------|-------|-------------|
| `--print` | `-p` | Non-interactive headless/SDK mode |
| `--output-format FORMAT` | | `text`, `json`, `stream-json` |
| `--input-format FORMAT` | | `text`, `stream-json` |
| `--json-schema SCHEMA` | | Get validated JSON matching schema (print mode) |
| `--include-partial-messages` | | Include partial streaming events (requires -p + stream-json) |
| `--verbose` | | Verbose logging with full turn-by-turn output |

#### System Prompt
| Flag | Short | Description |
|------|-------|-------------|
| `--system-prompt TEXT` | | Replace entire system prompt |
| `--system-prompt-file PATH` | | Load system prompt from file (print mode) |
| `--append-system-prompt TEXT` | | Append to default system prompt |
| `--append-system-prompt-file PATH` | | Append file contents to default prompt (print mode) |

#### Agent & Sub-Agent
| Flag | Short | Description |
|------|-------|-------------|
| `--agent NAME` | | Specify agent for session |
| `--agents JSON` | | Define custom sub-agents dynamically via JSON |
| `--teammate-mode MODE` | | Agent team display: `auto`, `in-process`, `tmux` |

#### MCP & Plugins
| Flag | Short | Description |
|------|-------|-------------|
| `--mcp-config PATH\|JSON` | | Load MCP servers from JSON file or string |
| `--strict-mcp-config` | | Only use MCP servers from --mcp-config, ignore others |
| `--plugin-dir PATH` | | Load plugins from directory (repeatable) |

#### Directory & Workspace
| Flag | Short | Description |
|------|-------|-------------|
| `--add-dir PATH` | | Add additional working directories |
| `--worktree` | `-w` | Start in isolated git worktree (branched from HEAD) |

#### Budget & Limits
| Flag | Short | Description |
|------|-------|-------------|
| `--max-budget-usd AMOUNT` | | Maximum dollar amount before stopping (print mode) |
| `--max-turns NUMBER` | | Limit agentic turns (print mode) |

#### Integration
| Flag | Short | Description |
|------|-------|-------------|
| `--chrome` | | Enable Chrome browser integration |
| `--no-chrome` | | Disable Chrome integration |
| `--ide` | | Auto-connect to IDE on startup |

#### Initialization & Maintenance
| Flag | Short | Description |
|------|-------|-------------|
| `--init` | | Run initialization hooks + start interactive mode |
| `--init-only` | | Run init hooks and exit (no interactive session) |
| `--maintenance` | | Run maintenance hooks and exit |

#### Debug & Diagnostics
| Flag | Short | Description |
|------|-------|-------------|
| `--debug CATEGORIES` | | Debug mode with optional category filter (e.g., `"api,hooks"`) |

#### Settings Override
| Flag | Short | Description |
|------|-------|-------------|
| `--settings PATH\|JSON` | | Path to settings JSON or JSON string |
| `--setting-sources LIST` | | Sources to load: `user`, `project`, `local` |
| `--disable-slash-commands` | | Disable all skills and slash commands |

#### Version & Help
| Flag | Short | Description |
|------|-------|-------------|
| `--version` | `-v` | Output version number |
| `--help` | `-h` | Show help |

### Claude Code Subcommands
| Subcommand | Description |
|------------|-------------|
| `claude` | Start interactive REPL |
| `claude "query"` | Start with initial prompt |
| `claude update` | Update to latest version |
| `claude mcp` | Configure MCP servers (add, remove, list, get, enable, disable) |
| `claude auth` | Manage authentication |
| `claude config` | Manage configuration |
| `claude doctor` | Health check and diagnostics |

### Claude Code Slash Commands (In-Session)
| Command | Description |
|---------|-------------|
| `/help` | List all available commands |
| `/compact [INSTRUCTIONS]` | Compress context (specify what to retain) |
| `/clear` | Clear conversation history |
| `/model` | Switch model |
| `/cost` | Show token consumption |
| `/exit` | End session |
| `/config` | Open configuration menu |
| `/permissions` | Manage tool permissions |
| `/effort` | Set model effort level |
| `/fast` | Toggle fast mode (speed-optimized API) |
| `/plan` | Toggle plan mode |
| `/rewind` | Undo changes (conversation-only or code-only rollback) |
| `/review` | Code review mode |
| `/remote-control [NAME]` | Start remote control session |
| `/loop` | Recurring tasks |
| `/mcp` | Manage MCP servers |

### Key Config Files (Claude Code)
- `~/.claude/CLAUDE.md` — Global instructions (all projects)
- `./CLAUDE.md` — Project-level instructions
- `.claude/settings.json` — Project settings
- `.claude/agents/` — Custom agent definitions (AGENT.md files)
- `.claude/skills/` — Custom skills (SKILL.md files)
- `.claude/commands/` — Custom slash commands
- `.claude/rules/` — Path-specific rules (loaded when touching matching files)

### Claude Code Environment Variables
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for authentication |
| `CLAUDE_CODE_MODEL` | Default model |
| `CLAUDE_CODE_PLUGIN_SEED_DIR` | Plugin seed directories (`:` separated on Unix) |
| `ENABLE_TOOL_SEARCH` | Auto-defer tool definitions (e.g., `auto:5`) |

---

## Implementation Slices (All Complete)

### Slice 1: Electron Shell + React Scaffold
- Electron main process with IPC bridge (`src/main/index.ts`)
- React 18 renderer with Tailwind CSS (`src/renderer/`)
- Window management, app chrome, sidebar navigation
- Route structure: Home (Dashboard), Work, Insights, Configure, Learn
- Layout with collapsible sidebar, CLI status indicators, workspace selector

### Slice 2: CLIManager Service (Core)
- Adapter pattern: `ICLIAdapter` interface (`src/main/cli/types.ts`)
- `CopilotAdapter` — spawns `copilot` CLI processes
- `ClaudeCodeAdapter` — spawns `claude` CLI processes
- `LocalModelAdapter` — HTTP adapter for Ollama / LM Studio
- Stream stdout/stderr parsing with ANSI stripping
- IPC events: `cli:output`, `cli:error`, `cli:exit`, `cli:turn-start`, `cli:turn-end`, `cli:permission-request`, `cli:usage`
- Process lifecycle management (start, stop, restart)
- Session persistence via electron-store (`clear-path-sessions.json`)
- Message log persistence (survives app restart, max 50 sessions / 500 msgs each)
- Cost estimation per turn with model-aware pricing

### Slice 3: Authentication Flow
- CLI installation detection via `which` / shell resolution (`src/main/auth/AuthManager.ts`)
- Auth status checking with TTL-based caching (5 min auth, 10 min install)
- **One-click install** for both CLIs via `npm install -g` spawned from main (`installCopilot()`, `installClaude()` in AuthManager), streamed to renderer through `auth:install-output` / `auth:install-complete` IPC events
- **Managed Node.js install** when Node < 22 detected: `winget install OpenJS.NodeJS.LTS` on Windows, official `.pkg` download+`open` on macOS (`installNodeManaged()`); falls back to opening `nodejs.org`
- Error classification for install failures: `EACCES` / `NETWORK` / `NODE_MISSING` / `UNKNOWN` with friendly UI hints (`src/renderer/src/types/install.ts`)
- Login modal with real-time output streaming AND browser auto-open: URL detection via `src/main/auth/urlDetector.ts` triggers `shell.openExternal()` once per session, renderer shows friendly "We opened your browser" panel with parsed device code
- `AuthStatusCard` hides install + connect CTAs entirely when CLI is already installed + authenticated
- Auth state stored in electron-store
- Support for GH_TOKEN / GITHUB_TOKEN / ANTHROPIC_API_KEY env vars
- Config file detection (~/.copilot/config.json, ~/.claude/.credentials.json)

### Slice 4: Agent Panel UI
- List available agents — built-in + custom file-based (`src/renderer/src/pages/Agents.tsx`)
- Toggle agents on/off with profile management
- Agent configuration (model, tools, permissions)
- Agent creation wizard (writes .agent.md files)
- Agent editor for modifying existing agents
- Visual agent cards with status indicators
- Profile save/apply for agent presets

### Slice 5: Session & Conversation UI
- Chat-style conversation display with markdown rendering (`react-markdown` + `remark-gfm` + `rehype-raw`)
- User messages as indigo bubbles, AI responses with rich markdown formatting
- Consecutive AI messages grouped into single bubbles
- Slash command autocomplete (Copilot + Claude command sets)
- Auto-resizing textarea input (Shift+Enter for newlines)
- Mode indicator (normal / plan / autopilot) with Shift+Tab cycling
- Session Manager modal — archive, delete, rename, regex search across all content
- Session dropdown limited to 5 most recent, "All" button opens full manager
- Session persistence and restore across app restarts
- Usage stats as clickable badges (not red error blocks)
- Thinking indicator with animated dots and elapsed timer
- Tool use, permission requests, errors, and status messages with distinct visual styles

### Slice 6: Memory & Context Manager
- CLAUDE.md / AGENTS.md file editor with CodeMirror (`src/renderer/src/components/memory/`)
- .github/copilot/settings.json editor
- Context usage visualization (token usage bar)
- Memory entries viewer (cross-session memory)
- Custom instructions editor
- New file creation wizard

### Slice 7: Tool & Permission Controls
- Visual toggles for tool permissions (`src/renderer/src/components/tools/`)
- Permission mode selector (default, plan, acceptEdits, auto, yolo for Copilot)
- --allowedTools / --disallowedTools configuration
- MCP server management moved to Slice 26 (Connections page)
- Permission request handler (intercept CLI permission prompts with Allow/Deny)
- Flag preview generation for CLI command export

### Slice 8: Sub-Agent Process Monitor
- List running sub-agents / background tasks (`src/renderer/src/pages/SubAgents.tsx`)
- Kill/pause/resume individual processes
- View sub-agent output streams in real-time
- Delegate task form (create background agent work)
- Task queue view with status tracking
- Fleet status dashboard
- `&prompt` and `/delegate` support from chat input

### Slice 9: Settings & Configuration
- CLI flag builder UI — toggle all flags visually (`src/renderer/src/components/settings/`)
- Model selector with availability info
- Budget/limits configuration (daily, weekly, monthly ceilings)
- MCP config editor
- Plugin manager
- Export/import configuration profiles (+ built-in starter profiles)
- Launch command preview (copy CLI command string)
- Environment variables editor
- Notification and webhook preferences

### Slice 10: Cost Tracking & Analytics
- Per-turn cost estimation with model-aware token pricing
- Cost records persisted to electron-store (`clear-path-cost.json`)
- Daily spend charts with Recharts
- Session cost breakdown, model usage breakdown
- Budget alerts with configurable thresholds (daily/weekly/monthly)
- Auto-pause at budget limits
- Usage badges in chat UI (clickable, expand to show turn details)

### Slice 11: Notification System
- NotificationManager with emit/dismiss/clear lifecycle (`src/main/notifications/`)
- Notification bell with unread count in sidebar
- Notification inbox with severity levels (error, warning, info, success)
- Notification preferences (per-type enable/disable)
- Webhook integration for external notification delivery
- Persisted to electron-store (`clear-path-notifications.json`, max 500)

### Slice 12: Knowledge Base
- File-based knowledge base stored in `.clear-path/knowledge-base/`
- Auto-generation from project analysis (10 section types)
- Section browsing and editing
- Full-text search with snippet extraction
- Q&A mode for querying knowledge base content

### Slice 13: Template System
- Template library with search and category filter (`src/renderer/src/components/templates/`)
- Template form for variable hydration (`{{varName}}` syntax)
- Template editor for create/edit
- Usage stats tracking
- Import/export functionality
- QuickCompose toolbar integration — pick template, fill variables, send to session
- Templates persisted to electron-store

### Slice 14: Skills System
- Skill creation with metadata (scope, CLI, triggers, tools, model)
- Enable/disable per-skill
- Skill wizard for guided creation
- Import/export skills
- Auto-invoke trigger configuration

### Slice 15: Onboarding & Learning
- First-run wizard for new users (`src/renderer/src/components/onboarding/`)
- CLI setup step uses **Install Now** buttons (opens `InstallModal`) in place of manual `npm install -g` instructions — chains install → login → authed without the user ever touching a terminal
- Guided tasks with step-by-step instructions
- Skill progression tracking
- Training tooltips and contextual help
- Explain button for in-app learning
- Learning center with structured content (`src/renderer/src/pages/Learn.tsx`)

### Slice 16: Compliance & Policy
- Audit logging for all actions (session, prompt, tool, file, config, policy)
- Security event tracking
- File pattern protection rules
- Policy editor with enforcement modes
- Compliance snapshot export
- Active policy badge in sidebar

### Slice 17: Git Workflow
- Git status panel with file change visualization (`src/renderer/src/components/git/`)
- PR builder UI
- Worktree manager for isolated branches

### Slice 18: Composer & Workflows
- Multi-step prompt workflow composition (`src/renderer/src/components/composer/`)
- Start from scratch or template
- Sequential and parallel step execution
- Sub-agent spawning with polling
- Prior step output as context for next step
- Workflow save/load

### Slice 19: Local Model Support
- Ollama integration — server detection, model listing, chat API (`src/main/cli/LocalModelAdapter.ts`)
- LM Studio integration — same interface
- HTTP-based adapter (not child_process)

### Slice 20: Dashboard & Workspaces
- Customizable dashboard with widget system (`src/renderer/src/pages/CustomDashboard.tsx`)
- Auth status cards for each CLI
- Multi-repo workspace management (`src/renderer/src/pages/Workspaces.tsx`)
- Broadcast prompts across workspaces
- Workspace activity feed

### Slice 21: Team Collaboration
- Config bundle sharing (`src/renderer/src/components/team/`)
- Shared folder sync
- Agent marketplace
- Team activity feed
- Setup wizard for team onboarding

### Slice 22: File Explorer
- File browsing with tree view (`src/renderer/src/pages/FileExplorer.tsx`)
- AI-powered actions (explain, review, generate tests, refactor)
- File watching for real-time updates
- Context menu integration

### Slice 23: Scheduler
- Cron-based task scheduling (`src/main/scheduler/SchedulerService.ts`)
- Job history with execution logs
- CLIManager integration for scheduled sessions
- Scheduled task management UI

### Slice 24: Voice Integration
- Voice command panel (`src/renderer/src/components/voice/`)
- Speech-to-text input
- Voice command mapping to app actions
- Audio notifications

### Slice 25: CLI Plugins Management
- `PluginManager` service auto-discovers plugins from each CLI's default install dir (`src/main/plugins/PluginManager.ts`)
  - Copilot: `~/.copilot/installed-plugins/<MARKETPLACE>/<PLUGIN>/plugin.json` (honors `COPILOT_HOME`)
  - Claude: `~/.claude/plugins/<PLUGIN>/.claude-plugin/plugin.json` (honors `CLAUDE_CODE_PLUGIN_CACHE_DIR`)
- Manifest formats differ per CLI; each plugin entry is locked to one CLI to avoid silent no-ops
- Custom local plugin paths supported with `auto` / `copilot` / `claude` classification (auto prefers Copilot if both manifests exist)
- Per-CLI enable/disable toggles persisted in `clear-path-plugins.json`
- IPC handlers (`src/main/ipc/pluginHandlers.ts`): `plugins:list`, `plugins:rescan`, `plugins:add-custom`, `plugins:remove-custom`, `plugins:set-enabled`, `plugins:open-folder`
- `CLIManager.startSession` and `spawnSubAgent` auto-inject `pluginDirs` from `pluginManager.getEnabledPaths(cli)` so every spawned session inherits the user's enabled plugins (caller-supplied `pluginDirs` always wins)
- Both adapters loop `options.pluginDirs ?? []` and emit one `--plugin-dir <path>` per entry (Claude formally repeatable; Copilot accepts the same shape)
- `PluginsManagement` page (`src/renderer/src/pages/PluginsManagement.tsx`) registered as Configure → Advanced → Plugins; two sections (Copilot, Claude), search, Rescan, Add Custom Path, per-row toggle, Open folder, Remove (custom only)
- Out of scope: running install commands from inside the app, marketplace browser, plugin authoring — users install via `copilot plugin install` or `/plugin install` then click Rescan
- Distinct from the in-app Extensions feature (`src/renderer/src/components/extensions/ExtensionManager.tsx`) which sandboxes UI add-ons in iframes

### Slice 26: Connections & MCP Management
- Dedicated `Connections` page with Catalog / Installed / Advanced tabs (`src/renderer/src/pages/Connections.tsx`)
- Registry + sync architecture: ClearPath owns `clear-path-mcps.json` (source of truth); `McpSyncService` renders to `~/.copilot/mcp-config.json`, `~/.claude/mcp-config.json`, and project-level variants (`.github/copilot/mcp-config.json`, `.claude/mcp-config.json`)
- Bundled curated catalog of 10 servers (filesystem, github, postgres, sqlite, slack, brave-search, puppeteer, fetch, google-drive, memory) at `src/main/mcp/catalog.json`
- OS-keychain-backed secrets via `McpSecretsVault` (Electron `safeStorage`), stored at `<userData>/mcp-secrets.json`; falls back to `unsafeMode` plaintext persistence when `safeStorage.isEncryptionAvailable()` is false (e.g., Linux without libsecret)
- Registry stores only `secretRefs` (env-var-name → vault-key pointers) — plaintext tokens never touch `clear-path-mcps.json`
- IPC surface (`src/main/ipc/mcpHandlers.ts`): `mcp:registry-list`, `mcp:registry-add`, `mcp:registry-update`, `mcp:registry-remove`, `mcp:registry-toggle`, `mcp:catalog-list`, `mcp:secrets-get-meta`, `mcp:sync-now`, `mcp:test-server`
- `mcp:test-server` spawns the MCP binary with a JSON-RPC `initialize` request on stdin, waits up to 5s for a valid response, reports success or stderr snippet, then SIGTERM/SIGKILLs the child
- External-changes detection compares rendered file mtimes against the last sync; on window focus a banner lets the user adopt the external edits (re-import) or overwrite them (re-sync)
- First-run `importExisting` walks the four native CLI paths and imports any pre-existing servers into the registry as `source: 'imported'` — idempotent, safe to re-run
- `McpManager.tsx` under Tools & Permissions remains as a thin redirect card pointing to Connections until the Tools tab entry is removed in a follow-up sweep

### Slice 27: ClearMemory Integration (opt-in, default OFF)
- Integrates [Clear Memory](https://github.com/greenpioneersolutions/clearmemory) — local Rust memory engine (HTTP REST on 8080 + MCP on 9700) — as an opt-in cross-session memory store. Gated behind feature flag `showClearMemory` (default `false` in [FeatureFlagContext.tsx](src/renderer/src/contexts/FeatureFlagContext.tsx))
- **Lifecycle owned by main process**: `ClearMemoryService` ([src/main/clearmemory/ClearMemoryService.ts](src/main/clearmemory/ClearMemoryService.ts)) — EventEmitter singleton, spawns `clearmemory serve --both --port 8080`, polls `/v1/health` every 500ms, auto-restarts up to 3× with 1s/3s/9s backoff, emits `state-change` / `init-progress` / `log` / `crashed` events. Binary resolved via [binaryResolver.ts](src/main/clearmemory/binaryResolver.ts) (bundled → PATH fallback → `missing` status)
- **Upstream CLI quirks to remember** (verified against `main.rs`, do NOT invent flags):
  - `serve` accepts ONLY `--http`, `--both`, `--port` — no `--mcp-port` (hardcoded to 9700) and no `--config-dir` (hardcoded to `~/.clearmemory/`)
  - **No `config set` subcommand** — mutations happen via direct TOML write in [configFile.ts](src/main/clearmemory/configFile.ts) with round-trip preservation of unknown keys + comments + atomic `.tmp` + `rename`
  - `reflect` is a placeholder upstream (prints `Reflect: <query>` or "Tier 2+ required"); UI is wired but synthesis improves when upstream lands it
  - Streams have no `delete` or `rename` — UI shows "coming soon" tooltips
  - `auth create` output is plain text with a `Raw:   <token>` line (NOT JSON); `extractTokenFromStdout` tolerates both
- **UI surface** ([src/renderer/src/pages/ClearMemory.tsx](src/renderer/src/pages/ClearMemory.tsx) + [src/renderer/src/components/clearmemory/](src/renderer/src/components/clearmemory/)): 8 tabs — Browse · Tags · Streams · Import · Reflect · Status · Config · Backup — plus a page-header "+ New memory" button. `EnableGate` wraps every tab; flipping the flag triggers `clearmemory:enable` → `ensureInitialized(tier)` → `start()` and streams model-download progress
- **IPC surface** ([src/main/ipc/clearMemoryHandlers.ts](src/main/ipc/clearMemoryHandlers.ts)) — 33 channels, every one real (no stubs). CRUD handlers return `Result<T>` envelope (`{ok:true, data}` or `{ok:false, error, state}`); service-not-ready short-circuits gracefully, never throws to the renderer. Namespace: `clearmemory:*`
- **MCP auto-registration** ([mcpIntegration.ts](src/main/clearmemory/mcpIntegration.ts)): on enable, merges `clearmemory` entry into `~/.claude/mcp.json` and `~/.copilot/mcp-config.json` without clobbering other servers or top-level keys; on disable, removes only that entry. Atomic `.tmp` + `rename`; tolerant of corrupted JSON (rewrites from scratch)
- **Security**: HTTP calls pinned to `127.0.0.1:8080`; bearer token lives only in main process; memory IDs validated (no `..`/`/`/`\0`/whitespace/>256 chars) AND URL-encoded before interpolation; import paths pass through `expandTilde` → `isSensitiveSystemPath` → `assertPathWithinRoots(getImportAllowedRoots())` (home / cwd / tmpdir). Restore requires typing "RESTORE"
- **Shared types** at [src/shared/clearmemory/types.ts](src/shared/clearmemory/types.ts) — reachable from both main and renderer via `rootDirs` in `tsconfig.main.json` / `tsconfig.renderer.json`. Client helpers live at [src/renderer/src/lib/clearmemoryClient.ts](src/renderer/src/lib/clearmemoryClient.ts)
- **Tests**: [ClearMemoryService.test.ts](src/main/clearmemory/ClearMemoryService.test.ts), [configFile.test.ts](src/main/clearmemory/configFile.test.ts), [mcpIntegration.test.ts](src/main/clearmemory/mcpIntegration.test.ts), [clearMemoryHandlers.test.ts](src/main/ipc/clearMemoryHandlers.test.ts) — 69 tests covering parsers, TOML round-trip, MCP merge-don't-clobber, service-not-ready envelopes, ID/path/format/stream validation, tilde expansion
- **Binary bundling (Slice F)** — BLOCKED: upstream repo has 0 GitHub Releases. PATH fallback + `missing-binary` status banner + install CTA (`cargo install clearmemory`) cover today. When upstream publishes releases, drop in `scripts/fetch-clearmemory-binary.ts` (postinstall) and add `extraResources` to `package.json`'s `build` block

---

## CLIManager Core Pattern

```typescript
interface ICLIAdapter {
  readonly cliName: string;
  readonly binaryPath: string;
  
  isInstalled(): Promise<boolean>;
  isAuthenticated(): Promise<boolean>;
  authenticate(): Promise<void>;
  
  buildArgs(options: SessionOptions): string[];
  parseOutput(data: string): ParsedOutput;
  
  startSession(options: SessionOptions): ChildProcess;
  sendInput(process: ChildProcess, input: string): void;
  sendSlashCommand(process: ChildProcess, command: string): void;
}

interface SessionOptions {
  prompt?: string;
  model?: string;
  mode: 'interactive' | 'prompt';
  permissionMode?: string;
  allowedTools?: string[];
  excludedTools?: string[];
  agent?: string;
  agents?: Record<string, AgentConfig>;
  mcpConfig?: string;
  workingDirectory?: string;
  additionalDirs?: string[];
  maxBudget?: number;
  maxTurns?: number;
  experimental?: boolean;
  flags?: Record<string, string | boolean>;  // catch-all for any flag
}

interface ParsedOutput {
  type: 'text' | 'tool-use' | 'permission-request' | 'error' | 'status' | 'thinking';
  content: string;
  metadata?: Record<string, any>;
}

interface AgentConfig {
  description: string;
  prompt?: string;
  tools?: string[];
  model?: string;
}
```

## Key Design Decisions
1. **Copilot First**: All UI defaults target Copilot CLI. Claude Code is secondary adapter. Local models are tertiary.
2. **Flag Completeness**: Every CLI flag has a corresponding UI control — no flags left out.
3. **Adapter Pattern**: Adding new CLI backends = new adapter implementing `ICLIAdapter`, no UI changes. Three adapters exist (Copilot, Claude, LocalModel).
4. **No Token Storage**: Leverage existing CLI auth. App never handles raw tokens directly.
5. **Process Isolation**: Each session = separate child process. Clean lifecycle management.
6. **Config Export**: All settings exportable as CLI command string for power users to copy/paste.
7. **Chat-First UX**: Conversation UI renders AI markdown (bold, code, tables, lists) — not a terminal emulator.
8. **Full Persistence**: Sessions, settings, costs, notifications all persist across app restarts via electron-store. No external database.
9. **Non-Technical Users**: Design for managers and non-developers. Red = errors only, not informational. Usage stats are opt-in clicks, not in-your-face.

