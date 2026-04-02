# Changelog

All notable changes to ClearPathAI will be documented in this file.

## [1.1.2] - 2026-04-02

### Fixed
- **GitHub Actions release job** — Reverted `softprops/action-gh-release` to v2 (v3 does not exist). Node.js 24 compatibility handled via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env var

## [1.1.1] - 2026-04-02

### Fixed
- **GitHub Actions Node.js 24 compatibility** — Bumped actions to v5 (`checkout`, `setup-node`, `upload-artifact`, `download-artifact`). Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env var to eliminate deprecation warnings
- **macOS download instructions** — Added `xattr -cr` command to README for clearing quarantine flag on unsigned `.dmg` downloads ("damaged and can't be opened" error)

## [1.1.0] - 2026-04-02

### Added
- **CI/CD release pipeline** — GitHub Actions workflow builds macOS (.dmg), Windows (.exe), and Linux (.AppImage) installers automatically on version tag push
- **Dashboard widgets fully functional** — All 13 widgets now display real data:
  - Recent Sessions widget shows last 5 sessions with status and timestamps
  - Schedule Overview shows enabled jobs with last execution status
  - Token Usage displays total tokens, session count, and input/output split bar
  - Repo Status shows current branch, staged/modified/untracked file counts
  - Security Events shows compliance alerts with severity indicators (or green "All Clear" shield)
  - Workspace Activity shows configured workspaces with repo counts
  - Quick Launch buttons now navigate to actual pages
  - Notification Feed shows severity dots and relative timestamps
  - Policy Status shows colored enforcement indicator

### Changed
- **README rewritten** — Added origin story explaining the enterprise problem ClearPathAI solves, download section with platform table, build-from-source instructions, and brand assets section
- Quick Prompt widget now shows confirmation feedback after starting a session
- Policy Status widget shows colored dot (green/yellow/red) based on enforcement level
- Notification Feed widget shows severity-colored dots and time-ago timestamps

## [1.0.0] - 2026-04-02

### Added
- **Electron shell** with React 18, TypeScript, and Tailwind CSS
- **CLIManager service** with adapter pattern — Copilot, Claude Code, and Local Model (Ollama/LM Studio) adapters
- **Chat-style conversation UI** with markdown rendering (react-markdown + remark-gfm + rehype-raw), user/AI message bubbles, grouped consecutive messages
- **Session persistence** — message logs survive app restart via electron-store (max 50 sessions, 500 messages each)
- **Session Manager** — archive, delete, rename, regex search across all session content
- **Cost tracking** — per-turn token estimation, budget alerts, usage badges in chat (clickable, not intrusive)
- **Authentication flow** — CLI detection, auth status with TTL caching, login modal
- **Agent management** — built-in + custom agents, creation wizard, profile presets
- **Tool & permission controls** — visual toggles, permission mode selector, MCP server management
- **Sub-agent process monitor** — spawn, kill, pause, resume, output viewer, fleet status
- **Settings** — CLI flag builder, model selector, budget limits, env vars editor, config profiles, launch command preview
- **Notification system** — bell inbox, severity levels, webhook integration, persisted history
- **Knowledge base** — auto-generated from project analysis, full-text search, Q&A mode
- **Template system** — library with variable hydration, usage stats, QuickCompose toolbar integration
- **Skills system** — creation wizard, enable/disable, import/export
- **Schedule tab in Work page** — create custom schedules or schedule a template, cron presets, execution history
- **Onboarding** — first-run wizard, guided tasks, skill progression, training tooltips
- **Compliance & policy** — audit logging, file protection, policy editor, compliance snapshot export
- **Git workflow** — status panel, PR builder, worktree manager
- **Composer** — multi-step workflow builder with sequential/parallel execution
- **Dashboard** — customizable widget layout with 13 widget types
- **Voice integration** — speech-to-text, voice commands, audio notifications
- **Team collaboration** — config bundles, shared folder sync, agent marketplace
- **File explorer** — tree view, AI actions (explain, review, tests, refactor)
- **Workspaces** — multi-repo management, broadcast prompts
- **Brand assets** — compass logo (SVG), app icons (.icns/.ico/.png), GitHub banner
- **MIT License**

### Security
- No hardcoded API keys or secrets in source code
- `.claude/settings.local.json` removed from git tracking (contains personal paths)
- `.clear-path/` knowledge base excluded from version control
- Comprehensive `.gitignore` covering env files, IDE settings, OS files, build artifacts
