/**
 * e2e/fixtures.ts
 *
 * Playwright fixtures for the Electron app.
 *
 *  - `electronApp` is worker-scoped: one Electron process per worker, reused
 *    across all tests in that worker. (Electron is single-window-per-instance,
 *    so `workers: 1` in playwright.config.ts keeps the suite serial.)
 *  - `page` is test-scoped: returns the Electron app's first window. We pin
 *    the content size to 1280×800 on every platform so visual baselines are
 *    stable across mac (HiDPI/CoreText) and linux (Xvfb/FreeType).
 *  - `consoleErrors` is auto-attached: collects `console.error` and
 *    `pageerror` for the duration of each test and writes them as a test
 *    attachment on failure.
 *  - `userDataDir` gives each worker an isolated electron-store dir so a
 *    parallel run (or rerun after a crash) starts from a clean slate.
 */
import {
  test as base,
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
  type ConsoleMessage,
} from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// Playwright runs from the project root, so process.cwd() is stable.
// Avoids needing import.meta (CJS/ESM compatibility) or __dirname (only in CJS).
const PROJECT_ROOT = process.cwd()
const APP_ENTRY = path.join(PROJECT_ROOT, 'out', 'main', 'index.js')
const USER_DATA_ROOT = path.join(PROJECT_ROOT, 'e2e', '.userData')

type WorkerFixtures = {
  electronApp: ElectronApplication
  userDataDir: string
}

type TestFixtures = {
  page: Page
  consoleErrors: string[]
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // ── WORKER-SCOPED ────────────────────────────────────────────────────────

  userDataDir: [
    async ({}, use, workerInfo) => {
      const dir = path.join(USER_DATA_ROOT, `worker-${workerInfo.workerIndex}`)
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })
      await use(dir)
    },
    { scope: 'worker' },
  ],

  electronApp: [
    async ({ userDataDir }, use) => {
      // VS Code sets ELECTRON_RUN_AS_NODE=1 in child terminals — without
      // unsetting, Electron launches as plain Node with no renderer.
      // Filter out undefined entries — _electron.launch requires string-only values.
      const env: Record<string, string> = {}
      for (const [k, v] of Object.entries(process.env)) {
        if (typeof v === 'string') env[k] = v
      }
      env.NODE_ENV = 'test'
      delete env.ELECTRON_RUN_AS_NODE

      const args = [
        APP_ENTRY,
        `--user-data-dir=${userDataDir}`,
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--force-device-scale-factor=1',
        '--hide-scrollbars',
      ]

      // NOTE: dark mode for the visual configs is enforced via
      // `page.emulateMedia({ colorScheme: 'dark' })` in the per-test `page`
      // fixture below — NOT via Chromium's `--force-dark-mode` flag. The
      // CLEARPATH_E2E_VISUAL=1 signal must be set on the PARENT process
      // (npm scripts: `pw:screenshots*` | CI: workflow `env:` block on the
      // visual jobs) — Playwright workers fork from the parent at start, so
      // mutating process.env from a config module won't reach them.

      const app = await electron.launch({ args, env, timeout: 30_000 })

      // Forward main-process logs — invaluable when diagnosing CI crashes.
      app.process().stdout?.on('data', (b) => process.stdout.write(`[main] ${b}`))
      app.process().stderr?.on('data', (b) => process.stderr.write(`[main:err] ${b}`))

      await use(app)

      await app.close()
    },
    { scope: 'worker', timeout: 60_000 },
  ],

  // ── TEST-SCOPED ──────────────────────────────────────────────────────────

  page: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()

    // Visual configs set CLEARPATH_E2E_VISUAL=1 on the parent process.
    // Override the renderer's prefers-color-scheme media query via CDP so
    // BrandingContext (which reads matchMedia('(prefers-color-scheme: dark)')
    // on mount AND listens for change events) flips the Tailwind `dark`
    // class. This is the Playwright-native equivalent of the WDIO config's
    // `--force-dark-mode` Chromium flag — that flag does NOT propagate to
    // _electron.launch's Chromium media-query layer, but emulateMedia does.
    if (process.env.CLEARPATH_E2E_VISUAL === '1') {
      await window.emulateMedia({ colorScheme: 'dark' })
    }

    await window.waitForLoadState('domcontentloaded')

    // Pin the content area to exactly 1280×800 on every platform. The
    // BrowserWindow constructor uses outer size — macOS titlebar ≈32px,
    // Linux Xvfb ≈28px, so outer size produces different content-area
    // dimensions per OS. setContentSize is the inner viewport.
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      win?.setContentSize(1280, 800)
    })

    // Wait for the React mount; the spec's first assertion auto-retries.
    await window.locator('#root').waitFor({ state: 'attached', timeout: 20_000 })

    await use(window)
  },

  consoleErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = []
      const onConsole = (msg: ConsoleMessage) => {
        if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`)
      }
      const onPageError = (e: Error) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`)
      page.on('console', onConsole)
      page.on('pageerror', onPageError)

      await use(errors)

      page.off('console', onConsole)
      page.off('pageerror', onPageError)

      if (testInfo.status !== testInfo.expectedStatus && errors.length) {
        await testInfo.attach('console-errors', {
          body: errors.join('\n'),
          contentType: 'text/plain',
        })
      }
    },
    { auto: true },
  ],
})

export { expect }

// Re-export common types so specs can import them from a single place.
export type { ElectronApplication, Page, ConsoleMessage } from '@playwright/test'
