/**
 * e2e/screenshot-crawl.spec.ts
 *
 * Visual coverage spec — crawls every page and tab in the app and captures
 * a screenshot at each rendered state. This is NOT a functional test; it
 * exists to build and maintain a baseline image set for visual regression
 * comparisons and to surface obvious rendering regressions on the spot.
 *
 * Assertions are intentionally minimal: we only verify that the page has
 * rendered some content before snapping. Pixel-level diffing happens in a
 * separate visual regression stage that compares these images against the
 * committed baseline in e2e/screenshots/baseline/.
 *
 * Run in isolation:
 *   npm run e2e:screenshots
 */

import { waitForAppReady, navigateSidebarTo, invokeIPC, ELEMENT_TIMEOUT } from './helpers/app.js'
import { captureScreenshot } from './helpers/screenshots.js'

// ── Data tables ──────────────────────────────────────────────────────────────

interface SidebarPage {
  nav: string
  screenshot: string
  optional?: boolean  // true for extension-contributed routes that may not always be installed
}

interface WorkTab {
  key: string
  screenshot: string
}

interface WorkPanel {
  key: string
  screenshot: string
}

interface InsightsTab {
  label: string
  screenshot: string
}

interface ConfigureTab {
  key: string
  label: string
  screenshot: string
}

/**
 * Inner sub-tabs that live within a Configure sidenav section.
 * configureTab  — the Configure sidenav key (e.g. 'settings')
 * subLabel      — visible button text of the inner sub-tab
 * screenshot    — output filename (flat, under SCREENSHOT_DIR)
 */
interface ConfigureSubTab {
  configureTab: string
  subLabel: string
  screenshot: string
}

// Core sidebar pages + extension-contributed routes (optional — guarded with existence check)
const SIDEBAR_PAGES: SidebarPage[] = [
  { nav: 'Home',             screenshot: 'home--initial' },
  { nav: 'Work',             screenshot: 'work--initial' },
  { nav: 'Insights',         screenshot: 'insights--initial' },
  { nav: 'Learn',            screenshot: 'learn--initial' },
  { nav: 'Configure',        screenshot: 'configure--initial' },
  // Extension-contributed routes — present when extensions are installed
  { nav: 'Backstage',        screenshot: 'ext--backstage',        optional: true },
  { nav: 'Efficiency Coach', screenshot: 'ext--efficiency-coach', optional: true },
  { nav: 'PR Scores',        screenshot: 'ext--pr-scores',        optional: true },
]

// Work page mode tabs (driven by hash query params, confirmed in work-page.spec.ts).
// work--initial already captures the default wizard view so wizard is omitted here.
const WORK_TABS: WorkTab[] = [
  { key: 'session',  screenshot: 'work--tab-session' },
  { key: 'compose',  screenshot: 'work--tab-compose' },
  { key: 'schedule', screenshot: 'work--tab-schedule' },
  { key: 'memory',   screenshot: 'work--tab-memory' },
]

// Work page right-side context panels (opened via ?panel= hash param)
const WORK_PANELS: WorkPanel[] = [
  { key: 'agents',    screenshot: 'work--panel-agents' },
  { key: 'tools',     screenshot: 'work--panel-tools' },
  { key: 'templates', screenshot: 'work--panel-templates' },
  { key: 'skills',    screenshot: 'work--panel-skills' },
  { key: 'subagents', screenshot: 'work--panel-subagents' },
]

// Insights tabs — core tabs plus extension-contributed tabs.
// Extension tabs are guarded: if the button isn't found the test skips gracefully.
const INSIGHTS_TABS: InsightsTab[] = [
  { label: 'Analytics',        screenshot: 'insights--tab-analytics' },
  { label: 'Compliance',       screenshot: 'insights--tab-compliance' },
  { label: 'Usage',            screenshot: 'insights--tab-usage' },
  { label: 'Catalog Insights', screenshot: 'insights--tab-catalog-insights' },
  { label: 'Efficiency',       screenshot: 'insights--tab-efficiency' },
  { label: 'PR Health',        screenshot: 'insights--tab-pr-health' },
]

