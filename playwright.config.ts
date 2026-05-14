import { defineConfig } from '@playwright/test'

// VS Code's terminal sets ELECTRON_RUN_AS_NODE=1, which makes Electron launch
// as plain Node (no GUI). Strip it BEFORE the fixtures import process.env.
delete process.env.ELECTRON_RUN_AS_NODE

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.pw\.spec\.ts/,
  testIgnore: [
    // Visual crawls + extension integration run under their dedicated configs.
    /screenshot-crawl\.pw\.spec\.ts/,
    /screenshot-crawl-experimental\.pw\.spec\.ts/,
    /extensions-integration\.pw\.spec\.ts/,
  ],

  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  globalTimeout: process.env.CI ? 60 * 60 * 1000 : 0,
  expect: { timeout: 10_000 },

  use: {
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid',
  },

  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['blob'],
      ]
    : [['list', { printSteps: true }], ['html', { open: 'on-failure' }]],

  projects: [{ name: 'electron' }],
  outputDir: 'test-results',
  globalTeardown: './e2e/global-teardown.ts',
})
