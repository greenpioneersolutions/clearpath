---
name: e2e-screenshots
description: E2E screenshot capture system for ClearPathAI — architecture, data-driven crawl spec, directory conventions, CI workflow, and troubleshooting. Auto-loads when working on the Playwright screenshot crawl or its config.
user-invocable: false
paths: "e2e/screenshot-crawl.pw.spec.ts, e2e/screenshot-crawl-experimental.pw.spec.ts, e2e/helpers/pw-screenshots.ts, playwright.screenshots.config.ts, playwright.screenshots.experimental.config.ts, e2e/screenshots/**"
allowed-tools: Read Glob Grep Bash
---

# E2E Screenshot System

This project uses a **data-driven visual crawl** to capture baseline screenshots of every page and tab in the Electron app. Screenshots are stored in Git LFS and updated automatically by CI on every PR.

The system has four layers:
1. **`e2e/helpers/pw-screenshots.ts`** — Ad-hoc capture helper (`captureScreenshot`) for explicit "save now" captures during debugging
2. **`e2e/screenshot-crawl.pw.spec.ts`** — Data tables + Playwright spec that visits every route/tab/panel
3. **`e2e/screenshot-crawl-experimental.pw.spec.ts`** — Same shape, but for routes gated behind experimental flags (build with `CLEARPATH_E2E_EXPERIMENTAL=1`)
4. **`playwright.screenshots.config.ts`** / **`playwright.screenshots.experimental.config.ts`** — Dedicated Playwright configs (separate from `playwright.config.ts`)

---

## Capture-first policy (CI)

CI runs the crawl with **`-u` (update snapshots)**, and the spec writes baselines via Electron's `BrowserWindow.capturePage()` directly — bypassing Playwright's implicit waits inside `page.screenshot` (fonts.ready, RAF, animation-sync) which hang on busy Electron pages. The spec writes byte-identical PNGs for unchanged frames, so identical-pixel re-encodes don't churn the LFS pointer. Only baselines whose pixels actually changed get committed back.

How the workflow decides what to update:

1. The spec calls `BrowserWindow.capturePage()` → `img.toPNG()` for every tag. Electron's encoder is deterministic, so unchanged frames produce the exact same bytes.
2. `git add e2e/screenshots/baseline/` followed by `git diff --staged --quiet || git commit` only commits when at least one PNG actually changed.
3. `git push --force-with-lease` keeps the commit safe against unrelated pushes.

What still fails the screenshot job:

- Navigation / element-wait timeouts during the crawl
- JS exceptions thrown from inside the spec or the renderer
- Required Insights tabs missing (built-in tabs throw if not found)
- `BrowserWindow.capturePage()` errors (window closed, GPU crash)
- On CI in compare mode: a missing baseline (would silently auto-create locally)

If a PR carries an unexpected `Auto-update` commit, open the LFS-pointer diff or download the `screenshots` artifact to see the change and decide whether to keep it.

## How to run locally

```bash
# Compare against committed baselines. On a fresh machine, missing baselines
# are auto-written (matches Playwright's --update-snapshots=missing default).
npm run pw:screenshots

# Force-overwrite every baseline with the current capture (rare —
# typically only needed after an OS, font, or device-scale-factor change).
npm run pw:screenshots:update

# Experimental routes (build with CLEARPATH_E2E_EXPERIMENTAL=1 first; the
# script does this for you).
npm run pw:screenshots:experimental
npm run pw:screenshots:experimental:update
```

All scripts run `npm run build` first. Compare-mode artifacts (actuals on failure, diffs, traces) land under `test-results-visual/` (gitignored).

**Important:** `playwright.config.ts` and `e2e/fixtures.ts` both call `delete process.env.ELECTRON_RUN_AS_NODE` because VS Code sets this env var and it prevents Electron from launching as a GUI app — no manual `unset` needed.

---

## Directory layout

