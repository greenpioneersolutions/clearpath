# wdio.conf.ts Anatomy

Complete reference for all WDIO Testrunner configuration options used in this project.

## Full Config Structure

```typescript
import type { Options } from '@wdio/types'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// MUST be before export — VS Code sets this and breaks Electron launch
delete process.env.ELECTRON_RUN_AS_NODE

export const config: Options.Testrunner = {
  // ── Runner ──────────────────────────────────────────────────────────────────
  runner: 'local',  // 'local' = Node.js (default); 'browser' = component testing

  // ── Specs ───────────────────────────────────────────────────────────────────
  specs: ['./e2e/**/*.spec.ts'],
  exclude: [
    './e2e/extensions-integration.spec.ts',  // requires packaged .ext file
    './e2e/screenshot-crawl.spec.ts',         // run via npm run e2e:screenshots
  ],

  // ── Parallelism ─────────────────────────────────────────────────────────────
  maxInstances: 1,  // Always 1 for Electron — one window at a time

  // ── Capabilities ────────────────────────────────────────────────────────────
  capabilities: [{
    browserName: 'electron',
    'wdio:electronServiceOptions': {
      appEntryPoint: path.join(__dirname, 'out/main/index.js'),
      appArgs: [],
    },
    'goog:chromeOptions': {
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    },
  }],

  // ── Logging ─────────────────────────────────────────────────────────────────
  logLevel: 'info',  // 'trace'|'debug'|'info'|'warn'|'error'|'silent'

  // ── Stability ───────────────────────────────────────────────────────────────
  bail: 0,                            // 0 = run all tests even if some fail
  waitforTimeout: 15000,              // default for all waitFor* (ms)
  connectionRetryTimeout: 120000,     // driver connection timeout (ms)
  connectionRetryCount: 3,            // retry connection N times

  // ── Services ────────────────────────────────────────────────────────────────
  services: ['electron'],             // or [['electron', options], ['visual', options]]

  // ── Framework ───────────────────────────────────────────────────────────────
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,  // per-test timeout (ms)
  },

  // ── Retries ─────────────────────────────────────────────────────────────────
  specFileRetries: 0,       // retry failed spec file N times
  specFileRetriesDelay: 1,  // seconds between retries

  // ── Hooks ───────────────────────────────────────────────────────────────────
  onPrepare: async () => { /* runs once before all workers start */ },
  onComplete: async () => { /* runs once after all workers finish */ },
  before: async () => { /* runs before each spec file's first test */ },
  after: async () => { /* runs after each spec file's last test */ },
  beforeEach: async () => { /* runs before each it() */ },
  afterEach: async (test, ctx, result) => { /* runs after each it() */ },
}
```

## Key Hooks in This Project

```typescript
afterEach: async function(test, _ctx, result) {
  // Capture failure screenshot for debugging
  if (result && !result.passed) {
    try {
      const { captureFailureScreenshot } = await import('./e2e/helpers/screenshots.js')
      await captureFailureScreenshot(test.title ?? 'unknown-test')
    } catch { /* best-effort */ }
  }
},

after: async function() {
  // Close Electron window — prevents orphaned processes
  try {
    await browser.execute(() => { window.close() })
  } catch { /* session may already be gone */ }
},

onComplete: async function() {
  // Safety net: kill any lingering Electron processes
  try {
    const { execSync } = await import('child_process')
    execSync('pkill -f "out/main/index.js" 2>/dev/null || true', { stdio: 'ignore' })
  } catch { /* best-effort */ }
},
```

## Two-Config Pattern

This project has two separate wdio config files:

| Config | Specs | Run via |
|--------|-------|---------|
| `wdio.conf.ts` | All `e2e/**/*.spec.ts` except crawl | `npm run e2e` |
| `wdio.screenshots.conf.ts` | `e2e/screenshot-crawl.spec.ts` only | `npm run e2e:screenshots` |

**Why separate?** In WDIO v9, the `--spec` CLI flag cannot override `exclude` entries. Since `screenshot-crawl.spec.ts` is listed in `exclude` in `wdio.conf.ts`, it is impossible to run it with `--spec`. A separate config with `specs: ['./e2e/screenshot-crawl.spec.ts']` and no `exclude` solves this cleanly.

## Adding Visual Service

```typescript
services: [
  'electron',
  ['visual', {
    baselineFolder: './e2e/screenshots/baseline',
    screenshotPath: './e2e/screenshots',
    autoSaveBaseline: true,
    formatImageName: '{tag}',
    disableCSSAnimation: true,
    hideScrollBars: true,
  }]
],
```

Add `/// <reference types="@wdio/visual-service" />` to spec files that use `checkScreen()` so TypeScript recognises the browser command.

## Multi-Environment Config Merging

Use `deepmerge-ts` to merge a base config with environment overrides:

```typescript
// wdio.ci.conf.ts
import { deepmerge } from 'deepmerge-ts'
import { config as baseConfig } from './wdio.conf.ts'

export const config = deepmerge(baseConfig, {
  logLevel: 'warn',
  specFileRetries: 2,
  mochaOpts: { timeout: 120000 },
})
```

## Suites

Group specs into named suites for selective runs:

```typescript
suites: {
  smoke: ['./e2e/smoke.spec.ts', './e2e/home.spec.ts'],
  full: ['./e2e/**/*.spec.ts'],
  configure: ['./e2e/configure.spec.ts'],
},
```

Run with: `npx wdio run wdio.conf.ts --suite smoke`
