import { defineConfig } from '@playwright/test'
import baseScreenshots from './playwright.screenshots.config'

/**
 * Experimental-features visual config — runs the screenshot-crawl-experimental
 * spec only. Requires a build with CLEARPATH_E2E_EXPERIMENTAL=1 so every
 * experimental flag in features.json is forced on (otherwise the gated page
 * chunks are tree-shaken out and the spec fails on the marker-text check).
 *
 * Baselines live under e2e/screenshots/baseline/experimental-features/ to
 * keep them separate from the default crawl.
 */
export default defineConfig({
  ...baseScreenshots,

  testDir: './e2e',
  testMatch: /screenshot-crawl-experimental\.pw\.spec\.ts/,
  testIgnore: [],

  outputDir: 'test-results-visual-experimental',
})