```
e2e/screenshots/
├── baseline/                  ← committed to Git LFS — the source of truth
│   └── experimental-features/ ← gated routes (CLEARPATH_E2E_EXPERIMENTAL=1)
└── failures/                  ← gitignored; ad-hoc failure captures

test-results-visual/           ← gitignored; Playwright outputDir for the
                                 visual crawl (traces, actual/expected
                                 attachments uploaded as a CI artifact)
test-results-visual-experimental/  ← same, for the experimental crawl
.tmp/visual/captures/{tag}.png ← functional-spec ad-hoc captures
                                 (helpers/pw-screenshots.ts)
```

Only `e2e/screenshots/baseline/` is tracked via Git LFS (`.gitattributes` rule: `e2e/screenshots/**/*.png filter=lfs ...`); everything else is gitignored.

---

## Screenshot naming convention

```
{section}--{subsection}.png
```

| Pattern | Example |
|---|---|
| Top-level page | `home--initial.png` |
| Work mode tab | `work--tab-compose.png` |
| Connect sub-tab | `connect--tab-mcp.png` |
| Insights tab | `insights--tab-activity.png` |
| Configure tab | `configure--tab-settings.png` |
| Configure sub-tab | `configure--tab-memory--sub-context.png` |
| Extension route | `ext--pr-scores.png` |
| Experimental route | `experimental-features/{tag}.png` |

---

## Coverage — what's currently captured

| Section | Keys |
|---|---|
| Core sidebar pages | home, work, insights, connect, configure (label "Settings") |
| Optional sidebar pages | clear-memory, learn, ext--backstage, ext--efficiency-coach, ext--pr-scores |
| Work mode tabs | session, compose, schedule |
| Insights tabs | activity, compliance (built-in); catalog-insights, efficiency, pr-health (extension-contributed, optional) |
| Connect sub-tabs | integrations, environment, plugins, webhooks (mcp + extensions live under the experimental crawl) |
| Configure tabs (13) | setup, accessibility, agents (label "Prompts"), skills (label "Playbooks"), memory (label "Notes & Context"), settings (label "General"), tools (label "Tools & Permissions"), wizard, policies, workspaces, team, scheduler, branding |

For the full inventory of inner sub-tabs and per-shot tolerances see
[references/coverage-map.md](references/coverage-map.md).

---

## Handling dynamic content

Screenshots include time-of-day greetings, "5 minutes ago" timestamps, locale-formatted dates, and similar dynamic text that would otherwise drift between CI runs and trigger spurious baseline updates. Right before every capture, the spec calls `freezeDynamicContent(page)` from [`e2e/helpers/pw.ts`](../../../e2e/helpers/pw.ts) which:

1. Walks every `Text` node (including inside Recharts SVG `<text>`) and rewrites a small set of dynamic patterns to constants. Currently covered:
   - `Good morning|afternoon|evening` → `Good day`
   - `5m ago | 5 minutes ago | yesterday | just now | …` → `5 minutes ago`
   - `2:45 PM | 12:34:56 PM` → `2:45 PM`
   - `Apr 26, 2026, 2:45:30 PM` → `Apr 26, 2026, 2:45 PM`
   - `4/26/2026` → `4/26/2026` (canonicalized)
   - `2026-04-26` → `2026-04-26` (canonicalized)
   - `2m 15s` → `2m 15s` (stopwatch durations)
2. For dynamic content that doesn't fit a generic pattern (random IDs, percent badges, counters), use the **`data-screenshot-stub`** escape hatch:

   ```tsx
   <span data-screenshot-stub="0a1b2c3d">{session.id.slice(0, 8)}</span>
   <span data-screenshot-stub="45%">{learnPct}%</span>
   ```

   `freezeDynamicContent()` overwrites the element's `textContent` with the attribute value just before capture. Keep the placeholder string the same length as a typical real value to preserve layout.

