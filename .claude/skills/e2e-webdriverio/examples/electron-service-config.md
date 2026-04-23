# Example: Complete wdio.conf.ts for Electron

A complete, annotated `wdio.conf.ts` showing every pattern required for this project. The companion screenshot config (`wdio.screenshots.conf.ts`) follows the same skeleton but adds the `visual` service.

---

## The Complete Config

```typescript
import type { Options } from '@wdio/types'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── CRITICAL: unset ELECTRON_RUN_AS_NODE before anything else ─────────────────
//
// VS Code sets ELECTRON_RUN_AS_NODE=1 so that its extensions can run
// Electron's Node.js runtime as a plain Node process. When this env var
// is present Electron does NOT open a GUI window — it falls back to running
// as a bare Node.js process, which means WebdriverIO never gets a browser
// session to connect to.
//
// This must be at module top-level (not inside a hook) because wdio-electron-service
// inspects the environment synchronously during capability resolution, before any
// beforeSession/before hooks fire.
//
// Symptoms when missing:
//   - "Unable to connect to Electron" / connection timeout
//   - Electron exits immediately with code 0 after launch
//   - Tests fail inside VS Code terminal but pass in plain Terminal.app
//
delete process.env.ELECTRON_RUN_AS_NODE

export const config: Options.Testrunner = {
  runner: 'local',

  // ── Spec file discovery ────────────────────────────────────────────────────
  specs: ['./e2e/**/*.spec.ts'],

  exclude: [
    // extensions-integration.spec.ts requires a pre-packaged .clear.ext file on disk.
    // It cannot run in CI without that artifact, so it is excluded from the default
    // run and invoked separately via: npm run e2e:extensions
    './e2e/extensions-integration.spec.ts',

    // screenshot-crawl.spec.ts is a dedicated visual crawl (not functional tests).
    // It runs under wdio.screenshots.conf.ts which adds the @wdio/visual-service.
    // Running it here would fail because browser.checkScreen() is undefined without
    // the visual service registered.
    './e2e/screenshot-crawl.spec.ts',
  ],

  // Run one browser instance at a time. Electron tests share app state via
  // electron-store so parallel instances would corrupt each other's persisted
  // settings / sessions / cost records.
  maxInstances: 1,

  // ── Capabilities ───────────────────────────────────────────────────────────
  capabilities: [
    {
      browserName: 'electron',

      'wdio:electronServiceOptions': {
        // Point at the electron-vite main bundle output (unpackaged app).
        // electron-vite builds to out/main/index.js by default.
        // You MUST run `npm run build` before e2e tests — the service launches
        // this file directly, it does not trigger a build for you.
        appEntryPoint: path.join(__dirname, 'out/main/index.js'),

        // Extra CLI args forwarded to the Electron process.
        // Leave empty for the default functional run.
        // The screenshot config adds --force-device-scale-factor=1 here to pin
        // DPR to 1 so macOS Retina and Linux Xvfb produce identical screenshot sizes.
        appArgs: [],
      },

      // Required for CI (Ubuntu / Docker) environments where the kernel's
      // user namespace is restricted and Chromium's sandbox cannot be created.
      //
      // Without --no-sandbox: Electron exits immediately with "Failed to move
      // to new namespace" and the test runner prints "Error: spawn ENOENT".
      //
      // --disable-gpu: prevents GPU process crashes in headless environments.
      //
      // --disable-dev-shm-usage: Docker's /dev/shm is only 64 MB by default;
      // Chromium tries to use it for inter-process shared memory and crashes
      // when it overflows.  This flag falls back to /tmp instead.
      'goog:chromeOptions': {
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
  ],

  // ── Connection & timing ────────────────────────────────────────────────────
  logLevel: 'info',
  bail: 0,                       // never bail early — run all specs even after failures
  baseUrl: 'http://localhost',   // unused in Electron (file:// renderer) but required by schema
  waitforTimeout: 15000,         // default element wait timeout for $().waitForExist() etc.
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // ── Services ───────────────────────────────────────────────────────────────
  //
  // The functional config registers only the electron service.
  // The screenshot config (wdio.screenshots.conf.ts) also registers visual.
  //
  // If you add visual here it will throw on every functional spec:
  //   "browser.checkScreen is not a function"
  services: ['electron'],

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    // 60 s per test gives plenty of room for the renderer to load, React to
    // hydrate, IPC calls to return, and animations to settle — without letting
    // a genuinely hung test block CI for minutes.
    timeout: 60000,
  },

  // ── Hooks ──────────────────────────────────────────────────────────────────

  /**
   * Capture a failure screenshot after each test.
   * Saved to e2e/screenshots/failures/<sanitized-title>-<timestamp>.png
   * and uploaded as a CI artifact for debugging.
   *
   * Dynamic import keeps the screenshots helper out of the critical path —
   * if the import fails (e.g. wrong path) we log and continue rather than
   * turning the screenshot failure into a test failure.
   */
  afterEach: async function (test, _ctx, result) {
    if (result && !result.passed) {
      try {
        const { captureFailureScreenshot } = await import('./e2e/helpers/screenshots.js')
        await captureFailureScreenshot(test.title ?? 'unknown-test')
      } catch {
        // Best-effort — never fail a test because the screenshot helper errored
      }
    }
  },

  /**
   * Close the Electron window after each spec file.
   *
   * Without this, Electron accumulates open windows across spec files because
   * wdio-electron-service creates a new browser session per spec but the old
   * window is not destroyed. After 10 spec files you have 10 open Electron
   * windows fighting for focus, which causes click/keyboard events to go to
   * the wrong window and makes tests flaky.
   *
   * window.close() in the renderer triggers 'window-all-closed' → app.quit().
   * The try/catch handles the case where the browser session was already torn
   * down by the service before this hook fires.
   */
  after: async function () {
    try {
      await browser.execute(() => { window.close() })
    } catch {
      // Session may already be gone — that is fine
    }
  },

  /**
   * Kill any orphaned Electron processes after the full run finishes.
   *
   * If a test crashes the Electron main process hard (unhandled exception,
   * SIGABRT, OOM) the `after` hook above never fires and the process lingers.
   * pkill targets the exact entry-point path so it only kills OUR Electron
   * processes, not any other Electron apps the developer has open.
   *
   * `|| true` prevents a non-zero pkill exit code (no processes found) from
   * causing the onComplete hook itself to throw.
   */
  onComplete: async function () {
    try {
      const { execSync } = await import('child_process')
      execSync('pkill -f "out/main/index.js" 2>/dev/null || true', { stdio: 'ignore' })
    } catch {
      // Best-effort cleanup
    }
  },
}
```

