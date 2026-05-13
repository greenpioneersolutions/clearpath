import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

// fixtures.ts reads CLEARPATH_E2E_VISUAL=1 and forces dark mode via
// `page.emulateMedia({ colorScheme: 'dark' })` (CDP override of
// prefers-color-scheme — what BrandingContext actually reads via
// matchMedia). The env var MUST be set on the parent process — setting it
// from this config file does NOT reach Playwright workers, which fork
// before the config module re-runs in the worker. Set via:
//   - npm: scripts use `CLEARPATH_E2E_VISUAL=1 playwright test ...`
//   - CI:  workflow `env:` block on the visual jobs

/**
 * Visual regression config — runs ONLY the screenshot crawl spec.
 *
 * Cross-OS strategy:
 *  - Window pinned to 1280×800 content size (mac titlebar ≈32px, linux ≈28px,
 *    so outer size differs — content size is what we control).
 *  - DPR pinned to 1 via `--force-device-scale-factor=1` in fixtures.ts.
 *  - `--hide-scrollbars` keeps usable viewport identical.
 *  - Dark mode via `page.emulateMedia({ colorScheme: 'dark' })` in fixtures
 *    (matches BrandingContext which observes prefers-color-scheme).
 *  - `threshold: 0.2` + `maxDiffPixelRatio: 0.02` covers FreeType (linux) vs
 *    CoreText (mac) sub-pixel anti-aliasing.
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
    // NOTE: `colorScheme: 'dark'` does NOT work with _electron.launch — it's
    // a BrowserContext option only. Dark mode is forced via
    // `page.emulateMedia({ colorScheme: 'dark' })` in the per-test page
    // fixture when CLEARPATH_E2E_VISUAL=1 (set on the parent process).
  },

  outputDir: 'test-results-visual',
})
