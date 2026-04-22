# Screenshot Coverage Map

All 37 baseline screenshots currently captured by `e2e/screenshot-crawl.spec.ts`.

## Sidebar Pages (5 core + 3 extension)

| File | Nav label | Navigation method |
|---|---|---|
| `home--initial.png` | Home | `navigateSidebarTo('Home')` |
| `work--initial.png` | Work | `navigateSidebarTo('Work')` |
| `insights--initial.png` | Insights | `navigateSidebarTo('Insights')` |
| `learn--initial.png` | Learn | `navigateSidebarTo('Learn')` |
| `configure--initial.png` | Configure | `navigateSidebarTo('Configure')` |
| `ext--backstage.png` | Backstage | `navigateSidebarTo('Backstage')` — optional guard |
| `ext--efficiency-coach.png` | Efficiency Coach | `navigateSidebarTo('Efficiency Coach')` — optional guard |
| `ext--pr-scores.png` | PR Scores | `navigateSidebarTo('PR Scores')` — optional guard |

Extension pages (ext--*) show their loading/unauthenticated state — this is correct. They require external backends (Backstage URL, GitHub token) to show real content.

## Work Page — Mode Tabs (4)

| File | Hash param | What it shows |
|---|---|---|
| `work--tab-session.png` | `#/work?tab=session` | "Welcome Back" + Start New Session |
| `work--tab-compose.png` | `#/work?tab=compose` | Workflow Composer with template grid |
| `work--tab-schedule.png` | `#/work?tab=schedule` | Scheduler interface |
| `work--tab-memory.png` | `#/work?tab=memory` | Memory/notes panel |

Note: `work--initial` already captures the default wizard view (`#/work?tab=wizard`), so `wizard` is intentionally absent from WORK_TABS to avoid duplicate screenshots.

## Work Page — Context Panels (5)

| File | Hash param | What it shows |
|---|---|---|
| `work--panel-agents.png` | `#/work?panel=agents` | Agents panel (right side) + notes/memory (left) |
| `work--panel-tools.png` | `#/work?panel=tools` | Tools panel |
| `work--panel-templates.png` | `#/work?panel=templates` | Templates panel |
| `work--panel-skills.png` | `#/work?panel=skills` | Skills panel |
| `work--panel-subagents.png` | `#/work?panel=subagents` | Sub-agents panel |

## Insights Page — Tabs (6)

| File | Button text | Selector |
|---|---|---|
| `insights--tab-analytics.png` | Analytics | `//button[contains(., 'Analytics')]` |
| `insights--tab-compliance.png` | Compliance | `//button[contains(., 'Compliance')]` |
| `insights--tab-usage.png` | Usage | `//button[contains(., 'Usage')]` |
| `insights--tab-catalog-insights.png` | Catalog Insights | `//button[contains(., 'Catalog Insights')]` |
| `insights--tab-efficiency.png` | Efficiency | `//button[contains(., 'Efficiency')]` |
| `insights--tab-pr-health.png` | PR Health | `//button[contains(., 'PR Health')]` |

The last 3 are extension-contributed (PR Scores, Efficiency Coach extensions). They're guarded — if the button isn't found the test skips with a console log.

## Configure Page — Tabs (14)

All 14 tabs are captured by clicking `#tab-{key}` directly while staying on the Configure page (no re-navigation between tabs). This avoids loading flashes on async-loaded tabs.

| File | Tab ID | Tab label |
|---|---|---|
| `configure--tab-setup.png` | `#tab-setup` | Setup Wizard |
| `configure--tab-accessibility.png` | `#tab-accessibility` | Accessibility |
| `configure--tab-settings.png` | `#tab-settings` | Settings |
| `configure--tab-policies.png` | `#tab-policies` | Policies |
| `configure--tab-integrations.png` | `#tab-integrations` | Integrations |
| `configure--tab-extensions.png` | `#tab-extensions` | Extensions |
| `configure--tab-memory.png` | `#tab-memory` | Memory |
| `configure--tab-agents.png` | `#tab-agents` | Agents |
| `configure--tab-skills.png` | `#tab-skills` | Skills |
| `configure--tab-wizard.png` | `#tab-wizard` | Session Wizard |
| `configure--tab-workspaces.png` | `#tab-workspaces` | Workspaces |
| `configure--tab-team.png` | `#tab-team` | Team Hub |
| `configure--tab-scheduler.png` | `#tab-scheduler` | Scheduler |
| `configure--tab-branding.png` | `#tab-branding` | White Label |

Each tab click is followed by `browser.pause(1200)` + `waitForLoadingToSettle(4000)` to handle async IPC-loaded content.

## Known intentional gaps

| What | Why |
|---|---|
| Configure Settings sub-tabs (CLI Flags, Model, Budget & Limits, etc.) | Functional tests cover these; visual crawl stays at the first sub-tab |
| Authenticated extension states (Backstage with real URL, PR Scores with GitHub token) | Require live credentials; not feasible in CI |
| Active chat session in Work | Requires a running CLI binary; captured as "Welcome Back" empty state instead |
