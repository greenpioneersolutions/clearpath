/**
 * wdio.screenshots.conf.ts
 *
 * Dedicated WebdriverIO configuration for the screenshot crawl spec.
 * Runs only e2e/screenshot-crawl.spec.ts — excluded from the default
 * wdio.conf.ts run so the visual crawl doesn't slow down functional tests.
 *
 * Usage:
 *   npm run e2e:screenshots          — write to e2e/screenshots/baseline/
 *   npm run e2e:screenshots:ci       — write to e2e/screenshots/actual/ (CI)
 */

import type { Options } from '@wdio/types'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// VS Code sets ELECTRON_RUN_AS_NODE=1 which prevents Electron from launching as
// a GUI app. Unset it so the screenshot crawl always gets a real Electron window.
delete process.env.ELECTRON_RUN_AS_NODE

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./e2e/screenshot-crawl.spec.ts'],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
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
    // Allow extra time — the crawl visits every page and tab
    timeout: 120000,
  },

  after: async function () {
    try {
      await browser.execute(() => { window.close() })
    } catch {
      // Browser session may already be gone
    }
  },

  onComplete: async function () {
    try {
      const { execSync } = await import('child_process')
      execSync('pkill -f "out/main/index.js" 2>/dev/null || true', { stdio: 'ignore' })
    } catch {
      // Best-effort cleanup
    }
  },
}