---

## The Two-Config Pattern

This project uses two separate wdio config files:

| Config | Command | Services | Specs |
|--------|---------|----------|-------|
| `wdio.conf.ts` | `npm run e2e` | `electron` | All `*.spec.ts` except crawl + extensions-integration |
| `wdio.screenshots.conf.ts` | `npm run e2e:screenshots` | `electron` + `visual` | Only `screenshot-crawl.spec.ts` |

The split exists because `@wdio/visual-service` registers `browser.checkScreen()` globally. If the visual service is present during functional tests, any spec that accidentally calls `checkScreen` will write new baselines — silently corrupting the reference images. Keeping the configs separate makes it impossible to mix up.

The screenshot config also sets `appArgs: ['--force-device-scale-factor=1']` and `timeout: 120000` (crawl visits 60+ pages). Never put those in the functional config.

---

## Key Gotchas

**Build first.** The `appEntryPoint` is an already-built file. There is no watch mode. Run `npm run build` before every test run, or add it to your `pretest` / CI step.

**No `http://` navigation.** The Electron renderer loads via `file://` protocol. `browser.url('http://localhost:5173')` will not work — it navigates the Electron window to a web URL which loads a blank page or fails. Use `window.location.hash` for in-app navigation (see `navigateToHash` in `custom-helpers.md`).

**TypeScript source, not compiled JS.** The config file itself is TypeScript, loaded by tsx/ts-node via the `--loader` flag in the npm script. The `e2e/**/*.spec.ts` files are also TypeScript; wdio resolves them via the `@wdio/globals` type declarations. You do NOT need to pre-compile the test files.

**ELECTRON_RUN_AS_NODE must be top-level.** Do not move the `delete` call into `beforeSession` or any hook. By the time hooks run the capability resolution has already failed.
