---
name: E2E Testing Infrastructure
description: Playwright + _electron.launch e2e test setup for the ClearPathAI Electron app
type: project
---

E2E tests are implemented with **Playwright** (`@playwright/test`) driving Electron via `_electron.launch()`.

**Why:** WebdriverIO suite was retired in 2026-05; Playwright gives us trace viewer, web-first auto-retrying assertions, and faster failure post-mortem via the HTML report. Library-mode Electron launch keeps the existing fixture model (worker-scoped `electronApp`, per-test `page`).

**How to apply:** When changing UI structure (nav layout, routing, Layout.tsx) verify the e2e specs still pass. Failure-screenshot capture is built-in via `screenshot: 'only-on-failure'`.

Key implementation details:
- Configs (multi-config pattern):
  - `playwright.config.ts` — default functional run; matches `e2e/**/*.pw.spec.ts`, ignores the two visual crawls + extensions-integration
  - `playwright.screenshots.config.ts` — visual crawl only (`screenshot-crawl.pw.spec.ts`)
  - `playwright.screenshots.experimental.config.ts` — experimental crawl (requires `CLEARPATH_E2E_EXPERIMENTAL=1` on build + test)
  - `playwright.extensions.config.ts` — extensions-integration only (requires the `.clear.ext` from `npm run pretest:e2e:extensions`)
- Fixtures: `e2e/fixtures.ts` — worker-scoped `electronApp` + per-worker `userDataDir` (`e2e/.userData/worker-N`), per-test `page` (first window), auto-attached `consoleErrors` collector
- Helpers: `e2e/helpers/pw.ts` — `waitForAppReady`, `navigateSidebarTo`, `invokeIPC`, `freezeDynamicContent`, `waitForLoadingToSettle`, `pinWindowSize`, etc.
- Ad-hoc capture helper: `e2e/helpers/pw-screenshots.ts` (built-in failure capture covers the standard case)
- TypeScript config: `tsconfig.playwright.json` at root, types `["@playwright/test", "node"]`
- npm scripts: `pw` (build then run), `pw:headed`, `pw:ui`, `pw:debug`, `pw:screenshots` (+ `:update`), `pw:screenshots:experimental` (+ `:update`), `pw:extensions`, `pw:report`

Gotchas:
1. **ELECTRON_RUN_AS_NODE** — VS Code sets it; `e2e/fixtures.ts` deletes it from the env before `electron.launch()`. Without that, the renderer never starts.
2. **Hash routing** — `page.goto()` doesn't navigate hash routes reliably under `file://`. Use `await page.evaluate((h) => { window.location.hash = h }, '#/work?tab=compose')` via the `navigateToHash` helper.
3. **Sidebar label disambiguation** — Settings (sidebar) and the Settings tab inside Configure both contain "Settings". Prefer `page.locator('aside').getByRole('link', { name: 'Settings', exact: true })`; `getByRole` already disambiguates by role.
4. **Visual crawls capture via `BrowserWindow.capturePage()`** through `electronApp.evaluate`, NOT `page.screenshot` — bypasses fonts.ready/RAF waits that hang the headless renderer on busy pages. CI runs the crawls with `-u`; identical-pixel frames produce byte-identical PNGs so unchanged baselines don't churn LFS.
5. **`CLEARPATH_E2E_VISUAL=1`** must be set on the PARENT process (npm scripts pass it; CI workflow `env:` blocks set it on the visual jobs). Setting it from a config module does NOT reach forked workers.
