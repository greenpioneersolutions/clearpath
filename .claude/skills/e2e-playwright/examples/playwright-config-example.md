# Example: `playwright.config.ts` (annotated)

A complete `playwright.config.ts` for CoPilot Commander, plus the visual regression variant.

## `playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test';

// VS Code's terminal sets ELECTRON_RUN_AS_NODE=1, which makes Electron launch
// as plain Node (no GUI). Strip it BEFORE we even read process.env in fixtures.
delete process.env.ELECTRON_RUN_AS_NODE;

export default defineConfig({
  // Where specs live
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,

  // Excluded specs (each runs from a different config or CI workflow)
  testIgnore: [
    /screenshot-crawl\.spec\.ts/,                  // visual config
    /screenshot-crawl-experimental\.spec\.ts/,     // experimental visual config
    /extensions-integration\.spec\.ts/,            // separate workflow (needs prebuilt .clear.ext)
  ],

  // Electron is single-window per worker — keep tests serial.
  workers: 1,
  fullyParallel: false,

  // CI gets retries; local doesn't (so flake is visible immediately).
  retries: process.env.CI ? 2 : 0,

  // Fail CI builds that have stray test.only.
  forbidOnly: !!process.env.CI,

  // Per-test budget; overridden via test.setTimeout for long-running tests.
  timeout: 60_000,

  // Whole-suite timeout (1 hour) — safety net if a test hangs.
  globalTimeout: process.env.CI ? 60 * 60 * 1000 : 0,

  // expect() retry budget for assertions like toBeVisible/toHaveText.
  expect: {
    timeout: 10_000,
  },

  // What to capture per test.
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'on-first-retry',          // capture trace only when retried
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid',
  },

  // Reporters: list locally for tight feedback; multiple on CI for HTML + GH annotations.
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['blob'],   // for shard merging
      ]
    : [['list', { printSteps: true }], ['html', { open: 'on-failure' }]],

  // Single Electron project. Add more if testing packaged binary too.
  projects: [{ name: 'electron' }],

  // Per-test artifacts (screenshots, video, trace) land here.
  outputDir: 'test-results',

  // Optional safety net: kill orphaned Electron processes if a worker crashes.
  globalTeardown: './e2e/global-teardown.ts',
});
```

### `e2e/global-teardown.ts`

```ts
export default async function () {
  try {
    const { execSync } = await import('node:child_process');
    execSync('pkill -f "out/main/index.js" 2>/dev/null || true', { stdio: 'ignore' });
  } catch {}
}
```

## `playwright.screenshots.config.ts`

```ts
import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,

  // Run ONLY the crawl spec
  testDir: './e2e',
  testMatch: /screenshot-crawl\.spec\.ts/,
  testIgnore: [],

  // The crawl is a long, single-spec run.
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,

  // Visual diffs need stable rendering.
  expect: {
    ...baseConfig.expect,
    timeout: 15_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
      pathTemplate: 'e2e/screenshots/baseline/{arg}{ext}',
      scale: 'css',
    },
  },

  use: {
    ...baseConfig.use,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',                       // visual run doesn't need video
  },

  // Artifacts (failure diffs etc.) go in a separate dir to avoid mixing with functional run.
  outputDir: 'test-results-visual',
});
```

The visual config inherits everything from the base config and overrides only what the visual run needs differently.

## `package.json` scripts

```json
{
  "scripts": {
    "pw": "npm run build && playwright test",
    "pw:headed": "npm run build && playwright test --headed --workers=1",
    "pw:debug": "npm run build && playwright test --debug",
    "pw:ui": "npm run build && playwright test --ui",
    "pw:screenshots": "npm run build && playwright test -c playwright.screenshots.config.ts",
    "pw:screenshots:update": "npm run build && playwright test -c playwright.screenshots.config.ts -u",
    "pw:report": "playwright show-report",
    "typecheck:playwright": "tsc -p tsconfig.playwright.json --noEmit"
  }
}
```

## `tsconfig.playwright.json`

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ESNext", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "out/e2e",
    "rootDir": ".",
    "types": ["@playwright/test", "node"]
  },
  "include": [
    "e2e/**/*.ts",
    "playwright.config.ts",
    "playwright.screenshots.config.ts",
    "src/renderer/types/electronAPI.d.ts"
  ]
}
```

## What replaces WDIO's `afterTest` screenshot hook

`wdio.conf.ts` has a custom `afterTest` hook that calls `captureFailureScreenshot(test.title)` whenever a test fails. **In Playwright, the built-in `screenshot: 'only-on-failure'` config (above) does this automatically** — failure screenshots are saved under `test-results/<test-name>/test-failed-<n>.png` and surface in the HTML report.

If you need a custom failure screenshot path or filename, use `test.afterEach`:

```ts
// e2e/fixtures.ts (or per-spec)
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({
      path: `e2e/screenshots/failures/${testInfo.title.replace(/\W/g, '-')}.png`,
    });
  }
});
```

Equivalent for `wdio.conf.ts`'s `after` hook (closing the window) and `onComplete` (pkill orphans):
- `after` (per-spec): replaced by per-test fixture teardown — the worker-scoped `electronApp` fixture's `await app.close()` runs at the end of the worker.
- `onComplete`: replaced by `globalTeardown:` — see `e2e/global-teardown.ts` above.

## Why these defaults

| Choice | Rationale |
|--------|-----------|
| `workers: 1`, `fullyParallel: false` | One Electron window per worker; multiple instances compete for `electron-store` files and OS keychain. |
| `retries: 2` on CI | Catches genuine flake without masking real failures (with `failOnFlakyTests`, you can later enforce zero flake). |
| `trace: 'on-first-retry'` | Cheap on success; full trace on retry — exactly when you need it. |
| `screenshot: 'only-on-failure'` | Keeps disk usage sane; failure has its own image. |
| `video: 'retain-on-failure'` | More disk, but invaluable for "what was happening just before the crash." |
| `expect.timeout: 10_000` | Matches WDIO's `waitforTimeout: 15_000` (slightly tighter — adjust if specs flake on slow CI). |
| `forbidOnly` only on CI | Local `test.only` workflow stays convenient. |
| Reporter conditional | `list` is tight for local; `github` annotations + `html` + `blob` for CI is the canonical recipe. |
| Visual config separate | Different timeout, different snapshot path, different DPR — keeping them in one config is unmanageable. |

## Adding a packaged-binary smoke project

```ts
projects: [
  { name: 'unpackaged' },
  {
    name: 'packaged',
    testMatch: /\.packaged\.spec\.ts/,
    use: {},                   // empty — fixture handles it
  },
],
```

The packaged project's fixtures pass `executablePath` for the built binary instead of `args: [APP_ENTRY]`. Run with:
```bash
npx playwright test --project=packaged
```
