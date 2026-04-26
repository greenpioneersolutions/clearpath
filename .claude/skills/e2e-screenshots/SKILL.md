---
name: e2e-screenshots
description: E2E screenshot capture system for ClearPathAI — architecture, data-driven crawl spec, directory conventions, CI workflow, and troubleshooting. Auto-loads when working on screenshot tests or the wdio screenshot config.
user-invocable: false
paths: "e2e/screenshot-crawl.spec.ts, e2e/helpers/screenshots.ts, wdio.screenshots.conf.ts, e2e/screenshots/**"
allowed-tools: Read Glob Grep Bash
---

# E2E Screenshot System

This project uses a **data-driven visual crawl** to capture baseline screenshots of every page and tab in the Electron app. Screenshots are stored in Git LFS and updated automatically by CI on every PR.

The system has three layers:
1. **`e2e/helpers/screenshots.ts`** — DRY capture utilities (`captureScreenshot`, `captureFailureScreenshot`)
2. **`e2e/screenshot-crawl.spec.ts`** — Data tables + WebdriverIO spec that visits every route/tab/panel
3. **`wdio.screenshots.conf.ts`** — Dedicated wdio config (separate from the main `wdio.conf.ts`)

---

## Capture-first policy (CI)

CI runs the crawl in **compare mode** (no `--update-visual-baseline`), and the spec doesn't assert on pixel mismatch. Visual changes flow into PR diffs via an `Auto-update screenshot baselines` commit, but only baselines whose pixels actually changed are rewritten.

How the workflow decides what to update:

1. The visual service captures `.tmp/visual/actual/{tag}.png` for every shot, and writes `.tmp/visual/diff/{tag}.png` only for tags whose comparison reports a non-zero mismatch (within the configured `compareOptions`, which currently `ignoreAntialiasing`).
2. A post-step iterates `.tmp/visual/diff/*.png` and copies the matching actual over the baseline. Tags without a diff PNG keep their existing baseline file untouched.
3. The commit step picks up only the promoted baselines — so a docs- or config-only commit (e.g. `Update CLAUDE.md`) does not produce an `Auto-update` commit.

> **Why this is necessary.** Running with `--update-visual-baseline` rewrites every baseline on every CI run, even when pixels are identical. PNG re-encoding produces non-identical bytes for identical pixels (~4-byte metadata difference), which ends up in LFS pointer churn — every unrelated commit then dragged a fake `Auto-update` commit behind it.

What still fails the screenshot job:

