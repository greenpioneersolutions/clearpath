import type { Options } from '@wdio/types'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// VS Code sets ELECTRON_RUN_AS_NODE=1 so its extension host process can use
// Electron as a pure Node.js runtime. This env var is inherited by any shell
// spawned from VS Code's integrated terminal. When it is set, the Electron
// binary runs without the browser-process APIs (process.type stays undefined,
// require('electron') resolves to the npm shim instead of the built-in module),
// which causes the main process to crash immediately. Unset it here so the
// Electron app launched by wdio-electron-service starts normally.
delete process.env.ELECTRON_RUN_AS_NODE

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./e2e/**/*.spec.ts'],
  exclude: [
    // extensions-integration requires a pre-packaged .clear.ext file.
    // Run it separately via: npm run e2e:extensions
    './e2e/extensions-integration.spec.ts',
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
