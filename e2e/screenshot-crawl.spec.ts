/// <reference types="@wdio/globals/types" />
/// <reference types="@wdio/visual-service" />
/// <reference types="mocha" />

/**
 * e2e/screenshot-crawl.spec.ts
 *
 * Visual coverage spec — crawls every page and tab in the app and captures a
 * screenshot of each via @wdio/visual-service.
 *
 * Policy (see .github/workflows/ci.yml): CI always runs this spec with
 *   --update-visual-baseline
 * which makes every captured screenshot overwrite its baseline. The CI's
 * "Commit updated baselines" step then pushes those updates back as an
 * "Auto-update screenshot baselines" commit, surfacing visual changes as PR
 * diffs without failing the test on pixel mismatches.
 *
 * What still fails the test:
 *   - Navigation / element-wait timeouts ("element not existing after Xms")
 *   - JS exceptions thrown from inside the spec or app
 *   - Required Insights tabs missing (built-in tabs throw if not found)
 *   - browser.checkScreen erroring (driver crash, screenshot not produced)
 *
 * Local usage:
 *   npm run e2e:screenshots          - capture + update baselines (CI parity)
 *   npm run e2e:screenshots:compare  - compare against committed baselines
 *                                      (informational; no longer fails the test)
 */

import {
  waitForAppReady,
  navigateSidebarTo,
  invokeIPC,
  freezeDynamicContent,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

// ── Data tables ──────────────────────────────────────────────────────────────

/**
 * Per-entry visual options. With the "always update baseline" policy these
 * are no-ops on the comparison side, but `blockOut` is still honored: the
 * masked rectangles are zeroed in the captured baseline as well, which keeps
 * the saved baseline free of dynamic regions like live clocks.
 *
 * blockOut — pixel rectangles to mask. Coordinates in CSS pixels, top-left.
 */
interface VisualOptions {
  blockOut?: Array<{ x: number; y: number; width: number; height: number }>
}

interface SidebarPage extends VisualOptions {
  nav: string
  screenshot: string
  optional?: boolean  // true for routes gated behind feature flags or extensions
}

interface WorkTab extends VisualOptions {
  key: string
  screenshot: string
}

interface InsightsTab extends VisualOptions {
  label: string
  screenshot: string
  optional?: boolean  // true for extension-contributed tabs
}

interface ConnectTab extends VisualOptions {
  key: string
  label: string
  screenshot: string
}

interface ConfigureTab extends VisualOptions {
  key: string
  label: string
  screenshot: string
}

/**
 * Inner sub-tabs that live within a Configure sidenav section.
 * configureTab  — the Configure sidenav key (e.g. 'settings')
 * subLabel      — visible button text of the inner sub-tab
 * screenshot    — output filename (flat, under baselineFolder)
 */
interface ConfigureSubTab extends VisualOptions {
  configureTab: string
  subLabel: string
  screenshot: string
}

// Core sidebar pages.
//
// Sidebar labels were updated in PR #47 — the /configure route is now
// labelled "Settings" (not "Configure"); /connect was added; /clear-memory
// was added; the right-rail Work panels were removed.
//
// Extension-contributed sidebar entries (Backstage, Efficiency Coach) are
// guarded with `optional: true` — the spec checks for the anchor and skips
// the screenshot if it's not rendered.
//
// PR Scores deliberately does NOT appear here. The extension pins a sidebar
// link to `#/pr-scores`, which targets a build-time-gated experimental
// route; with the flag off it redirects to /work, and with the flag on the
// page is captured by screenshot-crawl-experimental.spec.ts. Either way the
// regular crawl has nothing useful to capture for it.
const SIDEBAR_PAGES: SidebarPage[] = [
  { nav: 'Home',             screenshot: 'home--initial' },
  // Work page renamed to "Sessions" in 1.13.0; route is still /work, baseline
  // filenames stay `work--*` so existing screenshot baselines keep matching.
  { nav: 'Sessions',         screenshot: 'work--initial' },
  // Notes promoted to a top-level surface in 1.13.0 — sidebar peer of Sessions.
  { nav: 'Notes',            screenshot: 'notes--initial',        optional: true },
  { nav: 'Insights',         screenshot: 'insights--initial' },
  { nav: 'Clear Memory',     screenshot: 'clear-memory--initial', optional: true },
  { nav: 'Learn',            screenshot: 'learn--initial',        optional: true },
  { nav: 'Connect',          screenshot: 'connect--initial' },
  { nav: 'Settings',         screenshot: 'configure--initial' },
  // Extension-contributed routes — present when extensions are installed
  { nav: 'Backstage',        screenshot: 'ext--backstage',        optional: true },
  { nav: 'Efficiency Coach', screenshot: 'ext--efficiency-coach', optional: true },
]

// Sessions page mode tabs (driven by ?tab= URL param). 1.13.0 dropped the
// `wizard` and `memory` sub-tabs: notes moved to /notes, the wizard surface
// was retired. work--initial already captures the default landing view.
//
// Note: PR #47 removed the right-rail context panels (agents, tools, templates,
// skills, subagents) from Work. The corresponding `?panel=` URL params are no
// longer rendered, so WORK_PANELS was deleted entirely from this spec.
const WORK_TABS: WorkTab[] = [
  { key: 'session',  screenshot: 'work--tab-session' },
  { key: 'compose',  screenshot: 'work--tab-compose' },
  { key: 'schedule', screenshot: 'work--tab-schedule' },
]

// Insights tabs — built-in tabs (Activity, Compliance) plus extension-contributed
// tabs that only exist when matching extensions are installed. PR #47 merged
// the old "Analytics" and "Usage Analytics" pages into a single "Activity" view.
const INSIGHTS_TABS: InsightsTab[] = [
  // Activity merges the old Analytics + Usage views
  { label: 'Activity',         screenshot: 'insights--tab-activity' },
  { label: 'Compliance',       screenshot: 'insights--tab-compliance' },
  // Extension-contributed tabs — present only if the extension is installed
  { label: 'Catalog Insights', screenshot: 'insights--tab-catalog-insights', optional: true },
  { label: 'Efficiency',       screenshot: 'insights--tab-efficiency',       optional: true },
  { label: 'PR Health',        screenshot: 'insights--tab-pr-health',        optional: true },
]

// Connect page sub-tabs (added in PR #47). Each tab button has a stable
// `id="connect-tab-{key}"` selector hook that matches Connect.tsx.
//
// The `extensions` and `mcp` tabs are gated by experimental flags
// (showExtensions / showMcpServers). They're hidden in default builds —
// captured instead by screenshot-crawl-experimental.spec.ts under
// experimental-features/connect--tab-extensions and ...--tab-mcp.
const CONNECT_TABS: ConnectTab[] = [
  { key: 'integrations', label: 'Integrations', screenshot: 'connect--tab-integrations' },
  { key: 'environment',  label: 'Environment',  screenshot: 'connect--tab-environment' },
  { key: 'plugins',      label: 'Plugins',      screenshot: 'connect--tab-plugins' },
  { key: 'webhooks',     label: 'Webhooks',     screenshot: 'connect--tab-webhooks' },
]

// All 13 Configure tabs — captured by clicking the sidenav tab buttons after a
// single navigation so re-navigation loading flashes don't affect screenshots.
//
// PR #47 changes:
//   - Sidebar label changed from "Configure" → "Settings" (URL still /configure).
//   - Tab labels renamed: Settings→General, Memory→Notes & Context,
//     Agents→Prompts, Skills→Playbooks, White Label→Branding.
//   - New tab: Tools & Permissions (key=tools).
//   - Integrations + Extensions tabs were moved out of Configure and into
//     /connect — they no longer appear here.
const CONFIGURE_TABS: ConfigureTab[] = [
  { key: 'setup',         label: 'Setup Wizard',       screenshot: 'configure--tab-setup' },
  { key: 'accessibility', label: 'Accessibility',      screenshot: 'configure--tab-accessibility' },
  { key: 'agents',        label: 'Prompts',            screenshot: 'configure--tab-agents' },
  { key: 'skills',        label: 'Playbooks',          screenshot: 'configure--tab-skills' },
  { key: 'memory',        label: 'Notes & Context',    screenshot: 'configure--tab-memory' },
  { key: 'settings',      label: 'General',            screenshot: 'configure--tab-settings' },
  { key: 'tools',         label: 'Tools & Permissions', screenshot: 'configure--tab-tools' },
  { key: 'wizard',        label: 'Session Wizard',     screenshot: 'configure--tab-wizard' },
  { key: 'policies',      label: 'Policies',           screenshot: 'configure--tab-policies' },
  { key: 'workspaces',    label: 'Workspaces',         screenshot: 'configure--tab-workspaces' },
  { key: 'team',          label: 'Team Hub',           screenshot: 'configure--tab-team' },
  { key: 'scheduler',     label: 'Scheduler',          screenshot: 'configure--tab-scheduler' },
  { key: 'branding',      label: 'Branding',           screenshot: 'configure--tab-branding' },
]

// Inner sub-tabs for each Configure sidenav section that has its own tab bar.
// Sections with only a single flat view (Accessibility, Agents/Prompts,
// Skills/Playbooks, Tools, Setup Wizard, Session Wizard, Scheduler) are not
// listed here because the main CONFIGURE_TABS crawl already captures their
// full view.
//
// Screenshot naming: configure--tab-{section}--sub-{key}
//
// PR #47 removed the Plugins, Environment, and Webhooks sub-tabs from Settings
// — those moved to /connect. "Budget & Limits" was renamed to "Session Limits"
// (cost UI was removed; only max-turns config remains).
const CONFIGURE_SUB_TABS: ConfigureSubTab[] = [
  // ── Settings / "General" (7 inner tabs) ─────────────────────────────────
  // 'CLI Flags' is the default — captured by configure--tab-settings above.
  { configureTab: 'settings', subLabel: 'Model',           screenshot: 'configure--tab-settings--sub-model' },
  { configureTab: 'settings', subLabel: 'Session Limits',  screenshot: 'configure--tab-settings--sub-limits' },
  { configureTab: 'settings', subLabel: 'Profiles',        screenshot: 'configure--tab-settings--sub-profiles' },
  { configureTab: 'settings', subLabel: 'Notifications',   screenshot: 'configure--tab-settings--sub-notifications' },
  { configureTab: 'settings', subLabel: 'Data Management', screenshot: 'configure--tab-settings--sub-data' },
  { configureTab: 'settings', subLabel: 'Feature Flags',   screenshot: 'configure--tab-settings--sub-features' },

  // ── Policies (3 inner tabs) ─────────────────────────────────────────────
  // 'Presets' is the default — captured by configure--tab-policies above.
  { configureTab: 'policies', subLabel: 'Violations', screenshot: 'configure--tab-policies--sub-violations' },
  { configureTab: 'policies', subLabel: 'Editor',     screenshot: 'configure--tab-policies--sub-editor' },

  // ── Memory / "Notes & Context" (6 inner tabs) ──────────────────────────
  // 'Notes' is the default — captured by configure--tab-memory above.
  { configureTab: 'memory', subLabel: 'Starter Memories', screenshot: 'configure--tab-memory--sub-starter' },
  { configureTab: 'memory', subLabel: 'Config Files',     screenshot: 'configure--tab-memory--sub-config-files' },
  { configureTab: 'memory', subLabel: 'Instructions',     screenshot: 'configure--tab-memory--sub-instructions' },
  { configureTab: 'memory', subLabel: 'CLI Memory',       screenshot: 'configure--tab-memory--sub-cli-memory' },
  { configureTab: 'memory', subLabel: 'Context Usage',    screenshot: 'configure--tab-memory--sub-context' },

  // ── Workspaces inner tabs are handled in a separate describe block below
  // because the tab bar only renders when an active workspace exists.
  // See: 'Configure Page — Workspaces Sub-Tabs'

  // ── Team Hub (5 inner tabs) ─────────────────────────────────────────────
  // 'Config Bundle' is the default — captured by configure--tab-team above.
  { configureTab: 'team', subLabel: 'Shared Folder', screenshot: 'configure--tab-team--sub-sync' },
  { configureTab: 'team', subLabel: 'Setup Wizard',  screenshot: 'configure--tab-team--sub-wizard' },
  { configureTab: 'team', subLabel: 'Marketplace',   screenshot: 'configure--tab-team--sub-marketplace' },
  { configureTab: 'team', subLabel: 'Activity', screenshot: 'configure--tab-team--sub-activity' },

  // ── Branding (5 inner sections) ─────────────────────────────────────────
  // 'Theme Presets' is the default — captured by configure--tab-branding above.
  { configureTab: 'branding', subLabel: 'Identity',       screenshot: 'configure--tab-branding--sub-identity' },
  { configureTab: 'branding', subLabel: 'Brand Colors',   screenshot: 'configure--tab-branding--sub-colors' },
  { configureTab: 'branding', subLabel: 'UI Colors',      screenshot: 'configure--tab-branding--sub-ui-colors' },
  { configureTab: 'branding', subLabel: 'Surfaces & Mode', screenshot: 'configure--tab-branding--sub-surfaces' },
  { configureTab: 'branding', subLabel: 'Preview',        screenshot: 'configure--tab-branding--sub-preview' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Capture a screenshot for the given tag.
 *
 * Under CI's compare+promote policy, mismatches never fail the test —
 * visual changes are surfaced via the auto-baseline-update commit, and
 * only tags that produce a diff PNG get their baseline rewritten.
 * browser.checkScreen will still throw if the screenshot itself can't be
 * produced, which keeps real driver/page-load failures gated.
 *
 * Calls `freezeDynamicContent()` first to stabilize time-of-day greetings,
 * relative timestamps, and locale dates so they don't drift between runs.
 */
async function checkScreenshot(name: string, options: VisualOptions = {}): Promise<void> {
  await freezeDynamicContent()
  const { blockOut } = options
  await browser.checkScreen(name, blockOut ? { blockOut } : {})
}

/**
 * Attempt to scroll the primary scrollable container one viewport-height down
 * and capture a second screenshot with a `--scrolled` suffix.  Scrolls back
 * to the top afterwards.  Best-effort: any error is caught and ignored so it
 * can never mask a real test failure.
 *
 * Strategy: try document root first (catches simple full-page scroll), then
 * fall back to the first `.overflow-y-auto` / `.overflow-auto` element that
 * actually has hidden content.
 */
async function tryScrollCapture(baseName: string): Promise<void> {
  try {
    const scrolled = await browser.execute(() => {
      // 1. Try document-level scroll
      const docEl = document.documentElement
      const docBefore = docEl.scrollTop
      docEl.scrollBy(0, docEl.clientHeight * 0.8)
      if (docEl.scrollTop > docBefore) return true

      // 2. Try first visible overflow container with hidden content
      const el = document.querySelector<HTMLElement>('.overflow-y-auto, .overflow-auto')
      if (!el || el.scrollHeight <= el.clientHeight + 50) return false
      const before = el.scrollTop
      el.scrollBy(0, el.clientHeight)
      return el.scrollTop > before
    })

    if (scrolled) {
      await browser.pause(300)
      await freezeDynamicContent()
      await browser.checkScreen(`${baseName}--scrolled`)
      // Restore scroll position so subsequent tests start clean
      await browser.execute(() => {
        document.documentElement.scrollTo(0, 0)
        document.querySelector<HTMLElement>('.overflow-y-auto, .overflow-auto')?.scrollTo(0, 0)
      })
      await browser.pause(200)
    }
  } catch {
    // Best-effort — scroll failures never block the test
  }
}

/**
 * Expand every collapsed sidenav group on the Configure page (the
 * "Advanced" group is collapsed by default in PR #47).  Without this,
 * `#tab-policies`, `#tab-team`, `#tab-scheduler`, `#tab-branding`, and
 * `#tab-workspaces` are not in the DOM and `waitForExist` times out.
 *
 * Idempotent: collapsed groups have aria-expanded="false"; once clicked
 * they switch to "true" and stay that way.
 */
async function expandConfigureCollapsedGroups(): Promise<void> {
  const xpath =
    `//div[@role='tablist' and @aria-label='Configure sections']` +
    `//button[@aria-expanded='false']`
  const collapsed = await $$(xpath)
  for (const btn of collapsed) {
    try {
      await btn.click()
      await browser.pause(150)
    } catch {
      // Best-effort — never block the test on a failed expander click
    }
  }
  await browser.pause(300)
}

/**
 * Poll until no "Loading" indicator text is present in the page, or until
 * the timeout elapses. Best-effort: never throws so it cannot mask a real
 * test failure — it just proceeds to the screenshot if loading persists.
 */
async function waitForLoadingToSettle(timeout = 3000): Promise<void> {
  try {
    await browser.waitUntil(
      async () => {
        const body = await $('body')
        const html = await body.getHTML()
        // Match common loading patterns: "Loading...", "Loading setup...", "Loading data..."
        // The `\s+...` qualifier was previously mandatory, which meant the bare
        // "Loading..." string never matched and the helper exited prematurely.
        return !html.match(/Loading(?:\s+(?:setup|data|wizard|content))?\.{3}/i)
      },
      { timeout, interval: 200 },
    )
  } catch {
    // Best-effort — proceed with screenshot even if still showing a loading state
  }
}

// ── Spec ─────────────────────────────────────────────────────────────────────

describe('ClearPathAI — Screenshot Crawl', () => {
  before(async () => {
    await waitForAppReady()
  })

  // ── Sidebar Pages ─────────────────────────────────────────────────────────

  describe('Sidebar Pages', () => {
    for (const page of SIDEBAR_PAGES) {
      it(`captures ${page.nav} page`, async () => {
        // For optional routes (feature-flagged or extension-contributed),
        // guard with an existence check first.
        if (page.optional) {
          const xpath = `//aside//a[contains(., '${page.nav}')]`
          const link = await $(xpath)
          if (!(await link.isExisting())) {
            console.log(`[screenshot-crawl] Sidebar link "${page.nav}" not found — skipping (optional)`)
            return
          }
        }

        await navigateSidebarTo(page.nav)
        await browser.pause(800)
        await waitForLoadingToSettle()

        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
        await checkScreenshot(page.screenshot)
      })
    }
  })

  // ── Sessions Page — Mode Tabs ─────────────────────────────────────────────

  describe('Sessions Page — Mode Tabs', () => {
    before(async () => {
      await navigateSidebarTo('Sessions')
      await browser.pause(800)
    })

    for (const tab of WORK_TABS) {
      it(`captures Sessions tab: ${tab.key}`, async () => {
        // Hash navigation confirmed in work-page.spec.ts
        await browser.execute((key) => {
          window.location.hash = `#/work?tab=${key}`
        }, tab.key)
        await browser.pause(800)
        await waitForLoadingToSettle()

        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
        await checkScreenshot(tab.screenshot, tab)
      })
    }
  })

  // ── Insights Page — Tabs ──────────────────────────────────────────────────

  describe('Insights Page — Tabs', () => {
    before(async () => {
      await navigateSidebarTo('Insights')
      await browser.pause(800)
    })

    for (const tab of INSIGHTS_TABS) {
      it(`captures Insights tab: ${tab.label}`, async () => {
        // Insights tabs are plain buttons matched by visible text (confirmed in insights.spec.ts)
        const btn = await $(`//button[contains(., '${tab.label}')]`)

        if (!(await btn.isExisting())) {
          if (!tab.optional) {
            // Built-in tabs must exist — surface the failure rather than silently skipping
            throw new Error(`Required Insights tab "${tab.label}" not found`)
          }
          console.log(`[screenshot-crawl] Optional Insights tab "${tab.label}" not found — skipping`)
          return
        }

        await btn.waitForClickable({ timeout: ELEMENT_TIMEOUT })
        await btn.click()
        await browser.pause(600)
        await waitForLoadingToSettle()

        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
        await checkScreenshot(tab.screenshot, tab)
      })
    }
  })

  // ── Connect Page — Tabs ───────────────────────────────────────────────────
  //
  // Connect is the new home (PR #47) for integration-style surfaces:
  // Integrations, Extensions, MCP Servers, Environment, Plugins, Webhooks.
  // Each sub-tab button has id="connect-tab-{key}".

  describe('Connect Page — Tabs', () => {
    before(async () => {
      await navigateSidebarTo('Connect')
      await browser.pause(800)
    })

    for (const tab of CONNECT_TABS) {
      it(`captures Connect tab: ${tab.label}`, async () => {
        const tabBtn = await $(`#connect-tab-${tab.key}`)
        await tabBtn.waitForExist({ timeout: ELEMENT_TIMEOUT })
        await tabBtn.waitForClickable({ timeout: ELEMENT_TIMEOUT })
        await tabBtn.click()
        await browser.pause(800)
        await waitForLoadingToSettle()

        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
        await checkScreenshot(tab.screenshot, tab)
      })
    }
  })

  // ── Configure Page — Tabs ─────────────────────────────────────────────────

  describe('Configure Page — Tabs', () => {
    before(async () => {
      // Navigate to Configure once, then click through tabs directly.
      // Avoids repeated sidebar navigation which can trigger loading flashes
      // on async-loaded tabs (e.g. Setup Wizard fetches data via IPC on mount).
      //
      // Sidebar label is "Settings" (PR #47); URL is still /configure.
      await navigateSidebarTo('Settings')
      await browser.pause(1000)
      // Expand the "Advanced" sidenav group (collapsed by default) so that
      // #tab-policies / #tab-team / #tab-scheduler / #tab-branding /
      // #tab-workspaces become reachable.
      await expandConfigureCollapsedGroups()
    })

    for (const tab of CONFIGURE_TABS) {
      it(`captures Configure tab: ${tab.label}`, async () => {
        const tabBtn = await $(`#tab-${tab.key}`)
        await tabBtn.waitForExist({ timeout: ELEMENT_TIMEOUT })
        await tabBtn.waitForClickable({ timeout: ELEMENT_TIMEOUT })
        await tabBtn.click()

        // Longer pause for tabs that load content via async IPC (e.g. Setup Wizard)
        await browser.pause(1200)
        await waitForLoadingToSettle(4000)

        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
        await checkScreenshot(tab.screenshot, tab)
      })
    }
  })

  // ── Configure Page — Tab Sub-Tabs ─────────────────────────────────────────
  //
  // Several Configure sidenav sections contain their own inner tab bar
  // (Settings/General, Policies, Memory/Notes & Context, Workspaces, Team Hub,
  // Branding). This block visits every inner sub-tab and optionally captures
  // a scrolled-down view when the content overflows the viewport.
  //
  // Selector strategy: inner tab buttons are plain <button> elements without
  // role="tab" (that attribute is reserved for the Configure sidenav itself),
  // so `//button[not(@role='tab') and contains(., '{label}')]` uniquely targets
  // the inner button even when the same text appears in the sidenav
  // (e.g. "Settings", "Setup Wizard").

  describe('Configure Page — Tab Sub-Tabs', () => {
    // Track which Configure sidenav tab is currently open so we only
    // re-navigate when the section changes.  CONFIGURE_SUB_TABS keeps
    // all entries for the same section contiguous.
    let currentConfigureTab = ''

    before(async () => {
      await navigateSidebarTo('Settings')
      await browser.pause(1000)
      // Expand collapsed groups so all tabs (including those in Advanced)
      // are reachable from this describe block too.
      await expandConfigureCollapsedGroups()
      currentConfigureTab = ''
    })

    for (const sub of CONFIGURE_SUB_TABS) {
      it(`captures Configure ${sub.configureTab} > ${sub.subLabel}`, async () => {
        // Switch Configure sidenav tab only when the section changes
        if (currentConfigureTab !== sub.configureTab) {
          const tabBtn = await $(`#tab-${sub.configureTab}`)
          await tabBtn.waitForExist({ timeout: ELEMENT_TIMEOUT })
          await tabBtn.waitForClickable({ timeout: ELEMENT_TIMEOUT })
          await tabBtn.click()
          await browser.pause(1200)
          await waitForLoadingToSettle(4000)
          currentConfigureTab = sub.configureTab
        }

        // Click the inner sub-tab button (exclude Configure sidenav role=tab buttons)
        const subBtn = await $(
          `//button[not(@role='tab') and contains(., '${sub.subLabel}')]`,
        )
        if (!(await subBtn.isExisting())) {
          console.log(
            `[screenshot-crawl] Sub-tab "${sub.subLabel}" in "${sub.configureTab}" not found — skipping`,
          )
          return
        }

        await subBtn.waitForClickable({ timeout: ELEMENT_TIMEOUT })
        await subBtn.click()
        await browser.pause(800)
        await waitForLoadingToSettle(3000)

        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)

        await checkScreenshot(sub.screenshot, sub)
        // Capture a second screenshot if the content overflows the viewport
        await tryScrollCapture(sub.screenshot)
      })
    }
  })

  // ── Configure Page — Workspaces Sub-Tabs ─────────────────────────────────
  //
  // The Workspaces inner tab bar (Repos / Broadcast / Activity / Settings)
  // is only rendered when an active workspace exists (`{activeWs && ...}`).
  // This block creates a temporary workspace via IPC, captures all four
  // sub-tabs, then deletes the workspace when finished.

  describe('Configure Page — Workspaces Sub-Tabs', () => {
    let tempWorkspaceId = ''

    before(async () => {
      // Create a temporary workspace so the inner tab bar renders
      const ws = await invokeIPC('workspace:create', {
        name: 'Screenshot Workspace',
        description: 'Temporary workspace for screenshot crawl',
      }) as { id: string }
      tempWorkspaceId = ws.id
      await invokeIPC('workspace:set-active', { id: tempWorkspaceId })

      // Workspaces lives inside the collapsed-by-default "Advanced" group
      // — expand it before trying to click #tab-workspaces.
      await navigateSidebarTo('Settings')
      await browser.pause(800)
      await expandConfigureCollapsedGroups()

      // Re-navigate to the Workspaces tab to pick up the new active workspace
      const tabBtn = await $(`#tab-workspaces`)
      await tabBtn.waitForExist({ timeout: ELEMENT_TIMEOUT })
      await tabBtn.click()
      await browser.pause(1200)
      await waitForLoadingToSettle(4000)
    })

    after(async () => {
      // Clean up the temporary workspace
      if (tempWorkspaceId) {
        await invokeIPC('workspace:delete', { id: tempWorkspaceId })
        tempWorkspaceId = ''
      }
    })

    const WORKSPACE_SUB_TABS = [
      { subLabel: 'Repos',      screenshot: 'configure--tab-workspaces--sub-repos' },
      { subLabel: 'Broadcast',  screenshot: 'configure--tab-workspaces--sub-broadcast' },
      { subLabel: 'Activity',   screenshot: 'configure--tab-workspaces--sub-activity' },
      { subLabel: 'Settings',   screenshot: 'configure--tab-workspaces--sub-settings' },
    ]

    for (const sub of WORKSPACE_SUB_TABS) {
      it(`captures Configure workspaces > ${sub.subLabel}`, async () => {
        const subBtn = await $(
          `//button[not(@role='tab') and contains(., '${sub.subLabel}')]`,
        )
        if (!(await subBtn.isExisting())) {
          console.log(`[screenshot-crawl] Workspaces sub-tab "${sub.subLabel}" not found — skipping`)
          return
        }

        await subBtn.waitForClickable({ timeout: ELEMENT_TIMEOUT })
        await subBtn.click()
        await browser.pause(800)
        await waitForLoadingToSettle(3000)

        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)

        await checkScreenshot(sub.screenshot)
        await tryScrollCapture(sub.screenshot)
      })
    }
  })
})
