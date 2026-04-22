# Screenshot System Architecture

## File map

| File | Role |
|---|---|
| `e2e/helpers/screenshots.ts` | Core utilities — path resolution, `captureScreenshot`, `captureFailureScreenshot` |
| `e2e/screenshot-crawl.spec.ts` | Data-driven crawl spec — data tables + describe blocks |
| `wdio.screenshots.conf.ts` | Dedicated wdio runner config for the crawl (separate from `wdio.conf.ts`) |
| `wdio.conf.ts` | Main functional test config — excludes crawl spec, has `afterEach` failure hook |
| `.gitattributes` | LFS rule: `e2e/screenshots/**/*.png filter=lfs diff=lfs merge=lfs -text` |
| `.gitignore` | Ignores `actual/`, `failures/`, `diff/` — only `baseline/` is committed |

## `e2e/helpers/screenshots.ts` — key exports

```typescript
// Resolved from SCREENSHOT_DIR env var, defaults to e2e/screenshots/baseline
export const SCREENSHOT_DIR: string

// Sanitize name → lowercase hyphens, mkdirSync, return .png path
export function resolveScreenshotPath(name: string): string

// browser.saveScreenshot(path) + console.log("[screenshot] Saved: ...")
export async function captureScreenshot(name: string): Promise<string>

// Best-effort: saves to e2e/screenshots/failures/{timestamp}--{title}.png
// Never throws — wraps everything in try/catch
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
  './e2e/screenshot-crawl.spec.ts',  // ← run via npm run e2e:screenshots instead
]

// Capture failure screenshot for any failing functional test
afterEach: async function (test, _ctx, result) {
  if (result && !result.passed) {
    const { captureFailureScreenshot } = await import('./e2e/helpers/screenshots.js')
    await captureFailureScreenshot(test.title ?? 'unknown-test')
  }
}
```

## Environment variable flow

```
npm run e2e:screenshots
  → SCREENSHOT_DIR=e2e/screenshots/baseline npx wdio run wdio.screenshots.conf.ts
    → screenshots.ts reads process.env.SCREENSHOT_DIR
      → resolveScreenshotPath() resolves to {cwd}/e2e/screenshots/baseline/{name}.png

npm run e2e:screenshots:ci
  → SCREENSHOT_DIR=e2e/screenshots/actual npx wdio run wdio.screenshots.conf.ts
    → screenshots.ts reads process.env.SCREENSHOT_DIR
      → resolveScreenshotPath() resolves to {cwd}/e2e/screenshots/actual/{name}.png
```

## Git LFS flow

1. `e2e/screenshots/baseline/` is LFS-tracked (rule in `.gitattributes`)
2. `npm run e2e:screenshots` writes PNGs there
3. `git add e2e/screenshots/baseline/ && git commit` → LFS stores binary, git stores pointer
4. CI `update-screenshots` job automates steps 2–3 and pushes back to the branch

## Why two wdio config files?

`wdio.conf.ts` excludes `screenshot-crawl.spec.ts` from the default run. When using `--spec` to override, wdio v9 still applies the `exclude` filter — so `--spec` cannot override an exclusion. A separate `wdio.screenshots.conf.ts` with `specs: ['./e2e/screenshot-crawl.spec.ts']` and no `exclude` is the clean solution.