// All 14 Configure tabs — captured by clicking tab buttons directly after an
// initial navigation so re-navigation loading flashes don't affect screenshots.
const CONFIGURE_TABS: ConfigureTab[] = [
  { key: 'setup',         label: 'Setup Wizard',  screenshot: 'configure--tab-setup' },
  { key: 'accessibility', label: 'Accessibility', screenshot: 'configure--tab-accessibility' },
  { key: 'settings',      label: 'Settings',      screenshot: 'configure--tab-settings' },
  { key: 'policies',      label: 'Policies',      screenshot: 'configure--tab-policies' },
  { key: 'integrations',  label: 'Integrations',  screenshot: 'configure--tab-integrations' },
  { key: 'extensions',    label: 'Extensions',    screenshot: 'configure--tab-extensions' },
  { key: 'memory',        label: 'Memory',        screenshot: 'configure--tab-memory' },
  { key: 'agents',        label: 'Agents',        screenshot: 'configure--tab-agents' },
  { key: 'skills',        label: 'Skills',        screenshot: 'configure--tab-skills' },
  { key: 'wizard',        label: 'Session Wizard', screenshot: 'configure--tab-wizard' },
  { key: 'workspaces',    label: 'Workspaces',    screenshot: 'configure--tab-workspaces' },
  { key: 'team',          label: 'Team Hub',      screenshot: 'configure--tab-team' },
  { key: 'scheduler',     label: 'Scheduler',     screenshot: 'configure--tab-scheduler' },
  { key: 'branding',      label: 'White Label',   screenshot: 'configure--tab-branding' },
]

