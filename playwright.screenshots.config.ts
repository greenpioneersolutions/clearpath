import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

// Signal to fixtures.ts that this run wants dark-mode + visual-stable Electron
// args. Set BEFORE the config object is constructed, so the env var is in
// place when Playwright loads the worker process. fixtures.ts reads this and
// pushes `--force-dark-mode` into the Electron launch args.
process.env.CLEARPATH_E2E_VISUAL = '1'

/**
 * Visual regression config — runs ONLY the screenshot crawl spec.
 *
 * Cross-OS strategy:
 *  - Window pinned to 1280×800 content size (mac titlebar ≈32px, linux ≈28px,
 *    so outer size differs — content size is what we control).
 *  - DPR pinned to 1 via `--force-device-scale-factor=1` in fixtures.ts.
 *  - `--hide-scrollbars` keeps usable viewport identical.
 *  - `--force-dark-mode` matches BrandingContext (BrandingProvider observes
 *    prefers-color-scheme).
 *  - `threshold: 0.2` + `maxDiffPixelRatio: 0.02` covers FreeType (linux) vs
 *    CoreText (mac) sub-pixel anti-aliasing — equivalent to the WDIO config's
 *    `compareOptions.ignoreAntialiasing: true`.
 */
export default defineConfig({
  ...baseConfig,

  testDir: './e2e',
  testMatch: /screenshot-crawl\.pw\.spec\.ts/,
  testIgnore: [],

  timeout: 120_000,
  workers: 1,
  fullyParallel: false,

  expect: {
    ...baseConfig.expect,
    timeout: 15_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
      pathTemplate: 'e2e/screenshots/baseline/{arg}{ext}',
      scale: 'css',
    },
  },

  use: {
    ...baseConfig.use,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // NOTE: `colorScheme: 'dark'` does NOT work with _electron.launch — it's a
    // BrowserContext option only. Dark mode is forced via the Chromium
    // `--force-dark-mode` flag pushed into Electron launch args by
    // fixtures.ts when CLEARPATH_E2E_VISUAL=1.
  },

  outputDir: 'test-results-visual',
})
