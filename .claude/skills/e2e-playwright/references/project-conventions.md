# Project Conventions

CoPilot Commander-specific helpers, route table, sidebar labels, and the two-config pattern.

## Tech stack

- **Electron 39** (`^39.8.6` per package.json) with `electron-vite` (build to `out/main/index.js`)
- **React 18** + React Router 6, **hash-based** (`#/work?tab=session`)
- **Tailwind CSS** for styling
- IPC bridge: `window.electronAPI.invoke(channel, args)`

## Helpers we keep — `e2e/helpers/pw.ts`

The helper module (`e2e/helpers/pw.ts`) takes `page: Page` as the first
argument on every helper since there's no `browser` global in Playwright.
Specs import via `from './helpers/pw'`.

```ts
// Constants
export const APP_READY_TIMEOUT = 20_000;
export const ELEMENT_TIMEOUT   = 10_000;

// Wait for the renderer
export async function waitForAppReady(page: Page): Promise<void> {
  await page.locator('#root').waitFor({ state: 'attached', timeout: APP_READY_TIMEOUT });
  // ⚠ `<aside role="navigation" aria-label="Main navigation">` AND `<nav aria-label="Primary">`
  // BOTH have role=navigation. Disambiguate via `name` to avoid strict-mode violation.
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
    timeout: ELEMENT_TIMEOUT,
  });
}

// Sidebar navigation
export async function navigateSidebarTo(page: Page, label: string): Promise<void> {
  // Sidebar links — including pinned-bottom (Connect, Settings) — all live inside <aside>
  await page.locator('aside').getByRole('link', { name: label }).click();
  // Brief pause for React Router transition; the assertion in the spec is the real wait
  await page.waitForTimeout(300);
}

// Hash routing
export async function navigateToHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => { window.location.hash = h }, hash);
  await page.waitForLoadState('domcontentloaded');
}

// React-friendly input read — locator.inputValue() works correctly
export async function getInputValue(page: Page, selector: string): Promise<string> {
  return page.locator(selector).inputValue();
}

// React-friendly input write — locator.fill() works correctly for most cases
export async function setInputValue(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).fill(value);
}

// IPC round-trip
export async function invokeIPC<T = unknown>(page: Page, channel: string, args?: unknown): Promise<T> {
  return page.evaluate(
    ([ch, a]) => (window as any).electronAPI.invoke(ch, a),
    [channel, args] as const,
  );
}

// Tab navigation (Configure page tabs are <button id="tab-${key}" role="tab">)
export async function navigateToConfigureTab(page: Page, tabKey: string): Promise<void> {
  await navigateSidebarTo(page, 'Settings');
  await page.locator(`#tab-${tabKey}`).click();
}

// Connect page (uses URL params, not click-tab)
export async function navigateToConnectTab(page: Page, tabKey: string): Promise<void> {
  await navigateToHash(page, `#/connect?tab=${tabKey}`);
}

