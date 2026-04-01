# CoPilot Commander — Electron GUI for CLI AI Agents

## Project Overview
CoPilot Commander is an Electron + React + TypeScript application that provides a manager-friendly GUI wrapper around **GitHub Copilot CLI** (primary) and **Claude Code CLI** (secondary). Non-technical users never touch the terminal — the app spawns, manages, and parses CLI processes behind a polished UI.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Electron App                    │
│  ┌───────────────────────────────────────────┐  │
│  │           React Renderer (UI)             │  │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐  │  │
│  │  │ Agent   │ │ Session  │ │ Memory &  │  │  │
│  │  │ Panel   │ │ Viewer   │ │ Context   │  │  │
│  │  └─────────┘ └──────────┘ └───────────┘  │  │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐  │  │
│  │  │ Tool    │ │ Model    │ │ Sub-Agent │  │  │
│  │  │ Toggles │ │ Selector │ │ Monitor   │  │  │
│  │  └─────────┘ └──────────┘ └───────────┘  │  │
│  └──────────────────┬────────────────────────┘  │
│                     │ IPC Bridge                 │
│  ┌──────────────────┴────────────────────────┐  │
│  │         Main Process (Node.js)            │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │        CLIManager Service           │  │  │
│  │  │  ┌───────────┐  ┌───────────────┐   │  │  │
│  │  │  │ Copilot   │  │ Claude Code   │   │  │  │
│  │  │  │ Adapter   │  │ Adapter       │   │  │  │
│  │  │  └───────────┘  └───────────────┘   │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  │  ┌──────────┐ ┌────────────┐ ┌─────────┐ │  │
│  │  │ Auth     │ │ Config     │ │ Process │ │  │
│  │  │ Manager  │ │ Manager    │ │ Monitor │ │  │
│  │  └──────────┘ └────────────┘ └─────────┘ │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
┌─────────────────┐    ┌─────────────────────┐
│ copilot CLI     │    │ claude CLI          │
│ (child_process) │    │ (child_process)     │
└─────────────────┘    └─────────────────────┘
```

## Tech Stack
- **Electron** (latest) — Desktop shell
- **React 18+** with TypeScript — Renderer UI
- **Tailwind CSS** — Styling
- **Node.js child_process** — CLI spawning/management
- **electron-store** — Persistent settings
- **xterm.js** — Optional embedded terminal view

## Conventions
- TypeScript strict mode throughout
- All CLI interactions go through CLIManager service with adapter pattern
- IPC bridge for main ↔ renderer communication
- Tailwind for all styling, no CSS modules
- Feature-based folder structure under `src/`

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

## Implementation Slices

### Slice 1: Electron Shell + React Scaffold
- Electron main process with IPC bridge
- React renderer with Tailwind
- Basic window management, app chrome
- Route structure: Dashboard, Sessions, Settings

### Slice 2: CLIManager Service (Core)
- Adapter pattern: `ICLIAdapter` interface
- `CopilotAdapter` — spawns `copilot` CLI processes
- `ClaudeCodeAdapter` — spawns `claude` CLI processes
- Stream stdout/stderr parsing
- IPC events: `cli-output`, `cli-error`, `cli-exit`, `cli-permission-request`
- Process lifecycle management (start, stop, restart)

### Slice 3: Authentication Flow
- Check if `copilot` / `claude` are installed (which/where)
- Check auth status for each CLI
- Prompt login flow if needed
- Store auth state in electron-store
- Support GH_TOKEN / GITHUB_TOKEN / ANTHROPIC_API_KEY env vars

### Slice 4: Agent Panel UI
- List available agents (built-in + custom)
- Toggle agents on/off
- Agent configuration (model, tools, permissions)
- Create new agent via wizard (writes .agent.md / AGENTS.md)
- Visual agent cards with status indicators

### Slice 5: Session & Conversation UI
- Streaming output display (parsed from CLI stdout)
- Input box with slash command autocomplete
- Mode indicator (normal / plan / autopilot)
- Session history browser
- Resume/continue session controls

### Slice 6: Memory & Context Manager
- CLAUDE.md / AGENTS.md file editor (in-app)
- .github/copilot/settings.json editor
- Context usage visualization (token usage bar)
- Memory entries viewer (cross-session memory)
- Custom instructions editor

### Slice 7: Tool & Permission Controls
- Visual toggles for tool permissions
- Permission mode selector (default, plan, acceptEdits, auto, yolo)
- --allowedTools / --disallowedTools configuration
- MCP server management UI
- Permission request handler (intercept CLI permission prompts)

### Slice 8: Sub-Agent Process Monitor
- List running sub-agents / background tasks
- Kill/pause individual processes
- View sub-agent output streams
- Delegate task UI (create background agent work)
- /fleet status dashboard

### Slice 9: Settings & Configuration
- CLI flag builder UI (toggle all flags visually)
- Model selector with availability info
- Budget/limits configuration
- MCP config editor
- Plugin manager
- Export/import configuration profiles

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
1. **Copilot First**: All UI defaults target Copilot CLI. Claude Code is secondary adapter.
2. **Flag Completeness**: Every CLI flag has a corresponding UI control — no flags left out.
3. **Adapter Pattern**: Adding new CLI backends (e.g., Cursor, Aider) = new adapter, no UI changes.
4. **No Token Storage**: Leverage existing CLI auth. App never handles raw tokens directly.
5. **Process Isolation**: Each session = separate child process. Clean lifecycle management.
6. **Config Export**: All settings exportable as CLI command string for power users to copy/paste.
