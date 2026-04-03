# Changelog

All notable changes to ClearPathAI will be documented in this file.

## [1.2.0] - 2026-04-03

### Added
- **Session Wizard** — Guided step-by-step prompt builder in the Work page. Three configurable options (Accomplish a Task, Ask a Question, Review Something) plus a fixed "Use Context" option. Walks non-technical users through persona, goal, process, and verification fields, then assembles a structured prompt. First-time users land on the Wizard tab automatically
- **Use Context in Wizard** — Browse and select saved memories, agents, and skills from within the wizard. Tabbed picker with search, pagination, and selection summary. Selected context is injected into the generated prompt
- **Wizard Settings** — Full configuration editor in Configure → Wizard. Customize title, initial question, add/remove/edit options, modify fields per option, and edit prompt templates with {{variable}} placeholders. Reset to defaults button
- **Notes / Memory System** — App-managed notes stored in electron-store with title, content, tags, categories (meeting, conversation, reference, outcome, idea, custom), pinning, and session source tracking. Full CRUD via `notes:*` IPC handlers
- **Notes Manager UI** — Browse, create, edit, delete notes in Configure → Memory → Notes tab (now default) and Work → Memory tab. Search, category filter, tag filter pills, pagination (10 per page), pin/unpin
- **Save AI Response as Memory** — Hover any AI response bubble to see a "Save as Memory" bookmark button. Opens a modal to set title, category, and tags before saving
- **Memory Picker in Sessions** — Bookmark button above the chat input opens a dropdown to select notes. Selected memories are silently prepended as context to the next prompt. Attachment file counts shown
- **Text File Attachments on Notes** — Attach .txt, .md, .csv, .json, code files, and other text files to notes. Native file picker with binary detection and 500KB limit. Attached file contents are read from disk at prompt-injection time and included alongside note content
- **GitHub Integration** — Real GitHub API connection via Octokit in Configure → Integrations. Connect with a PAT, then browse repos, pull requests, and issues in the Work Items panel. Click any PR or issue to inject its details into the active session
- **Welcome Back Screen** — Replaces the awkward "Session Complete" overlay. Shows a clean centered screen with prominent "Start New Session" button and up to 5 recent session cards with View/Continue actions
- **Enterprise Guide** — Comprehensive ENTERPRISE.md covering architecture, security model, data residency, compliance, deployment options, authentication, policy framework, cost governance, team onboarding, air-gapped deployment, customization, FAQ, and getting started checklist
- **Learning Center Content Overhaul** — Rewrote all 135+ lessons across 5 learning paths with real content for non-technical users. Walkthroughs with numbered steps and key takeaways, guided tasks with success checks, interactive knowledge checks with answer validation and explanations
- **Workspace Enhancements** — Clone repos from URL (git clone to ~/ClearPath-repos/), workspace settings tab with name/description editing, improved repo cards, select-all in broadcast, better empty states
- **Memory tab in Work page** — Notes manager accessible directly from the Work header tabs (Session, Wizard, Compose, Schedule, Memory)

### Changed
- **Message Display** — AI responses from different turns no longer merge into one giant bubble. Grouping now uses a 2-second time window to only merge streaming fragments. Timestamps shown on all messages (user and AI)
- **Composer Session Targeting** — Banner at top of Compose mode lets you choose "New Session" (default) or "Current Session". No more silently dumping composed output into the active session
- **README Enterprise Section** — Expanded from 5 bullet points to a detailed table with 8 capabilities, narrative positioning, and link to ENTERPRISE.md
- **Learning Center Renderer** — Lesson view now renders real content: walkthrough steps with tips, guided task cards with progress bars, interactive quiz with per-question feedback and scoring. Falls back gracefully for lessons without content

### Fixed
- **File attachment dialog on macOS** — Pass focused BrowserWindow to dialog.showOpenDialog to prevent the native file picker from failing silently
- **Wizard context loading** — Corrected IPC channel names (agent:list not agents:list) and added required workingDirectory arguments for agent and skill listing

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