// Inner sub-tabs for each Configure sidenav section that has its own tab bar.
// Sections with only a single flat view (Accessibility, Integrations, Extensions,
// Agents, Skills, Setup Wizard, Session Wizard, Scheduler) are not listed here
// because the main CONFIGURE_TABS crawl already captures their full view.
//
// Screenshot naming: configure--tab-{section}--sub-{key}
const CONFIGURE_SUB_TABS: ConfigureSubTab[] = [
  // ── Settings (10 inner tabs) ────────────────────────────────────────────
  { configureTab: 'settings', subLabel: 'CLI Flags',       screenshot: 'configure--tab-settings--sub-cli-flags' },
  { configureTab: 'settings', subLabel: 'Model',           screenshot: 'configure--tab-settings--sub-model' },
  { configureTab: 'settings', subLabel: 'Budget & Limits', screenshot: 'configure--tab-settings--sub-budget' },
  { configureTab: 'settings', subLabel: 'Plugins',         screenshot: 'configure--tab-settings--sub-plugins' },
  { configureTab: 'settings', subLabel: 'Profiles',        screenshot: 'configure--tab-settings--sub-profiles' },
  { configureTab: 'settings', subLabel: 'Environment',     screenshot: 'configure--tab-settings--sub-env' },
  { configureTab: 'settings', subLabel: 'Notifications',   screenshot: 'configure--tab-settings--sub-notifications' },
  { configureTab: 'settings', subLabel: 'Webhooks',        screenshot: 'configure--tab-settings--sub-webhooks' },
  { configureTab: 'settings', subLabel: 'Data Management', screenshot: 'configure--tab-settings--sub-data' },
  { configureTab: 'settings', subLabel: 'Feature Flags',   screenshot: 'configure--tab-settings--sub-features' },

  // ── Policies (3 inner tabs) ─────────────────────────────────────────────
  // 'Presets' is the default view — captured by configure--tab-policies above.
  { configureTab: 'policies', subLabel: 'Violations', screenshot: 'configure--tab-policies--sub-violations' },
  { configureTab: 'policies', subLabel: 'Editor',     screenshot: 'configure--tab-policies--sub-editor' },

  // ── Memory (6 inner tabs) ───────────────────────────────────────────────
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
  { configureTab: 'team', subLabel: 'Activity',      screenshot: 'configure--tab-team--sub-activity' },

  // ── White Label / Branding (6 inner sections) ───────────────────────────
  // 'Theme Presets' is the default — captured by configure--tab-branding above.
  { configureTab: 'branding', subLabel: 'Identity',       screenshot: 'configure--tab-branding--sub-identity' },
  { configureTab: 'branding', subLabel: 'Brand Colors',   screenshot: 'configure--tab-branding--sub-colors' },
  { configureTab: 'branding', subLabel: 'UI Colors',      screenshot: 'configure--tab-branding--sub-ui-colors' },
  { configureTab: 'branding', subLabel: 'Surfaces & Mode', screenshot: 'configure--tab-branding--sub-surfaces' },
  { configureTab: 'branding', subLabel: 'Preview',        screenshot: 'configure--tab-branding--sub-preview' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      await captureScreenshot(`${baseName}--scrolled`)
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
        // Match common loading patterns: "Loading...", "Loading setup wizard..."
        return !html.match(/Loading\s+(setup|data|wizard|content)?\.{3}/i)
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
        // For optional extension routes, guard with an existence check first
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
        await captureScreenshot(page.screenshot)
      })
    }
  })

  // ── Work Page — Mode Tabs ─────────────────────────────────────────────────

  describe('Work Page — Mode Tabs', () => {
    before(async () => {
      await navigateSidebarTo('Work')
      await browser.pause(800)
    })

    for (const tab of WORK_TABS) {
      it(`captures Work tab: ${tab.key}`, async () => {
        // Hash navigation confirmed in work-page.spec.ts
        await browser.execute((key) => {
          window.location.hash = `#/work?tab=${key}`
        }, tab.key)
        await browser.pause(800)
        await waitForLoadingToSettle()

        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
        await captureScreenshot(tab.screenshot)
      })
    }
  })

  // ── Work Page — Context Panels ────────────────────────────────────────────

  describe('Work Page — Context Panels', () => {
    before(async () => {
      await navigateSidebarTo('Work')
      await browser.pause(800)
    })

    for (const panel of WORK_PANELS) {
      it(`captures Work panel: ${panel.key}`, async () => {
        await browser.execute((key) => {
          window.location.hash = `#/work?panel=${key}`
        }, panel.key)
        await browser.pause(800)

        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
        await captureScreenshot(panel.screenshot)
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
          console.log(`[screenshot-crawl] Insights tab "${tab.label}" not found — skipping`)
          return
        }

        await btn.waitForClickable({ timeout: ELEMENT_TIMEOUT })
        await btn.click()
        await browser.pause(600)
        await waitForLoadingToSettle()

        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
        await captureScreenshot(tab.screenshot)
      })
    }
  })

  // ── Configure Page — Tabs ─────────────────────────────────────────────────

  describe('Configure Page — Tabs', () => {
    before(async () => {
      // Navigate to Configure once, then click through tabs directly.
      // Avoids repeated sidebar navigation which can trigger loading flashes
      // on async-loaded tabs (e.g. Setup Wizard fetches data via IPC on mount).
      await navigateSidebarTo('Configure')
      await browser.pause(1000)
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
        await captureScreenshot(tab.screenshot)
      })
    }
  })

  // ── Configure Page — Tab Sub-Tabs ─────────────────────────────────────────
  //
  // Several Configure sidenav sections contain their own inner tab bar
  // (Settings, Policies, Memory, Workspaces, Team Hub, White Label).
  // This block visits every inner sub-tab and optionally captures a
  // scrolled-down view when the content overflows the viewport.
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
      await navigateSidebarTo('Configure')
      await browser.pause(1000)
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

        await captureScreenshot(sub.screenshot)
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

        await captureScreenshot(sub.screenshot)
        await tryScrollCapture(sub.screenshot)
      })
    }
  })
})
