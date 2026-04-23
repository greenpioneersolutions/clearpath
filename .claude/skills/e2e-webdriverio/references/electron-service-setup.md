# Electron Service Setup — wdio-electron-service

A complete reference for configuring WebdriverIO v9 with `wdio-electron-service` to drive Electron apps in end-to-end tests.

---

## Installation

```bash
npm install --save-dev wdio-electron-service
```

WebdriverIO peer dependencies (if not already installed):

```bash
npm install --save-dev @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter
```

`wdio-electron-service` v9+ automatically manages the Chromedriver binary that matches your installed Electron version — no separate `chromedriver` install is needed for Electron v26+.

---

## Critical: ELECTRON_RUN_AS_NODE Must Be Unset

**This must be the very first thing in every wdio config file, before `export const config`.**

```typescript
// wdio.conf.ts  ← top of file, before any imports resolve to export
delete process.env.ELECTRON_RUN_AS_NODE
```

**Why:** VS Code sets `ELECTRON_RUN_AS_NODE=1` in its integrated terminal and task runner environments. When this env var is set, Electron launches as a plain Node.js process instead of a GUI — the renderer window never opens, and all browser commands fail immediately. Unsetting it at the top of the config file ensures it is cleared before wdio spawns any worker process.

This must live in every config file that launches Electron (e.g., both `wdio.conf.ts` and `wdio.screenshots.conf.ts`).

---

## Core Config Structure

Minimum required settings in `wdio.conf.ts`:

```typescript
delete process.env.ELECTRON_RUN_AS_NODE  // MUST be first

import { defineConfig } from '@wdio/config'

export const config = defineConfig({
  runner: 'local',
  specs: ['./e2e/**/*.spec.ts'],
  exclude: [],
  maxInstances: 1,                 // Electron tests must run serially
  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        appEntryPoint: './out/main/index.js',
      },
    },
  ],
  services: [['electron', {}]],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
})
```

---

## Service-Level vs Capability-Level Config

Options can be set at two levels. **Capability-level takes precedence** over service-level.

| Level | Location | Scope |
|---|---|---|
| Service-level | `services: [['electron', { ...options }]]` | Applies to all capabilities |
| Capability-level | `'wdio:electronServiceOptions': { ...options }` inside capability | Applies to that capability only |

Use **capability-level** when you need different settings per environment (e.g., dev build vs packaged `.app`):

```typescript
capabilities: [
  {
    browserName: 'electron',
    'wdio:electronServiceOptions': {
      appEntryPoint: './out/main/index.js',  // dev build
      // overrides service-level options for this cap
    },
  },
],
services: [
  [
    'electron',
    {
      // Service-level defaults (lower precedence)
      clearMocks: true,
    },
  ],
],
```

---

## appEntryPoint vs appBinaryPath

| Option | Value | When to use |
|---|---|---|
| `appEntryPoint` | Path to compiled main process JS | **Unpackaged dev build** — use during CI/CD before packaging. For electron-vite projects this is `./out/main/index.js`. |
| `appBinaryPath` | Path to packaged `.app` / `.exe` | **Packaged artifact** — use for acceptance testing of the final distributable. |

Only one of these should be set per capability.

```typescript
// Development / CI build testing
'wdio:electronServiceOptions': {
  appEntryPoint: './out/main/index.js',
}

// Acceptance testing of packaged app
'wdio:electronServiceOptions': {
  appBinaryPath: './dist/mac-arm64/MyApp.app',
}
```

For electron-vite projects, `out/main/index.js` is produced by `npm run build` (or `electron-vite build`). Run the build step before running e2e tests in CI.

---

## Chromedriver Management

In v9, `wdio-electron-service` auto-detects the Electron version from your `package.json` and downloads the matching Chromedriver. No manual configuration is needed for Electron v26+.

For older Electron versions, or if auto-detection fails, pin the version explicitly:

```typescript
services: [
  [
    'electron',
    {
      // Only needed for Electron < 26 or if auto-detection fails
      chromedriverCustomPath: '/path/to/chromedriver',
    },
  ],
],
```

---

## CI Chromium Flags (Linux/Docker)

Linux CI environments (GitHub Actions, Docker) run Chromium without a user namespace sandbox. Without these flags, Electron will crash on launch.

Add them to the capability's `goog:chromeOptions`:

```typescript
capabilities: [
  {
    browserName: 'electron',
    'goog:chromeOptions': {
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    },
    'wdio:electronServiceOptions': {
      appEntryPoint: './out/main/index.js',
    },
  },
],
```

These flags are harmless on macOS/Windows and safe to include unconditionally, or conditionally via:

```typescript
const isCI = !!process.env.CI
const chromeArgs = isCI
  ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  : []
```

---

## Mock Lifecycle Options

These service-level options automatically run mock cleanup between tests, avoiding state bleed:

| Option | Default | Effect |
|---|---|---|
| `clearMocks` | `false` | Calls `mock.mockClear()` after each test — clears call history, keeps implementation |
| `resetMocks` | `false` | Calls `mock.mockReset()` after each test — clears call history and implementation |
| `restoreMocks` | `false` | Calls `mock.mockRestore()` after each test — restores original Electron API |

```typescript
services: [
  [
    'electron',
    {
      appEntryPoint: './out/main/index.js',
      clearMocks: true,   // recommended minimum
    },
  ],
],
```

Only set `restoreMocks: true` if you need to fully reset Electron APIs between every test. `clearMocks: true` is sufficient for most suites.

---

## Two-Config Pattern

`wdio.conf.ts` (functional tests) and `wdio.screenshots.conf.ts` (visual crawl) are kept as separate files. This is intentional.

**Why `--spec` cannot override `exclude`:** In WebdriverIO v9, passing `--spec path/to/file.spec.ts` on the CLI does NOT bypass the `exclude` array in `wdio.conf.ts`. If a spec is listed in `exclude`, it will not run even if explicitly specified via `--spec`.

The clean solution is a separate config file for the excluded spec:

| Config file | `specs` | `exclude` | Purpose |
|---|---|---|---|
| `wdio.conf.ts` | `./e2e/**/*.spec.ts` | `['./e2e/screenshot-crawl.spec.ts']` | Functional test suite |
| `wdio.screenshots.conf.ts` | `['./e2e/screenshot-crawl.spec.ts']` | _(none)_ | Visual crawl only |

Run them with separate npm scripts:

```json
{
  "scripts": {
    "e2e": "npx wdio run wdio.conf.ts",
    "e2e:screenshots": "npx wdio run wdio.screenshots.conf.ts"
  }
}
```

---

## Minimal Working Config Stub

```typescript
// wdio.conf.ts
delete process.env.ELECTRON_RUN_AS_NODE  // Must be first — fixes VS Code env pollution

import { defineConfig } from '@wdio/config'

const isCI = !!process.env.CI

export const config = defineConfig({
  runner: 'local',

  specs: ['./e2e/**/*.spec.ts'],
  exclude: [
    './e2e/screenshot-crawl.spec.ts',  // run via wdio.screenshots.conf.ts
  ],

  maxInstances: 1,  // Electron must run serially

  capabilities: [
    {
      browserName: 'electron',
      'goog:chromeOptions': {
        args: isCI
          ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
          : [],
      },
      'wdio:electronServiceOptions': {
        appEntryPoint: './out/main/index.js',
      },
    },
  ],

  services: [
    [
      'electron',
      {
        clearMocks: true,
      },
    ],
  ],

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  onPrepare() {
    // Set TEST=true so Electron conditionally imports wdio-electron-service/main
    process.env.TEST = 'true'
  },
})
```
