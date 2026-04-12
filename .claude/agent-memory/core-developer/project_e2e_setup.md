---
name: E2E Testing Infrastructure
description: WebdriverIO + wdio-electron-service e2e test setup for the ClearPathAI Electron app
type: project
---

E2E tests are implemented with WebdriverIO v9 + wdio-electron-service v9.

**Why:** Added 2026-04-12 to provide smoke-test coverage of the Electron renderer UI via real browser automation.

**How to apply:** When changing UI structure (nav layout, routing, Layout.tsx) verify the e2e tests still pass.

Key implementation details:
- Config: `wdio.conf.ts` at project root — uses `appEntryPoint: path.join(__dirname, 'out/main/index.js')` (electron-vite unpackaged build output)
- Tests: `e2e/smoke.spec.ts` — 14 smoke tests covering window launch, root mount, nav sidebar, content rendering, and 4-route navigation round-trip
- Helpers: `e2e/helpers/app.ts` — `waitForAppReady()`, `getCriticalConsoleErrors()`, `navigateSidebarTo()`, `mainContentIsRendered()`
- TypeScript config: `tsconfig.e2e.json` at root, uses `module: "NodeNext"` and `@wdio/globals/types`
- npm scripts: `e2e` (builds first, then runs) and `e2e:headless`

Gotchas discovered:
1. `defineConfig` from `@wdio/cli` does not exist in v9 — use `export const config: Options.Testrunner = {...}` with type from `@wdio/types`
2. WebdriverIO text-selector syntax `$('nav a=Label')` is NOT translated to valid CSS/XPath by Electron's Chromedriver — use XPath directly: `$('//aside//a[contains(., "Label")]')`
3. "Configure" NavLink is outside the `<nav>` element — it's pinned to the bottom in a `<div>` inside the `<aside>`. XPath must search `//aside//a` not `//nav//a`
4. Chromedriver is auto-downloaded by wdio-electron-service on first run — no manual Chromedriver setup needed for Electron 26+
