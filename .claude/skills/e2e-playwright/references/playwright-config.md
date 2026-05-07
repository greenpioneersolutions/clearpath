# Playwright Config

Anatomy of `playwright.config.ts` for an Electron project. Replaces `wdio.conf.ts` plus the WDIO service block.

## Minimum config for Electron

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

// VS Code may set ELECTRON_RUN_AS_NODE=1 — clear it now so the env passed
// to electron.launch() (in fixtures.ts) doesn't inherit it.
delete process.env.ELECTRON_RUN_AS_NODE;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  testIgnore: [
    /screenshot-crawl\.spec\.ts/,
    /screenshot-crawl-experimental\.spec\.ts/,
    /extensions-integration\.spec\.ts/,
  ],
  workers: 1,                            // Electron is one window per worker — keep serial
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['blob']]
    : [['list', { printSteps: true }], ['html', { open: 'on-failure' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [{ name: 'electron' }],
  outputDir: 'test-results',
});
```

## `TestConfig` — every option that matters

| Option | Type | Default | What it does |
|--------|------|---------|--------------|
| `testDir` | string | `'.'` | Directory with test files. |
| `testMatch` | string \| RegExp \| array | `.*(test\|spec).(js\|ts\|mjs)` | Files to consider tests. |
| `testIgnore` | string \| RegExp \| array | — | Files to exclude even if matched. |
| `timeout` | number | `30000` | Per-test timeout. |
| `globalTimeout` | number | `0` | Whole-suite timeout (0 = no limit). |
| `retries` | number | `0` | Per-test retries. |
| `workers` | number \| `'50%'` | `'50%'` | **For Electron use `1`.** |
| `fullyParallel` | boolean | `false` | Run tests within a file in parallel — leave `false` for desktop apps with shared state. |
| `forbidOnly` | boolean | `false` | Fail if `test.only` exists (CI). |
| `failOnFlakyTests` | boolean | `false` | Treat any flaky test as a failure. |
| `globalSetup` / `globalTeardown` | string \| array | — | Path(s) to global setup/teardown files (run once around the whole run). |
| `outputDir` | string | `test-results` | Per-test artifact dir (screenshots, video, trace). |
| `snapshotDir` | string | `<spec>.ts-snapshots` | Where snapshots are stored. |
| `snapshotPathTemplate` | string | — | Template for snapshot paths. See `visual-testing.md`. |
| `updateSnapshots` | `'all' \| 'changed' \| 'missing' \| 'none'` | `'missing'` | What to update on `-u`. |
| `reporter` | string \| array \| custom | `'list'` (or `'dot'` on CI) | See below. |
| `use` | `TestOptions` | — | Browser/context/recording defaults — see below. |
| `expect` | object | — | `{ timeout, toHaveScreenshot, toMatchSnapshot, toPass }`. |
| `metadata` | object | — | Free-form, surfaces in reports. |
| `tsconfig` | string | — | Single tsconfig used to load tests (v1.47+). |
| `webServer` | object \| array | — | Spawn dev servers before tests — not used for Electron (we build instead). |
| `projects` | `TestProject[]` | — | Per-project overrides; for Electron typically a single `electron` project. |
| `maxFailures` | number | `0` | Stop after N failures. |
| `shard` | `{ total, current } \| null` | `null` | Set via `--shard=1/N` instead. |
| `respectGitIgnore` | boolean | `true` | |
| `ignoreSnapshots` | boolean | `false` | |

## `use:` — TestOptions you'll touch

| Option | Type | What it does |
|--------|------|--------------|
| `actionTimeout` | number | Default timeout for `click`, `fill`, etc. |
| `navigationTimeout` | number | Default timeout for `goto` and friends. |
| `trace` | `'off' \| 'on' \| 'on-first-retry' \| 'on-all-retries' \| 'retain-on-failure' \| 'retain-on-first-failure' \| 'retain-on-failure-and-retries'` | When to capture traces. |
| `screenshot` | `'off' \| 'on' \| 'only-on-failure'` | When to save final screenshots. |
| `video` | `'off' \| 'on' \| 'retain-on-failure' \| 'on-first-retry'` | When to record video. |
| `testIdAttribute` | string | Default `'data-testid'`. Override if you use a custom attribute. |
| `colorScheme` | `'light' \| 'dark' \| 'no-preference'` | Forwarded to `electron.launch` only if you wire it through. |
| `locale`, `timezoneId`, `geolocation` | — | Same — forward via fixtures. |
| `headless`, `viewport`, `channel`, `browserName` | — | **Browser-only**, do nothing for Electron. Don't bother. |

> Most `use:` options apply to browser projects. For Electron, the meaningful ones are `trace`, `screenshot`, `video`, `actionTimeout`, `navigationTimeout`, `testIdAttribute`. The rest belong in `electron.launch()` inside `fixtures.ts`.

## `expect:` block

```ts
expect: {
  timeout: 5000,
  toHaveScreenshot: {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixels: 100,
    maxDiffPixelRatio: 0.02,
    threshold: 0.2,
    pathTemplate: 'e2e/screenshots/baseline/{arg}{ext}',
    scale: 'css',
  },
  toMatchSnapshot: {
    maxDiffPixelRatio: 0.02,
    threshold: 0.2,
  },
  toPass: {
    timeout: 5000,
    intervals: [100, 250, 500, 1000],
  },
}
```

## Reporters

```ts
reporter: 'list'                       // single
reporter: 'html'                       // single, opens browser
reporter: [['list'], ['json', { outputFile: 'results.json' }]]   // multiple
reporter: process.env.CI ? 'github' : 'list'                     // conditional
```

| Reporter | When to use |
|----------|-------------|
| `list` | Default local run — line per test |
| `line` | Compact, single updating line |
| `dot` | Default CI — char per test |
| `html` | Self-contained web report — `open: 'always' \| 'never' \| 'on-failure'` |
| `blob` | Source for `merge-reports` (sharded CI) |
| `json` | Programmatic parsing |
| `junit` | CI integrations expecting JUnit XML |
| `github` | GitHub Actions inline failure annotations |
| `null` | Suppress |
| `'./my-reporter.ts'` | Custom |

## `projects[]` for Electron

Electron projects are usually a single project. Use multiple projects when you want to:
- Split smoke vs full suite — `{ name: 'smoke', testMatch: /smoke/, retries: 0 }`
- Run a setup phase first — `{ name: 'setup', testMatch: /setup/ }` + `{ name: 'main', dependencies: ['setup'] }`
- Test the unpackaged build AND the packaged binary in one run

```ts
projects: [
  { name: 'unpackaged', testIgnore: /\.packaged\.spec\.ts/ },
  { name: 'packaged', testMatch: /\.packaged\.spec\.ts/, dependencies: ['unpackaged'] },
]
```

Each project can override `use:`, `timeout`, `retries`, `expect`, `outputDir`, `snapshotPathTemplate`.

## Two-config pattern (functional vs visual)

The visual run wants different defaults — pin DPR, disable animations, use a different snapshot folder, longer timeout. Create a second config that imports and extends the base:

```ts
// playwright.screenshots.config.ts
import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testDir: './e2e',
  testMatch: /screenshot-crawl\.spec\.ts/,
  testIgnore: [],                                // override base ignore
  timeout: 120_000,
  expect: {
    ...baseConfig.expect,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
      pathTemplate: 'e2e/screenshots/baseline/{arg}{ext}',
    },
  },
});
```

Run via `npx playwright test -c playwright.screenshots.config.ts`.

## Global setup / teardown

Use these for one-time setup that doesn't fit a fixture (e.g. building the app, seeding fixtures, downloading test data).

```ts
// playwright.config.ts
export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  /* ... */
});
```

```ts
// e2e/global-setup.ts
import type { FullConfig } from '@playwright/test';
import { execSync } from 'node:child_process';
export default async function (_config: FullConfig) {
  // build is typically done by `npm run pw` not here — but you could:
  // execSync('npm run build', { stdio: 'inherit' });
}
```

```ts
// e2e/global-teardown.ts
export default async function () {
  // safety net: kill any orphaned Electron processes
  try {
    const { execSync } = await import('node:child_process');
    execSync('pkill -f "out/main/index.js" 2>/dev/null || true', { stdio: 'ignore' });
  } catch {}
}
```

## When to put logic in a fixture vs config

| Logic | Where |
|-------|-------|
| Per-test setup (login, fresh data) | Fixture |
| Per-worker setup (launch Electron) | Worker-scoped fixture |
| Once before whole run (build, download fixture data) | `globalSetup` |
| Once after whole run (kill orphans, upload artifacts) | `globalTeardown` |
| Defaults that vary by environment | `use:` in config |
| Defaults that vary by spec | `test.use({...})` at file level |
| Defaults for a single `describe` | `test.describe(() => { test.use({...}); ... })` |

## Override hierarchy

1. Inline option on the call (`page.click({ timeout: 60000 })`)
2. `test.use({...})` at describe/file level
3. Project-level `use:`
4. Top-level `use:`

Reset to inherited:
```ts
test.use({ baseURL: undefined });    // reverts to outer-defined value
```

Fully unset (skip inheritance):
```ts
test.use({
  baseURL: [async ({}, use) => use(undefined), { scope: 'test' }],
});
```
