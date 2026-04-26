# Screenshot System Architecture

## File map

| File | Role |
|---|---|
| `e2e/helpers/screenshots.ts` | `captureScreenshot` for ad-hoc spec captures + `captureFailureScreenshot` for the wdio-runner failure hook |
| `e2e/screenshot-crawl.spec.ts` | Data-driven crawl spec — data tables + describe blocks |
| `wdio.screenshots.conf.ts` | Dedicated wdio runner config for the crawl (separate from `wdio.conf.ts`) |
| `wdio.conf.ts` | Main functional test config — excludes crawl spec, has `afterTest` failure hook |
| `.gitattributes` | LFS rule: `e2e/screenshots/**/*.png filter=lfs diff=lfs merge=lfs -text` |
| `.gitignore` | Ignores `e2e/screenshots/{actual,failures,diff}/` and `.tmp/visual/` — only `e2e/screenshots/baseline/` is committed |

## `e2e/helpers/screenshots.ts` — key exports

```typescript
// Save a named screenshot under `.tmp/visual/captures/{tag}.png` (override
// with the SCREENSHOT_DIR env var). Tags may include `/` for subdirectories;
// parent dirs are created on demand. Errors are logged, not thrown.
export async function captureScreenshot(tag: string): Promise<void>

// Best-effort: saves to e2e/screenshots/failures/{timestamp}--{title}.png
// Never throws — wraps everything in try/catch.
export async function captureFailureScreenshot(testTitle: string): Promise<void>
```

## `wdio.screenshots.conf.ts` — key settings

- `specs: ['./e2e/screenshot-crawl.spec.ts']` — runs only the crawl
- `mochaOpts.timeout: 120000` — longer than functional tests (crawl visits all 37 states)
- `delete process.env.ELECTRON_RUN_AS_NODE` — VS Code fix, baked in
- No `exclude` array — it IS the targeted spec

## `wdio.conf.ts` — screenshot integration points

```typescript
// Unset VS Code's env var before any worker starts
delete process.env.ELECTRON_RUN_AS_NODE

// Exclude the crawl spec from the default run
exclude: [
  './e2e/extensions-integration.spec.ts',
  './e2e/screenshot-crawl.spec.ts',  // ← run via npm run e2e:screenshots / e2e:screenshots:compare instead
]

// Capture failure screenshot for any failing functional test.
// `afterTest` is the WebdriverIO per-test runner hook (NOT `afterEach`,
// which is reserved for the Mocha spec-level hook and is silently ignored
// if put in the wdio runner config).
afterTest: async function (test, _context, { passed }) {
  if (passed) return
  const { captureFailureScreenshot } = await import('./e2e/helpers/screenshots.js')
  await captureFailureScreenshot(test.title ?? 'unknown-test')
}
```

## Local script flow

```
npm run e2e:screenshots
  → npm run build && wdio run wdio.screenshots.conf.ts
    → captures every screen, compares against the committed baseline,
      writes .tmp/visual/actual/{tag}.png for every tag and
      .tmp/visual/diff/{tag}.png only for tags that changed beyond the
      configured compareOptions (currently `ignoreAntialiasing: true`).
      Does not modify e2e/screenshots/baseline/.

npm run e2e:screenshots:update
  → npm run build && wdio run wdio.screenshots.conf.ts --update-visual-baseline
    → captures every screen and force-overwrites every baseline.
      Use sparingly — see "Baseline-churn footgun" below.
```

`wdio.screenshots.conf.ts` resolves `baselineFolder` to `e2e/screenshots/baseline/` and writes diff/actual artifacts to `.tmp/visual/` (gitignored).

## Baseline-churn footgun

`--update-visual-baseline` overwrites every baseline file on every run, even when the captured pixels are identical to the previous baseline. PNG re-encoding is non-deterministic at the byte level — encoders can rewrite metadata or zlib streams without changing a single pixel — so the LFS pointer hash changes, and unrelated commits (docs, package.json, …) end up dragging an `Auto-update screenshot baselines` commit behind them.

Don't run CI with `--update-visual-baseline`. The CI workflow uses compare mode and promotes actuals to baselines only for tags that produced a diff PNG; that combination preserves the "capture changes that happened" property without churning unchanged baselines.

## Git LFS flow

1. `e2e/screenshots/baseline/` is LFS-tracked (rule in `.gitattributes`).
2. CI's `screenshot-regression` job runs the crawl in compare mode, then a follow-up step copies `.tmp/visual/actual/{tag}.png` over `e2e/screenshots/baseline/{tag}.png` for each `tag` that has a `.tmp/visual/diff/{tag}.png`.
3. `git add e2e/screenshots/baseline/ && git commit` → LFS stores binary, git stores pointer. Commit is skipped when no baseline was promoted.
4. `git push --force-with-lease`. The commit message contains `[skip ci]` so it doesn't loop.

## Why two wdio config files?

`wdio.conf.ts` excludes `screenshot-crawl.spec.ts` from the default run. When using `--spec` to override, wdio v9 still applies the `exclude` filter — so `--spec` cannot override an exclusion. A separate `wdio.screenshots.conf.ts` with `specs: ['./e2e/screenshot-crawl.spec.ts']` and no `exclude` is the clean solution.