The spec also calls `preparePage(page)` which injects a stylesheet that nukes all `transition-*` and `animate-*` durations (Tailwind `animate-pulse`, `animate-spin`, `animate-bounce`, `animate-ping`) and hides the caret — without this, skeleton loaders never reach a steady frame and the capture comes out mid-pulse.

If you find a tag still triggering an `Auto-update screenshot baselines` commit on a non-UI change, the most likely fix is one of:
- A new dynamic format the regex doesn't match yet → extend `freezeDynamicContent()` in `e2e/helpers/pw.ts`
- A specific element with no textual signal → mark it `data-screenshot-stub="…"` in the component

## Adding coverage

### New sidebar page
Add an entry to `SIDEBAR_PAGES` in `e2e/screenshot-crawl.pw.spec.ts`:
```typescript
{ nav: 'My Page', screenshot: 'my-page--initial' }
// For routes gated by feature flags or extension-contributed:
{ nav: 'My Ext', screenshot: 'ext--my-ext', optional: true }
```

### New tab on an existing page
- **Work tabs** → add to `WORK_TABS`, use `key` matching the `?tab=` hash param
- **Insights tabs** → add to `INSIGHTS_TABS`, use `label` matching the visible button text; mark extension-contributed tabs `optional: true`
- **Connect sub-tabs** → add to `CONNECT_TABS`, use `key` matching the `#connect-tab-{key}` DOM id
- **Configure tabs** → add to `CONFIGURE_TABS`, use `key` matching the `#tab-{key}` DOM id

### New page section or async-loaded content
After navigation, the spec calls `waitForLoadingToSettle(page, 3000)` which polls until no `Loading...` text AND no skeleton-pulse animations are present. For tabs with longer IPC load times, pass a higher timeout:
```typescript
await waitForLoadingToSettle(page, 6000)
```

---

## CI workflow

Two screenshot jobs live in `.github/workflows/ci.yml`, both gated by the upstream `playwright-functional` job:

1. **`screenshot-regression`** — runs `npx playwright test -c playwright.screenshots.config.ts -u` for the default build.
2. **`screenshot-regression-experimental`** — runs the experimental config with `CLEARPATH_E2E_EXPERIMENTAL=1` set on both the build and the test step. Sequenced after `screenshot-regression` to avoid a force-push race.

Each job:

1. Builds the app (experimental job uses `CLEARPATH_E2E_EXPERIMENTAL=1` so gated chunks are present)
2. Installs Xvfb (`libgbm-dev libasound2-dev`) and sets `DISPLAY=:99`
3. Runs the crawl with `-u`. The spec captures via `BrowserWindow.capturePage()` so unchanged frames produce byte-identical PNGs.
4. `git add e2e/screenshots/baseline/`, commit `Auto-update screenshot baselines [skip ci]` if anything actually changed, `git push --force-with-lease`
5. Upload `test-results-visual/` and `e2e/screenshots/baseline/` as the `screenshots` artifact

The `[skip ci]` token on the auto-baseline commit prevents an infinite re-run loop.

`workflow_dispatch:` is enabled for manual reruns.

---

## Reference materials

| File | Topic | Read when... |
|---|---|---|
| [references/architecture.md](references/architecture.md) | Full architecture — helpers, config, env vars, LFS setup | Debugging the pipeline or understanding how pieces connect |
| [references/troubleshooting.md](references/troubleshooting.md) | Common failures and fixes | A screenshot run fails or produces wrong output |
| [references/coverage-map.md](references/coverage-map.md) | Complete list of all screenshots with selector patterns | Adding new coverage or auditing gaps |

## Examples

| File | Pattern | Use when... |
|---|---|---|
| [examples/add-page.md](examples/add-page.md) | Adding a new sidebar page to the crawl | A new route is added to the app |
| [examples/add-tabs.md](examples/add-tabs.md) | Adding new tabs to Work, Insights, or Configure | A new tab is added to an existing multi-tab page |
