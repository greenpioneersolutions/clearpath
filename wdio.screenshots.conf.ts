/**
 * wdio.screenshots.conf.ts
 *
 * Dedicated WebdriverIO configuration for the screenshot crawl spec.
 * Runs only e2e/screenshot-crawl.spec.ts — excluded from the default
 * wdio.conf.ts run so the visual crawl doesn't slow down functional tests.
 *
 * Visual regression is handled by @wdio/visual-service, which does pixel-level
 * comparison against committed baselines (e2e/screenshots/baseline/).
 *
 * Usage:
 *   npm run e2e:screenshots          — compare against baselines (auto-creates missing)
 *   npm run e2e:screenshots:update   — force-update all baselines with current UI
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
        // Force device pixel ratio to 1 so screenshots are always captured at
        // 1280×800 logical pixels regardless of the host display (macOS Retina
        // = DPR 2 by default; Linux CI Xvfb = DPR 1). Without this, Mac
        // baselines are 2560×1600 and CI actuals are 1280×800 → 50%+ mismatch.
        appArgs: ['--force-device-scale-factor=1'],
      },
      // Required for CI environments (Ubuntu/Docker) where Chromium's sandbox
      // is unavailable. Without --no-sandbox the Electron process exits immediately.
      'goog:chromeOptions': {
        args: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          // Force prefers-color-scheme: dark so the app's BrandingContext always
          // toggles the Tailwind `dark` class — matches the macOS dev machine.
          '--force-dark-mode',
          // Hide OS scrollbars so they don't reduce the usable viewport width
          // by 1px on Linux (causing 1279px actuals vs 1280px baselines).
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
        // Baseline images — committed to Git LFS, compared on every run
        baselineFolder: path.join(__dirname, 'e2e/screenshots/baseline'),
        // Actual + diff images — ephemeral, gitignored, uploaded as CI artifacts
        screenshotPath: path.join(__dirname, '.tmp/visual'),
        // Use the raw tag name as the filename so naming matches existing baselines.
        // Without this the service appends browser/resolution: home--initial-electron-1280x800-dpr-1
        formatImageName: '{tag}',
        // Auto-create a baseline when none exists for a given tag so the first
        // run on a new page doesn't fail — it just saves the initial baseline.
        autoSaveBaseline: true,
        // Save actual screenshots on every run (even when they match) so CI
        // artifacts always contain the full set for manual inspection.
        alwaysSaveActualImage: true,
        // Ignore sub-pixel anti-aliasing differences that occur when comparing
        // macOS (CoreText) vs Linux (FreeType) font rendering. Real layout and
        // colour regressions still register as clearly distinct mismatch.
        compareOptions: {
          ignoreAntialiasing: true,
        },
      },
    ],
  ],

  before: async function () {
    // Pin the Electron window's content area to exactly 1280×800 on every
    // platform. BrowserWindow is created with { width: 1280, height: 800 }
    // but that is the *outer* size — the OS titlebar eats a different number
    // of pixels per platform (macOS ~32 px → 768 px content; Linux ~28 px →
    // 772 px content). setContentSize sets the *inner* viewport to a fixed
    // size so screenshots are always 1280×800 regardless of host OS.
    await browser.electron.execute((electron) => {
      const win =
        electron.BrowserWindow.getFocusedWindow() ??
        electron.BrowserWindow.getAllWindows()[0]
      win?.setContentSize(1280, 800)
    })
    // Brief pause for the window resize to propagate to the renderer
    await browser.pause(300)
  },

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    // Allow extra time — the crawl visits every page and tab
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
