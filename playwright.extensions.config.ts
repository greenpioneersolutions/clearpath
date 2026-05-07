import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

/**
 * Extensions integration config — runs ONLY the extensions-integration spec.
 *
 * The default `playwright.config.ts` excludes this spec via testIgnore because
 * it requires the pre-packaged `.clear.ext` file at the repo root (built by
 * `npm run pretest:e2e:extensions`). Running it through this dedicated config
 * keeps the default suite fast and lets CI gate it behind the prebuild step.
 */
export default defineConfig({
  ...baseConfig,

  testDir: './e2e',
  testMatch: /extensions-integration\.pw\.spec\.ts/,
  testIgnore: [],

  outputDir: 'test-results-extensions',
})
