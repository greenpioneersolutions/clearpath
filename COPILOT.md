# ClearPathAI — Copilot instructions for GitHub Copilot CLI

## Purpose
This file provides repository-level guidance and default instructions for the GitHub Copilot CLI (copilot). It mirrors the project CLAUDE.md so both CLIs have parity where applicable.

## Installation & Auth
- Install: `npm install -g @github/copilot` (requires Node.js 22+)
- Also via: Homebrew (`brew install copilot-cli`), WinGet, or the official installer
- Auth: `/login` slash command or via `GH_TOKEN` / `GITHUB_TOKEN` env vars
- PAT auth: Fine-grained PAT with "Copilot Requests" permission
- CI/CD auth: Set `GITHUB_ASKPASS` to an executable that returns a token
- Entry point: `copilot` (also available as `gh copilot` via GitHub CLI)
- Default model: Claude Sonnet 4.5 (configurable via --model)

## All CLI Flags (summary)

### Mode & Behavior
- `--experimental` / `--no-experimental` — toggle experimental features (autopilot, dynamic retrieval)
- `--prompt` / `-p` — headless prompt mode (non-interactive)
- `--acp` — start as Agent Client Protocol server
- `--banner` — show startup banner

### Session Management
- `--resume [SESSION_ID|TASK_ID]` — continue previous session or open picker
- `--continue` — resume most-recent session
- `--config-dir PATH` — override default config dir (`~/.copilot`)

### Tool & Permission Control
- `--yolo` / `--allow-all` — auto-approve tool permissions
- `--allow-tool PATTERN`, `--deny-tool PATTERN` — fine-grained tool allow/deny
- `--available-tools`, `--excluded-tools` — filter tools visible to the agent

### Model & Agent
- `--model MODEL_NAME` — set model (e.g., `claude-sonnet-4.5`, `gpt-5.2`)
- `--agent AGENT_NAME` — invoke a named agent

### UI & Accessibility
- `--alt-screen [on|off]` — alternate screen buffer
- `--screen-reader` — accessibility optimizations
- `--streamer-mode` — hide model names and quota

### MCP & Extensions
- `--enable-all-github-mcp-tools` — enable full MCP tool suite
- `--additional-mcp-config PATH` — add MCP servers for single session
- `--plugin-dir PATH` — load plugin(s) from local path(s)

### Output & Logging
- `--output-format FORMAT` — e.g., `json`
- `--save-gist` — save session as a gist
- `--stream` — token-by-token streaming
- `--bash-env` — source BASH_ENV for spawned shells

### Help
- `--help` — show help
- `--version` — show version

## Slash Commands (In-Session)

### Session & Context
- `/clear` — wipe session context
- `/compact` — compress context (auto triggers at token limits)
- `/context` — show token usage breakdown
- `/usage` — session statistics
- `/session` — session info
- `/exit` — end session

### Model & Mode
- `/model` — switch models mid-session
- `/experimental [on|off]` — toggle experimental
- `Shift+Tab` — cycle modes (normal → plan → autopilot)

### Directory & Files
- `/cwd PATH` or `/cd PATH` — change working directory
- `/add-dir PATH` — grant access to additional directory
- `/list-dirs`, `/list-files` — show accessible folders/files

### Permissions
- `/allow-all`, `/yolo` — approve permissions for session

### GitHub Integration
- `/login` — authenticate with GitHub
- `/delegate [PROMPT]` — create remote coding session / PR
- `/review` — analyze code changes

### Shell & Advanced
- `!COMMAND` — run shell command directly
- `&PROMPT` — delegate prompt to background coding agent
- `/fleet` — coordinate sub-agents
- `/help` — in-session help

## Configuration Precedence
1. Command-line flags (highest)
2. Environment variables (`GH_TOKEN`, `GITHUB_TOKEN`, `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`)
3. Repository configuration (`.github/copilot/settings.json`)
4. Local overrides (`.github/copilot/settings.local.json`)
5. User configuration (`~/.copilot/config`)

## Key Config Files
- `~/.copilot/config` — user settings
- `.github/copilot/settings.json` — repo-level settings
- `.github/copilot/settings.local.json` — local overrides (gitignored)
- `~/.copilot/mcp-config.json` — MCP server config
- `AGENTS.md` / `.agent.md` — agent definitions and prompts

## Built-in Specialized Agents
- Explore — fast codebase analysis
- Task — run builds & tests
- Code Review — review changes
- Plan — implementation planning

## Memory & Context Behavior
- Repository memory and cross-session memory supported
- Auto-compaction at high token usage

## Project-level guidance
Place repo-specific Copilot instructions or agent definitions in `.github/copilot/` or project-root COPILOT.md/AGENTS.md so the Copilot CLI picks up project defaults. Local overrides should be stored in `.github/copilot/settings.local.json` and kept out of version control.

## Notes for ClearPath integration
- The ClearPath app expects Copilot config files in the same locations used by the CLI (`~/.copilot`, `.github/copilot/`).
- When designing UI controls for flags, map each UI toggle to the equivalent CLI flag for consistent behavior and exportable launch strings.
- Respect JSONC parsing for `~/.copilot/config` (supports comment banners).

---

This COPILOT.md is intended to remain in parity with the project's CLAUDE.md. Update both files together when adding flags, agents, or behavior that affects either CLI adapter.