// Screenshot dynamic-content freezing — kept inline in pw.ts (not a separate file).
// See examples/custom-helpers.md for the full implementation.
// export async function freezeDynamicContent(page: Page): Promise<void> { /* ... */ }
```

> Don't keep WDIO-named helpers like `waitForExist`, `waitForDisplayed` — Playwright actions auto-wait. If a helper just calls `loc.waitFor({ state: 'visible' })`, delete the helper and use the locator directly.

## Sidebar route table (1.13.0+)

| Sidebar label | Route | Notes |
|---------------|-------|-------|
| Home | `#/` | Dashboard / HomeHub |
| Sessions | `#/work` (was Work in <1.13) | Renamed in 1.13 — route still `/work` |
| Notes | `#/notes` | Added 1.13; gated behind `showNotes` flag (default ON) |
| Insights | `#/insights` | Analytics |
| Clear Memory | `#/clear-memory` | Gated behind `showClearMemory` (default OFF) |
| Learn | `#/learn` | Onboarding |
| Connect | `#/connect` | Pinned bottom; uses URL params (`?tab=`) |
| Settings | `#/configure` (was "Configure" before PR #47) | Pinned bottom; renamed |

## Configure page tabs

`<button id="tab-${tabKey}" role="tab">` for each. Reachable via `navigateToConfigureTab(page, tabKey)`:

| Tab key | Label |
|---------|-------|
| `setup` | Setup |
| `accessibility` | Accessibility |
| `settings` | Settings |
| `tools` | Tools & Permissions |
| `policies` | Policies |
| `memory` | Project Memory (renamed from "Memory & Context" in 1.13) |
| `agents` | Agents |
| `skills` | Skills |
| `wizard` | Wizard |
| `workspaces` | Workspaces |
| `team` | Team |
| `scheduler` | Scheduler |
| `branding` | Branding |

## Connect page tabs

URL: `#/connect?tab=<tabKey>`. Use `navigateToConnectTab(page, tabKey)`:

| Tab key | What it surfaces |
|---------|------------------|
| `integrations` | External integrations |
| `extensions` | Extensions list (sandboxed iframes) |
| `mcp` | MCP servers (Catalog/Installed/Advanced) |
| `environment` | Environment variables editor |
| `plugins` | CLI plugins (Copilot/Claude per-CLI) |
| `webhooks` | Webhook delivery configuration |

## Persistence files (electron-store)

Tests that need hermetic state should override `userDataDir` per worker. The data files live in `<userData>/`:

| File | What it stores |
|------|---------------|
| `clear-path-sessions.json` | Session message logs (max 50) |
| `clear-path-settings.json` | App settings, feature flags, env vars, profiles |
| `clear-path-notifications.json` | Notification history (max 500) |
| `clear-path-cost.json` | Cost records, budget config |
| `clear-path-history.json` | Session history (max 100) |
| `clear-path-plugins.json` | CLI plugin paths |
| `clear-path-mcps.json` | MCP registry (source of truth) |
| `clear-path-notes.json` | User notes (1.13+) |
| `mcp-secrets.json` | MCP secrets (encrypted via `safeStorage`) |

Reset with the worker fixture pattern in [fixtures.md](fixtures.md).

## Two-config pattern

| Config | Specs run | npm script |
|--------|-----------|-----------|
| `playwright.config.ts` | All `e2e/**/*.spec.ts` except crawl/extensions-integration | `npm run pw` |
| `playwright.screenshots.config.ts` | `screenshot-crawl.spec.ts` only | `npm run pw:screenshots` |
| `playwright.screenshots.experimental.config.ts` | `screenshot-crawl-experimental.spec.ts` (with `CLEARPATH_E2E_EXPERIMENTAL=1`) | `npm run pw:screenshots:experimental` |

The visual configs differ in:
- `testIgnore` — empty (only the crawl spec runs)
- `args:` — adds `--force-device-scale-factor=1`, `--force-dark-mode` (if testing dark theme), `--hide-scrollbars`
- `expect.toHaveScreenshot.pathTemplate` — points at `e2e/screenshots/baseline/`
- `timeout: 120_000` — crawl spec is long
- `before-each` resizes the window to a known viewport (1280×800)

## React + Tailwind specifics

- **Don't** use Tailwind class selectors (`.bg-purple-500`) — they change frequently
- **Do** use `data-testid` for elements without a clear role/text
- **Use `data-screenshot-stub="..."`** to mark dynamic regions for the freeze helper

## Feature flags

`FeatureFlagContext` reads from `features.json` (generated at build time). Some pages render an EnableGate when the flag is off. To test flag-on behaviour without rebuilding, override the flag at runtime:

```ts
await page.evaluate(() => {
  // Hypothetical — depends on FeatureFlagContext exposing a setter for tests
  (window as any).__setFeatureFlag?.('showNotes', true);
});
```

For most cases, build with the desired flag set in env (e.g. `CLEARPATH_E2E_EXPERIMENTAL=1`) before launching Playwright.

## Sidebar — pinned-bottom links live OUTSIDE `<nav>`

The Connect and Settings links are in a `<div>` outside the primary `<nav>` element. Searching just `nav a` will miss them. Search the entire `<aside>`:

```ts
// ✗ WRONG — misses Connect and Settings
await page.getByRole('navigation').getByRole('link', { name: 'Settings' }).click();

// ✓ CORRECT
await page.locator('aside').getByRole('link', { name: 'Settings' }).click();
```

## Screenshot baselines path

Visual baselines live at `e2e/screenshots/baseline/<name>.png`, tracked via Git LFS. The path is configured via `expect.toHaveScreenshot.pathTemplate` in the visual config.

## CLI commands the app spawns (mock these in e2e!)

CoPilot Commander spawns real `copilot` and `claude` CLI processes via `CLIManager`. **For e2e tests these MUST be stubbed** — otherwise tests need internet and real credentials.

Two approaches:
1. **Proposed (not yet implemented):** an env var like `CLEARPATH_E2E_FAKE_CLI=1` could gate `CLIManager.startSession` to use a fake adapter that emits scripted output. As of this writing, no such flag is wired in `src/`.
2. Override the spawn function via `electronApp.evaluate` to monkey-patch `child_process.spawn` (more invasive — requires app code awareness).

Until approach (1) is implemented, **prefer testing IPC handlers directly via `invokeIPC` rather than full chat flows.** Existing Playwright specs avoid spawning real CLI sessions entirely.
