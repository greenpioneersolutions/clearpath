import type { Options } from '@wdio/types'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./e2e/**/*.spec.ts'],
  exclude: [],
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
