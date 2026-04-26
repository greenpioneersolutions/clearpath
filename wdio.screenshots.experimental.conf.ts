/**
 * wdio.screenshots.experimental.conf.ts
 *
 * Dedicated WebdriverIO configuration for the experimental-feature
 * screenshot crawl. The matching `npm run e2e:screenshots:experimental`
 * script builds the app with CLEARPATH_E2E_EXPERIMENTAL=1 first so the
 * tree-shaken experimental page chunks are included in the bundle.
 *
 * Baselines live under e2e/screenshots/baseline/experimental-features/
 * to keep them out of the default visual baseline.
 *
 * Mirrors wdio.screenshots.conf.ts settings (DPR=1, --no-sandbox, dark
 * mode forced, hidden scrollbars, antialiasing tolerance) so screenshots
 * remain comparable across host platforms.
 */

import type { Options } from '@wdio/types'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// VS Code sets ELECTRON_RUN_AS_NODE=1 which prevents Electron from launching.
delete process.env.ELECTRON_RUN_AS_NODE

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./e2e/screenshot-crawl-experimental.spec.ts'],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        appEntryPoint: path.join(__dirname, 'out/main/index.js'),
        appArgs: ['--force-device-scale-factor=1'],
      },
      'goog:chromeOptions': {
        args: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--force-dark-mode',
          '--hide-scrollbars',
        ],
      },
    },
  ],

  logLevel: 'info',
  bail: 0,
  baseUrl: 'http://localhost',
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    'electron',
    [
      'visual',
      {
        baselineFolder: path.join(__dirname, 'e2e/screenshots/baseline'),
        screenshotPath: path.join(__dirname, '.tmp/visual'),
        formatImageName: '{tag}',
        autoSaveBaseline: true,
        alwaysSaveActualImage: true,
        disableCSSAnimation: true,
        disableBlinkingCursor: true,
        hideScrollBars: true,
        compareOptions: {
          ignoreAntialiasing: true,
        },
      },
    ],
  ],

  before: async function () {
    await browser.electron.execute((electron) => {
      const win =
        electron.BrowserWindow.getFocusedWindow() ??
        electron.BrowserWindow.getAllWindows()[0]
      win?.setContentSize(1280, 800)
    })
    await browser.pause(300)
  },

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
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
