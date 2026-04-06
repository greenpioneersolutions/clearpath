# Changelog

All notable changes to ClearPathAI will be documented in this file.

## [1.5.0] - 2026-04-06

### Added
- **Accessibility Settings** — New "Accessibility" tab in Configure with font scaling (85%–150%), reduced motion (syncs with OS preference), high contrast mode, focus indicator style (ring/outline/both), screen reader mode, and keyboard shortcut reference table. Settings persist via encrypted electron-store
- **Skip-to-Content Link** — Hidden link appears on Tab, jumps past sidebar to main content
- **Route Announcer** — Screen readers announce page name on every navigation via `aria-live` region
- **Focus Trap Hook** — Reusable `useFocusTrap` for modals — traps Tab/Shift+Tab, restores focus on close
- **Keyboard Shortcuts** — `?` opens shortcut reference, `Ctrl/Cmd+1-5` navigates to screens, `Ctrl/Cmd+/` focuses chat input, `Ctrl/Cmd+,` opens Configure. Togglable in Accessibility settings
- **Auto-Updater** — `electron-updater` checks GitHub Releases on launch, downloads in background, shows banner with "Restart Now" / "Later" when update is ready
- **Agents Tab in Configure** — Full agent management (create/edit/delete/toggle/profiles) accessible from Configure alongside Memory, Skills
- **Notification Deep-Linking** — Clicking notifications navigates to the relevant page, panel, and session. Budget alerts → Insights, policy violations → Configure > Policies, session errors → Work, schedule results → Configure > Scheduler
- **URL Deep-Linking** — Work page parses `?panel=X`, `?tab=X`, and location state `{ sessionId }`. Configure and Insights parse `?tab=X` for direct tab navigation
- **Context Nudge on Home** — When no memories, agents, or skills exist, Home shows quick-create cards linking to Configure > Memory, Agents, Skills

### Changed
- **Home Page Redesign** — Simplified to 4 outcome-focused cards: "Ask a question or get guidance" (→ wizard question step), "Write or do something" (→ wizard context step), "Explore what I can do" (→ Learning Center), "Set up my workspace" (→ Configure). Quick prompt input at top. Recent sessions only shown when they exist. Context counts displayed dynamically
- **Model Lists Expanded** — Copilot: 7 → 18 models organized by cost tier (Free/0.33x/1x/3x) with provider, description. Claude: 3 models with $/1M token pricing. Default changed to GPT-5 Mini (free) for Copilot, Sonnet for Claude
- **ModelSelector UI** — Cards grouped by cost tier with colored badges. Each model shows provider, cost, and description
- **Sidebar Restructured** — Configure moved to bottom of nav (separated by divider). Main nav: Home, Work, Insights, Learn. Custom uploaded logos now display in sidebar (both collapsed and expanded states)
- **Feature Flag Defaults** — Simplified starter experience: Composer, Scheduler, Sub-Agents, Knowledge Base, Voice, Compliance Logs, Plugins, Env Vars, Webhooks all default OFF. Core features (Session, Wizard, Memory, Skills, Templates) stay ON
- **Work Page Feature Flags** — Mode tabs (Wizard, Compose, Schedule, Memory) and panel icons (Agents, Templates, Skills, Sub-Agents) now respect feature flags. Disabled features are hidden, not just non-functional
- **Wizard Deep-Linking** — SessionWizard accepts `initialOptionId` and `initialStep` props to skip directly to a specific wizard option or the context step from the Home page
- **Work Page Removed Panels** — File Explorer, Git/PR Builder, and Knowledge Base panels removed from Work page toolbar

