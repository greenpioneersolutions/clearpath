# Screenshot System Architecture

## File map

| File | Role |
|---|---|
| `e2e/helpers/pw-screenshots.ts` | `captureScreenshot(page, tag)` for ad-hoc spec captures during debugging |
| `e2e/helpers/pw.ts` | Shared helpers: `freezeDynamicContent`, `waitForLoadingToSettle`, navigation utilities |
| `e2e/fixtures.ts` | Worker-scoped `electronApp`, per-test `page` (first window), per-test `consoleErrors` collector |
| `e2e/screenshot-crawl.pw.spec.ts` | Default-build crawl spec — data tables + `test.describe` blocks |
| `e2e/screenshot-crawl-experimental.pw.spec.ts` | Same shape for routes gated behind experimental flags |
| `playwright.screenshots.config.ts` | Dedicated Playwright config for the default crawl |
| `playwright.screenshots.experimental.config.ts` | Same, for the experimental crawl (outputs to `test-results-visual-experimental/`) |
| `playwright.config.ts` | Functional-test config — `testIgnore`s both crawl specs |
| `.gitattributes` | LFS rule: `e2e/screenshots/**/*.png filter=lfs diff=lfs merge=lfs -text` |
| `.gitignore` | Ignores `e2e/screenshots/failures/`, `test-results-visual*/`, `.tmp/visual/` — only `e2e/screenshots/baseline/` is committed |

## `e2e/helpers/pw-screenshots.ts` — key export

```typescript
// Save a named screenshot under `.tmp/visual/captures/{tag}.png` (override
// with the SCREENSHOT_DIR env var). Tags may include `/` for subdirectories;
// parent dirs are created on demand. Errors are logged, not thrown.
// 5s timeout so a hung renderer doesn't block the calling spec.
export async function captureScreenshot(page: Page, tag: string): Promise<void>
```

Built-in `screenshot: 'only-on-failure'` (in `playwright.config.ts`) covers the
automatic failure-capture case. Keep `captureScreenshot` for explicit "save now"
captures during debugging.

## `playwright.screenshots.config.ts` — key settings

- `testMatch: /screenshot-crawl\.pw\.spec\.ts/` — runs only the crawl
- `timeout: 120_000`, `workers: 1`, `fullyParallel: false` — crawl mutates window state
- `toHaveScreenshot.maxDiffPixelRatio: 0.02`, `threshold: 0.2` — absorbs FreeType (linux) vs CoreText (mac) anti-aliasing
- `outputDir: 'test-results-visual'` — Playwright places traces, retained-on-failure videos, and actual/expected attachments here
- Inherits `playwright.config.ts`'s `delete process.env.ELECTRON_RUN_AS_NODE` at the top

## `playwright.config.ts` — screenshot integration

```typescript
// Unset VS Code's env var before fixtures import process.env
delete process.env.ELECTRON_RUN_AS_NODE

// Exclude the crawl specs from the default functional run
testIgnore: [
  /screenshot-crawl\.pw\.spec\.ts/,
  /screenshot-crawl-experimental\.pw\.spec\.ts/,
  /extensions-integration\.pw\.spec\.ts/,
]

// Capture a screenshot for every failing functional test
use: { screenshot: 'only-on-failure', trace: 'on-first-retry' }
```

## The capture pipeline — why not `toHaveScreenshot`?

The crawl does **not** rely on Playwright's `expect(page).toHaveScreenshot()` for the write path. Instead, it captures via `BrowserWindow.capturePage()` from the main process (through `electronApp.evaluate`). Two reasons:

1. **Bypasses every implicit wait Playwright's `page.screenshot` does** — fonts.ready, RAF, animation-sync. Some Electron pages (Memory tab, Skills tab) keep async promises pending forever in the headless renderer, hanging `page.screenshot`.
2. **Deterministic PNG bytes** — Electron's native encoder produces byte-identical output for unchanged frames. This is what lets CI commit only the baselines that actually changed.

Compare mode in the spec pixel-diffs the captured PNG against the baseline with `pngjs` + `pixelmatch` using the same tolerance as the config's `toHaveScreenshot` defaults (`threshold: 0.2`, `maxDiffPixelRatio: 0.02`).

## Local script flow

```
npm run pw:screenshots
  → npm run build && CLEARPATH_E2E_VISUAL=1 playwright test -c playwright.screenshots.config.ts
    → captures every screen, pixel-diffs against e2e/screenshots/baseline/{tag}.png,
      attaches actual/expected PNGs to the test report on diff.
      On a fresh checkout, missing baselines are auto-written (matches
      Playwright's --update-snapshots=missing default), unless CI=true.
      Does not modify committed baselines unless a diff exceeds the threshold.

npm run pw:screenshots:update
  → npm run build && CLEARPATH_E2E_VISUAL=1 playwright test -c playwright.screenshots.config.ts -u
    → captures every screen via BrowserWindow.capturePage() and writes the
      PNG straight to baseline. Identical-pixel re-encodes produce
      byte-identical files (Electron's PNG encoder is deterministic), so
      unchanged tags do not churn the LFS pointer.
```

## CLEARPATH_E2E_VISUAL=1

The visual configs set this env var so the `page` fixture knows to call `page.emulateMedia({ colorScheme: 'dark' })` — overriding the renderer's `prefers-color-scheme` media query so BrandingContext flips the Tailwind `dark` class. **Must be set on the parent process** (npm scripts pass it; CI workflow `env:` block sets it on the visual jobs) — Playwright workers fork from the parent at config-load time, so mutating `process.env` from a config module doesn't reach them.

## Cross-OS stability

- Window pinned to **1280×800 content size** via `BrowserWindow.setContentSize()` in the `page` fixture (mac titlebar ≈32 px, linux ≈28 px → outer size differs per OS; content size is what we control)
- **DPR pinned to 1** via `--force-device-scale-factor=1` in fixtures
- **`--hide-scrollbars`** keeps usable viewport identical (linux would otherwise reduce by 1 px)
- **Dark mode** via `page.emulateMedia({ colorScheme: 'dark' })` — `--force-dark-mode` does NOT propagate to `_electron.launch`'s media-query layer
- **`threshold: 0.2` + `maxDiffPixelRatio: 0.02`** covers FreeType (linux) vs CoreText (mac) sub-pixel anti-aliasing

## Git LFS flow

1. `e2e/screenshots/baseline/` is LFS-tracked (rule in `.gitattributes`).
2. CI's `screenshot-regression` job runs the crawl with `-u`, writing PNGs deterministically via `BrowserWindow.capturePage()` directly to baseline paths.
3. `git add e2e/screenshots/baseline/ && git diff --staged --quiet || git commit` → commit is skipped when no PNG actually changed; if there's a change LFS stores binary, git stores pointer.
4. `git push --force-with-lease`. The commit message contains `[skip ci]` so it doesn't loop.

## Why two screenshot configs?

The default crawl ships against the default build, where experimental routes are tree-shaken out of the bundle. The experimental crawl requires `CLEARPATH_E2E_EXPERIMENTAL=1` on both the build AND the test step — every experimental flag is forced ON, restoring the gated page chunks. Its baselines live under `e2e/screenshots/baseline/experimental-features/` to keep them separate from the default crawl.

The experimental job is sequenced **after** the default job in CI so any auto-baseline commit from the default crawl lands first — avoids a force-push race.