- Navigation / element-wait timeouts during the crawl
- JS exceptions thrown from inside the spec or the renderer
- Required Insights tabs missing (built-in tabs throw if not found)
- `browser.checkScreen` errors (driver crash, screenshot couldn't be produced)

If a PR carries an unexpected `Auto-update` commit, the LFS-pointer diff is the regression signal — open the artifact and decide whether to keep the change.

## How to run locally

```bash
# CI parity: compare against committed baselines, write diffs/actuals to .tmp/visual/.
npm run e2e:screenshots

# Force-overwrite every baseline with the current capture (rare —
# typically only needed after an OS, font, or device-scale-factor change).
npm run e2e:screenshots:update
```

Both scripts run `npm run build` first. Generated output lands under `.tmp/visual/` (gitignored).

**Important:** Both `wdio.conf.ts` and `wdio.screenshots.conf.ts` call `delete process.env.ELECTRON_RUN_AS_NODE` at the top. VS Code sets this env var and it prevents Electron from launching as a GUI app — no manual `unset` needed.

---

## Directory layout

```
e2e/screenshots/
└── baseline/        ← committed to Git LFS — the source of truth

.tmp/visual/         ← gitignored; uploaded as the `screenshots` CI artifact
├── actual/{tag}.png ← every captured shot for the run (alwaysSaveActualImage)
├── diff/{tag}.png   ← only for tags whose comparison reported a mismatch
└── captures/{tag}.png ← functional-spec ad-hoc captures (helpers/screenshots.ts)

e2e/screenshots/failures/  ← also gitignored; failure-screenshot output
                              from the wdio.conf.ts afterTest hook
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

---

## Coverage — what's currently captured

| Section | Keys |
|---|---|
| Core sidebar pages | home, work, insights, connect, configure (label "Settings") |
| Optional sidebar pages | clear-memory, learn, ext--backstage, ext--efficiency-coach, ext--pr-scores |
| Work mode tabs | session, wizard, compose, schedule, memory |
| Insights tabs | activity, compliance (built-in); catalog-insights, efficiency, pr-health (extension-contributed, optional) |
| Connect sub-tabs | integrations, extensions, mcp, environment, plugins, webhooks |
| Configure tabs (13) | setup, accessibility, agents (label "Prompts"), skills (label "Playbooks"), memory (label "Notes & Context"), settings (label "General"), tools (label "Tools & Permissions"), wizard, policies, workspaces, team, scheduler, branding |

For the full inventory of inner sub-tabs and per-shot tolerances see
[references/coverage-map.md](references/coverage-map.md).

> **Note on PR #47** — The Work right-rail panels (`?panel=…`) were
> removed in main, the standalone /connections route was replaced by
> the Connect page, the Insights "Analytics" + "Usage" tabs were
> merged into a single "Activity" tab, and the "Budget & Limits"
> sub-tab was renamed to "Session Limits" (cost UI removed).

---

## Handling dynamic content

Screenshots include time-of-day greetings, "5 minutes ago" timestamps, locale-formatted dates, and similar dynamic text that would otherwise drift between CI runs and trigger spurious baseline updates. Right before every capture, the spec calls `freezeDynamicContent()` from [`e2e/helpers/app.ts`](../../../e2e/helpers/app.ts) which:

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

If you find a tag still triggering an `Auto-update screenshot baselines` commit on a non-UI change, the most likely fix is one of:
- A new dynamic format the regex doesn't match yet → extend `freezeDynamicContent()`
- A specific element with no textual signal → mark it `data-screenshot-stub="…"` in the component

## Adding coverage

### New sidebar page
Add an entry to `SIDEBAR_PAGES` in `e2e/screenshot-crawl.spec.ts`:
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
After navigation, the spec calls `waitForLoadingToSettle(3000)` which polls until no `Loading...` text is present. For tabs with longer IPC load times, pass a higher timeout:
```typescript
await waitForLoadingToSettle(6000)
```

---

## CI workflow

There is one screenshot job — `screenshot-regression` in `.github/workflows/ci.yml` — gated by the upstream `test` job. On every push to `dev`/`release/**`/`hotfix/**` and every PR to `main`/`dev`:

1. Build the app
2. Install Xvfb (`libgbm-dev libasound2-dev`) and set `DISPLAY=:99`
3. Run `npx wdio run wdio.screenshots.conf.ts` (compare mode) — captures every screen and writes diffs only for changed tags
4. **Promote actuals to baselines for changed tags only** — for each `.tmp/visual/diff/{tag}.png`, copy `.tmp/visual/actual/{tag}.png` over `e2e/screenshots/baseline/{tag}.png`
5. `git add e2e/screenshots/baseline/`, commit `Auto-update screenshot baselines [skip ci]` if anything was promoted, `git push --force-with-lease`
6. Upload `.tmp/visual/actual/`, `.tmp/visual/diff/`, and `e2e/screenshots/baseline/` as the `screenshots` artifact

The `[skip ci]` token on the auto-baseline commit prevents an infinite re-run loop.

`workflow_dispatch:` is enabled for manual reruns.

---

## Reference materials

| File | Topic | Read when... |
|---|---|---|
| [references/architecture.md](references/architecture.md) | Full architecture — helpers, config, env vars, LFS setup | Debugging the pipeline or understanding how pieces connect |
| [references/troubleshooting.md](references/troubleshooting.md) | Common failures and fixes | A screenshot run fails or produces wrong output |
| [references/coverage-map.md](references/coverage-map.md) | Complete list of all 37 screenshots with selector patterns | Adding new coverage or auditing gaps |

## Examples

| File | Pattern | Use when... |
|---|---|---|
| [examples/add-page.md](examples/add-page.md) | Adding a new sidebar page to the crawl | A new route is added to the app |
| [examples/add-tabs.md](examples/add-tabs.md) | Adding new tabs to Work, Insights, or Configure | A new tab is added to an existing multi-tab page |
