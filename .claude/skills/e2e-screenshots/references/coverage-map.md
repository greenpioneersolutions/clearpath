# Screenshot Coverage Map

Baseline screenshots currently captured by `e2e/screenshot-crawl.spec.ts`,
keyed off the data tables in that spec.

> Last verified after the PR #47 merge (MCP management + Connect page +
> Work/Insights UX overhaul). Tab labels and inventory below match the
> current renderer.

## Sidebar Pages

| File | Nav label | Notes |
|---|---|---|
| `home--initial.png` | Home | always present |
| `work--initial.png` | Work | always present |
| `insights--initial.png` | Insights | always present |
| `clear-memory--initial.png` | Clear Memory | optional — gated by `showClearMemory` flag |
| `learn--initial.png` | Learn | optional — gated by `showLearn` flag + completion state |
| `connect--initial.png` | Connect | always present (added in PR #47) |
| `configure--initial.png` | Settings | sidebar label is "Settings"; URL is still `/configure` |
| `ext--backstage.png` | Backstage | optional — extension-contributed |
| `ext--efficiency-coach.png` | Efficiency Coach | optional — extension-contributed |
| `ext--pr-scores.png` | PR Scores | optional — extension-contributed |

Optional entries are guarded with `optional: true` in `SIDEBAR_PAGES` —
the spec checks the anchor exists and skips the screenshot if it doesn't.

## Work Page — Mode Tabs

| File | Hash param | What it shows |
|---|---|---|
| `work--tab-session.png` | `#/work?tab=session` | Active session view / Welcome Back when no session |
| `work--tab-wizard.png` | `#/work?tab=wizard` | Session Wizard |
| `work--tab-compose.png` | `#/work?tab=compose` | Workflow Composer |
| `work--tab-schedule.png` | `#/work?tab=schedule` | Scheduler |
| `work--tab-memory.png` | `#/work?tab=memory` | Notes & Memory manager |

The right-rail context panels (`?panel=agents|tools|templates|skills|subagents`)
were removed from Work in PR #47 and are no longer captured.

## Insights Page — Tabs

| File | Button text | Notes |
|---|---|---|
| `insights--tab-activity.png` | Activity | required — built-in tab; merged from old Analytics + Usage Analytics |
| `insights--tab-compliance.png` | Compliance | required — built-in tab |
| `insights--tab-catalog-insights.png` | Catalog Insights | optional — extension-contributed |
| `insights--tab-efficiency.png` | Efficiency | optional — extension-contributed |
| `insights--tab-pr-health.png` | PR Health | optional — extension-contributed |

Built-in tabs throw if missing; optional tabs are skipped with a console log.

## Connect Page — Tabs

Connect is the new top-level page (PR #47) for integration-style surfaces.
Each tab has a stable `id="connect-tab-{key}"` selector hook.

| File | Tab ID | Tab label |
|---|---|---|
| `connect--tab-integrations.png` | `#connect-tab-integrations` | Integrations |
| `connect--tab-extensions.png` | `#connect-tab-extensions` | Extensions |
| `connect--tab-mcp.png` | `#connect-tab-mcp` | MCP Servers |
| `connect--tab-environment.png` | `#connect-tab-environment` | Environment |
| `connect--tab-plugins.png` | `#connect-tab-plugins` | Plugins |
| `connect--tab-webhooks.png` | `#connect-tab-webhooks` | Webhooks |

## Configure Page — Tabs (13)

All tabs are captured by clicking `#tab-{key}` directly while staying on
the Configure page (no re-navigation between tabs). PR #47 renamed several
labels and moved Integrations / Extensions out to Connect.

| File | Tab ID | Tab label |
|---|---|---|
| `configure--tab-setup.png` | `#tab-setup` | Setup Wizard |
| `configure--tab-accessibility.png` | `#tab-accessibility` | Accessibility |
| `configure--tab-agents.png` | `#tab-agents` | Prompts |
| `configure--tab-skills.png` | `#tab-skills` | Playbooks |
| `configure--tab-memory.png` | `#tab-memory` | Notes & Context |
| `configure--tab-settings.png` | `#tab-settings` | General |
| `configure--tab-tools.png` | `#tab-tools` | Tools & Permissions |
| `configure--tab-wizard.png` | `#tab-wizard` | Session Wizard |
| `configure--tab-policies.png` | `#tab-policies` | Policies |
| `configure--tab-workspaces.png` | `#tab-workspaces` | Workspaces |
| `configure--tab-team.png` | `#tab-team` | Team Hub |
| `configure--tab-scheduler.png` | `#tab-scheduler` | Scheduler |
| `configure--tab-branding.png` | `#tab-branding` | Branding |

Each tab click is followed by `browser.pause(1200)` + `waitForLoadingToSettle(4000)`
to handle async IPC-loaded content.

## Configure — Inner Sub-Tabs

Several Configure sidenav sections render their own inner tab bar; each
sub-tab gets its own screenshot using `configure--tab-{section}--sub-{key}`.
Default sub-tabs are already captured by the parent tab screenshot above.

### Settings / "General" (7 inner tabs; default = CLI Flags)

| File | Sub-tab label |
|---|---|
| `configure--tab-settings--sub-model.png` | Model |
| `configure--tab-settings--sub-limits.png` | Session Limits |
| `configure--tab-settings--sub-profiles.png` | Profiles |
| `configure--tab-settings--sub-notifications.png` | Notifications |
| `configure--tab-settings--sub-data.png` | Data Management |
| `configure--tab-settings--sub-features.png` | Feature Flags |

PR #47 renamed "Budget & Limits" → "Session Limits" (cost UI removed) and
moved "Plugins", "Environment", "Webhooks" out to /connect.

### Policies (3 inner tabs; default = Presets)

| File | Sub-tab label |
|---|---|
| `configure--tab-policies--sub-violations.png` | Violations |
| `configure--tab-policies--sub-editor.png` | Editor |

### Memory / "Notes & Context" (6 inner tabs; default = Notes)

| File | Sub-tab label |
|---|---|
| `configure--tab-memory--sub-starter.png` | Starter Memories |
| `configure--tab-memory--sub-config-files.png` | Config Files |
| `configure--tab-memory--sub-instructions.png` | Instructions |
| `configure--tab-memory--sub-cli-memory.png` | CLI Memory |
| `configure--tab-memory--sub-context.png` | Context Usage |

### Team Hub (5 inner tabs; default = Config Bundle)

| File | Sub-tab label |
|---|---|
| `configure--tab-team--sub-sync.png` | Shared Folder |
| `configure--tab-team--sub-wizard.png` | Setup Wizard |
| `configure--tab-team--sub-marketplace.png` | Marketplace |
| `configure--tab-team--sub-activity.png` | Activity *(tolerance: 6 — relative timestamps)* |

### Branding (5 inner tabs; default = Theme Presets)

| File | Sub-tab label |
|---|---|
| `configure--tab-branding--sub-identity.png` | Identity |
| `configure--tab-branding--sub-colors.png` | Brand Colors |
| `configure--tab-branding--sub-ui-colors.png` | UI Colors |
| `configure--tab-branding--sub-surfaces.png` | Surfaces & Mode |
| `configure--tab-branding--sub-preview.png` | Preview |

### Workspaces (4 inner tabs; default = Repos)

The Workspaces inner tab bar only renders when an active workspace exists,
so the spec creates a temporary workspace via IPC, captures all four
sub-tabs, then deletes the workspace.

| File | Sub-tab label |
|---|---|
| `configure--tab-workspaces--sub-repos.png` | Repos |
| `configure--tab-workspaces--sub-broadcast.png` | Broadcast |
| `configure--tab-workspaces--sub-activity.png` | Activity *(tolerance: 6)* |
| `configure--tab-workspaces--sub-settings.png` | Settings |

## Known intentional gaps

| What | Why |
|---|---|
| Authenticated extension states (Backstage with real URL, PR Scores with GitHub token) | Require live credentials; not feasible in CI |
| Active chat session in Work | Requires a running CLI binary; captured as "Welcome Back" empty state instead |
| Cost / budget UI | Removed in PR #47 — cost backend is dormant, no UI to capture |