### Fixed
- **Dark Mode Input Visibility** — Global CSS form rules for `input`, `textarea`, `select` now inherit brand colors. `bg-gray-900` inputs added to dark-theme exception list. `text-gray-200`/`text-gray-100` no longer remapped to brand variables (they're light-on-dark text)
- **Launch Command Preview** — Switched from Tailwind classes (which get remapped) to inline hex colors. Always renders as light text on dark terminal background regardless of theme
- **Sidebar Learn Link** — Was missing `style` prop for brand colors, invisible on dark sidebar. Now matches all other nav items
- **MemoryViewer Inputs** — Changed from dark-themed classes to standard light classes (component renders on light Configure page, not dark Work page)
- **Work Page Scroll** — Added `min-h-0` to content column and `overflow-y-auto` to Compose/Schedule wrappers. Switching between Wizard and Session no longer locks the view

### Accessibility
- **ARIA Landmarks** — Sidebar: `role="navigation"`, `aria-label`. Main: `role="main"`, `id="main-content"`. Update banner: `role="status"`
- **Modal ARIA** — 4 modals (NewSession, Login, NotificationInbox, SessionManager) now have `role="dialog"`, `aria-modal`, `aria-labelledby`, and focus traps
- **Toggle Switches** — 12 files updated: every custom toggle has `role="switch"`, `aria-checked`, `aria-label`
- **Form Labels** — Priority inputs across CommandInput, HomeHub, Configure, NewSessionModal, SessionManager now have `aria-label` or `htmlFor`/`id` pairings
- **Color-Independent Status** — ScoreBadge shows text label for screen readers. CLI status dots and NotificationBell have descriptive `aria-label`. Notification unread badge `aria-hidden`
- **Tab Panel ARIA** — Configure page tabs: `role="tablist"`, `role="tab"` + `aria-selected`, `role="tabpanel"` + `aria-labelledby`
- **Model Selector** — `role="radiogroup"` on grid, `role="radio"` + `aria-checked` on cards
- **Chat Log** — OutputDisplay: `role="log"`, `aria-label`, `aria-live="polite"`
- **Chart Accessibility** — All 4 Recharts components wrapped in `<figure>` with `<figcaption>`, `role="img"`, `aria-label`
- **Heading Hierarchy** — Sidebar wordmark changed from `<h1>` to `<div>`
- **Reduced Motion CSS** — `.a11y-reduced-motion` kills all animation/transition. `@media (prefers-reduced-motion)` fallback
- **High Contrast CSS** — Overrides brand text/border variables for maximum readability (light and dark mode)
- **Focus Indicator CSS** — 3 configurable styles on `:focus-visible` (ring, outline, both)
- **`.sr-only` Utility** — Screen-reader-only class for hidden descriptive text

## [1.4.0] - 2026-04-06

### Added
- **PR Scores (Experimental)** — New top-level page for scoring GitHub pull requests 0-100 using the `pull-request-score` package. Browse repos, view PR list with dates/authors/line changes, score individual or batch PRs, drill into score breakdowns, and view repo-level dashboard with charts (score distribution, trend, author comparison, cycle time). AI Review button pipes scored PR context into a CLI session for AI-powered code review. Gated behind `enableExperimentalFeatures` + `showPrScores` feature flags
- **Starter Pack** — 6 production-ready agents (Communication Coach, Research Analyst, Chief of Staff, Strategy & Decision Partner, Technical Reviewer, Document Builder) with full system prompts. 7 skills (Audience & Tone Rewrite, Research Brief, Meeting-to-Action, Priority Planner, Feedback Prep, Document Builder, Concept Explainer). 5 memory schemas for team context. 6 prompt suggestions surfaced in Home Hub and Welcome Back. Agent handoff architecture with keyword-based trigger matching and context transfer
- **Token-First Analytics** — Insights page defaults to token counts (enterprise perspective) with a toggle to switch to monetary view. Token-based budget ceilings (daily/weekly/monthly) alongside monetary budgets. Display mode persisted across sessions
- **Feature Flag System** — 3 new experimental flags (`enableExperimentalFeatures`, `showPrScores`, `prScoresAiReview`) with compound flag checks for nav items. Sidebar items support `requiredFlags` array — all flags must be true for the item to show

### Security
- **OS Keychain Credential Storage** — GitHub tokens and sensitive env vars encrypted via Electron's `safeStorage` API (macOS Keychain, Windows DPAPI, Linux libsecret). No plaintext token storage. Automatic migration of legacy plaintext secrets on startup
- **Content Security Policy** — CSP headers on all responses: `script-src 'self'` in production (blocks inline script injection), restricted `connect-src`, `frame-ancestors 'none'`, `object-src 'none'`. Dev mode allows inline scripts for Vite HMR only
- **Encryption at Rest** — All electron-store data encrypted with machine-derived AES key (homedir + hostname + username). Integrity check warns if key changes
- **IPC Channel Whitelist** — Preload script enforces explicit whitelist of ~170 allowed IPC channels. Unknown channels rejected with error. Prevents XSS-to-IPC escalation
- **Path Traversal Prevention** — `assertPathWithinRoots()` validates and resolves symlinks. Sensitive system paths blocked (`.ssh`, `.aws`, `.gnupg`, `/etc`)
- **Shell Injection Prevention** — CLI binary resolution uses `command -v "$1"` with positional args instead of string interpolation. Binary names validated with regex. Terminal opening uses `execFile()` array args
- **SSRF Protection** — Webhook URLs restricted to HTTPS only. Private IPs, localhost, and cloud metadata endpoints blocked
- **Rate Limiting** — Sliding-window limits on session creation (5/min), sub-agent spawning (10/min), webhook testing (5/min), data deletion (1/min), and git operations (30/min)
- **MCP Command Validation** — Server commands checked against blocked patterns (`rm -rf`, `curl | sh`, `eval`, etc.) and shell metacharacter injection
- **XSS Prevention** — Switched markdown rendering from `rehype-raw` to `rehype-sanitize`. AI output cannot inject scripts or iframes
- **Scoped Environment Variables** — Each CLI adapter receives only the secrets it needs (Copilot: `GH_TOKEN`; Claude: `ANTHROPIC_API_KEY`; Local: none)
- **Audit Log Integrity** — Compliance logs can no longer be cleared from the UI. Overflow entries archived to JSONL files instead of discarded. Config bundle sharing uses HMAC-SHA256 signing
- **Centralized Logger** — All `console.log` calls in main process replaced with level-gated logger (debug/info/warn/error). Production defaults to warn. Controlled via `CLEARPATH_LOG_LEVEL` env var

### Changed
- **GitHub Integration Logging** — Full request/response logging across all GitHub API handlers (repos, pulls, issues, search). Token retrieval diagnostics, rate limit tracking, and specific error messages surfaced to the UI
- **PR Scores Integration Toggle** — GitHub Integrations panel shows a PR Scores on/off toggle when experimental features are enabled and GitHub is connected
- **Sandbox Mode** — BrowserWindow now runs with `sandbox: true` for stronger OS-level process isolation
- **DevTools Production Guard** — DevTools only open in development when `NODE_ENV !== 'production'`

### Fixed
- **GitHub Repos Not Loading** — Added `affiliation: 'owner,collaborator,organization_member'` to repo list API call. Fixed `type`/`affiliation` mutual exclusivity (GitHub returns 422 when both are set)
- **Token Retrieval After Security Migration** — Added automatic migration of legacy plaintext GitHub tokens to encrypted credential store. Clear diagnostic error shown in UI when token retrieval fails, with Disconnect & Reconnect action
- **PR Scoring Crash** — `pull-request-score` ESM package caused Vite chunk re-evaluation and IPC handler re-registration. Fixed with runtime-constructed `import()` via `new Function()` to bypass Vite's static analysis
- **PR List Crash on Missing Data** — GitHub's PR list endpoint doesn't always return `additions`/`deletions`/`changedFiles`. Added null guards to prevent `toLocaleString()` on undefined

## [1.3.0] - 2026-04-03

### Added
- **New Home Experience** — Clean, focused "What would you like to do?" hub with 4 action cards (Start Session, Continue Recent, Learn, Configure), quick prompt bar, recent sessions strip, and CLI status. Replaces widget dashboard as default; toggle in Feature Flags
- **White Label Branding** — Full brand customization in Configure → White Label. Color pickers for 5 brand colors, 5 UI colors, 12 surface colors (light + dark mode). Custom logo upload, app name, tagline, wordmark text, border radius style. 9 built-in presets (ClearPath Default, Midnight, Forest, Sunset, Rose, Ocean, Slate, Clean Blue, Clean Green). Live preview tab. All colors flow through CSS custom properties — entire app updates instantly
- **Dark / Light Mode** — System preference detection with manual override (System, Light, Dark). All surfaces, text, borders, and accents respond to mode changes. Toggled in White Label → Surfaces & Mode
- **Feature Flag System** — 35 toggleable flags covering every major section and feature. 4 built-in presets (Everything On, Essentials, Demo Mode, Manager View). Sidebar nav items hide when flags are off. Settings → Feature Flags tab with organized groups and toggle switches
- **Data Management** — New Settings tab with storage breakdown chart, per-store reset buttons, factory reset, and memory compaction (merge multiple notes into one). Visual bar chart of storage usage by store
- **Setup Wizard** — 8-step guided onboarding in Configure → Setup Wizard. CLI installation detection with install commands, authentication with live terminal output, guided creation of first agent (communication style), skill (job expertise), and memory (recent work), then a "bring it together" step. State tracked across sessions
- **Setup Dashboard Widget** — Progress checklist widget showing setup completion. Auto-shows "Setup Complete" when done
- **First-Run Banner** — Gradient banner on Home page when setup isn't complete, linking to Setup Wizard
- **Bulk Skill Export** — Select mode in Skills panel to pick multiple skills and export them all at once
- **Wizard Context Configuration** — Toggle "Use Context" on/off and individually enable/disable memories, agents, and skills tabs. Settings in Configure → Session Wizard

### Changed
- **Agent ID Consistency** — Fixed mismatch between agent creation and scanning that caused agents to be unfindable after creation
- **Agent Editing** — All agents (including built-in) now show Edit/Customize button. Built-in agents create a copy on first edit. Agents page restructured with tabbed view (All Agents / Agent Profiles)
- **Skill Content Injection** — Session Wizard now reads actual skill file content and injects it into the prompt, instead of just embedding the skill name
- **Agent Flag Passing** — Selected agent from wizard now properly passed as --agent CLI flag via the session options chain
- **Review Step** — Wizard review shows compact context badges (memories count, agent name, skill name) instead of dumping the full 600-line raw prompt
- **CLI / Model Selection** — All creation wizards (Agent, Skill, Session, New Session Modal) now respect last-used CLI. Model lists are CLI-aware (Copilot shows GPT-5, Gemini; Claude shows Sonnet, Opus, Haiku)
- **Skill Wizard Overhaul** — Tools as clickable labeled chips instead of free text, auto-invoke with clear explanations, model labeled by CLI with optgroups, GitHub integration toggle, improved review step
- **MCP Warning Deduplication** — Organization policy messages from CLI stderr are now classified as status (grey pill) instead of error (red block), with 30-second deduplication to prevent spam
- **Learning Center Unlocked** — All learning tracks are now accessible without prerequisites
- **Config Profiles** — Now save and restore agent enablement state (enabledAgentIds) alongside settings
- **Brand-Driven Colors** — Every surface in the app (sidebar, Work page, chat bubbles, code blocks, cards, borders, text, buttons, inputs) now reads from brand CSS variables. Zero hardcoded brand hex values in components. Prose-chat markdown styles fully brand-aware

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
