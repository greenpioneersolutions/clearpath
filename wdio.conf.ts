import type { Options } from '@wdio/types'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// VS Code sets ELECTRON_RUN_AS_NODE=1 which prevents Electron from launching
// as a GUI app (it runs as a plain Node.js process instead). Unset it here so
// the wdio runner always gets a real Electron window regardless of how it is invoked.
delete process.env.ELECTRON_RUN_AS_NODE

// Screenshot capture: afterEach saves failure screenshots to e2e/screenshots/failures/
// Full visual crawl: npm run e2e:screenshots (runs screenshot-crawl.spec.ts separately)
// Baseline update: npm run e2e:screenshots:update (SCREENSHOT_DIR=e2e/screenshots/baseline)

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./e2e/**/*.spec.ts'],
  exclude: [
    // extensions-integration requires a pre-packaged .clear.ext file.
    // Run it separately via: npm run e2e:extensions
    './e2e/extensions-integration.spec.ts',
    // screenshot-crawl is a dedicated visual crawl spec — not a functional test.
    // Run it separately via: npm run e2e:screenshots
    './e2e/screenshot-crawl.spec.ts',
  ],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        // Point at the built electron-vite main bundle (unpackaged app).
        // Must run `npm run build` before e2e tests.
        appEntryPoint: path.join(__dirname, 'out/main/index.js'),
        appArgs: [],
      },
      // Required for CI environments (Ubuntu/Docker) where Chromium's sandbox
      // is unavailable. Without --no-sandbox the Electron process exits immediately.
      'goog:chromeOptions': {
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
  ],

  logLevel: 'info',
  bail: 0,
  baseUrl: 'http://localhost',
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: ['electron'],
  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  afterEach: async function (test, _ctx, result) {
    // Capture screenshot on test failure for debugging
    if (result && !result.passed) {
      try {
        const { captureFailureScreenshot } = await import('./e2e/helpers/screenshots.js')
        await captureFailureScreenshot(test.title ?? 'unknown-test')
      } catch {
        // Best-effort — don't fail the test over a screenshot error
      }
    }
  },

  /**
   * Ensure the Electron app is fully terminated after each spec file.
   * Without this, Electron processes can linger and accumulate
   * (dozens of orphaned windows after a full test run).
   */
  after: async function () {
    try {
      // Close the Electron window — triggers window-all-closed → app.quit()
      await browser.execute(() => { window.close() })
    } catch {
      // Browser session may already be gone
    }
  },

  /**
   * Final safety net: kill any orphaned Electron processes after the
   * entire test run completes.
   */
  onComplete: async function () {
    // On macOS/Linux, kill any lingering Electron processes from our app
    try {
      const { execSync } = await import('child_process')
      execSync('pkill -f "out/main/index.js" 2>/dev/null || true', { stdio: 'ignore' })
    } catch {
      // Best-effort cleanup — ignore failures
    }
  },
}
