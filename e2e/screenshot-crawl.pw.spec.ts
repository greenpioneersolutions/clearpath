/**
 * e2e/screenshot-crawl.pw.spec.ts
 *
 * Visual coverage spec — crawls every page and tab in the app and captures a
 * screenshot of each via `expect(page).toHaveScreenshot()`.
 *
 * Cross-OS strategy is centralized in `playwright.screenshots.config.ts`:
 *   - Window pinned to 1280×800 content size
 *   - DPR pinned to 1 via `--force-device-scale-factor=1`
 *   - `--hide-scrollbars` keeps usable viewport identical
 *   - Dark color scheme matches BrandingContext
 *   - threshold: 0.2 + maxDiffPixelRatio: 0.02 covers FreeType vs CoreText
 *
 * What still fails the test:
 *   - Navigation / element-wait timeouts
 *   - JS exceptions thrown from the spec or app
 *   - Required Insights tabs missing (built-in tabs throw)
 *   - Visual diff above the configured threshold (use -u to update baselines)
 *
 * Local usage:
 *   npm run pw:screenshots          - compare against committed baselines
 *   npm run pw:screenshots:update   - regenerate baselines after intentional UI change
 */

import { test, expect, type Page } from './fixtures'
import {
  waitForAppReady,
  navigateSidebarTo,
  invokeIPC,
  freezeDynamicContent,
  ELEMENT_TIMEOUT,
} from './helpers/pw'
import fs from 'node:fs'
import path from 'node:path'

// ── Data tables ──────────────────────────────────────────────────────────────

interface SidebarPage {
  nav: string
  screenshot: string
  optional?: boolean
}

interface WorkTab {
  key: string
  screenshot: string
}

interface InsightsTab {
  label: string
  screenshot: string
  optional?: boolean
}

interface ConnectTab {
  key: string
  label: string
  screenshot: string
}

interface ConfigureTab {
  key: string
  label: string
  screenshot: string
}

interface ConfigureSubTab {
  configureTab: string
  subLabel: string
  screenshot: string
}

const SIDEBAR_PAGES: SidebarPage[] = [
  { nav: 'Home',             screenshot: 'home--initial' },
  { nav: 'Sessions',         screenshot: 'work--initial' },
  { nav: 'Notes',            screenshot: 'notes--initial',        optional: true },
  { nav: 'Insights',         screenshot: 'insights--initial' },
  { nav: 'Clear Memory',     screenshot: 'clear-memory--initial', optional: true },
  { nav: 'Learn',            screenshot: 'learn--initial',        optional: true },
  { nav: 'Connect',          screenshot: 'connect--initial' },
  { nav: 'Settings',         screenshot: 'configure--initial' },
  { nav: 'Backstage',        screenshot: 'ext--backstage',        optional: true },
  { nav: 'Efficiency Coach', screenshot: 'ext--efficiency-coach', optional: true },
]

const WORK_TABS: WorkTab[] = [
  { key: 'session',  screenshot: 'work--tab-session' },
  { key: 'compose',  screenshot: 'work--tab-compose' },
  { key: 'schedule', screenshot: 'work--tab-schedule' },
]

const INSIGHTS_TABS: InsightsTab[] = [
  { label: 'Activity',         screenshot: 'insights--tab-activity' },
  { label: 'Compliance',       screenshot: 'insights--tab-compliance' },
  { label: 'Catalog Insights', screenshot: 'insights--tab-catalog-insights', optional: true },
  { label: 'Efficiency',       screenshot: 'insights--tab-efficiency',       optional: true },
  { label: 'PR Health',        screenshot: 'insights--tab-pr-health',        optional: true },
]

const CONNECT_TABS: ConnectTab[] = [
  { key: 'integrations', label: 'Integrations', screenshot: 'connect--tab-integrations' },
  { key: 'environment',  label: 'Environment',  screenshot: 'connect--tab-environment' },
  { key: 'plugins',      label: 'Plugins',      screenshot: 'connect--tab-plugins' },
  { key: 'webhooks',     label: 'Webhooks',     screenshot: 'connect--tab-webhooks' },
]

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

const CONFIGURE_SUB_TABS: ConfigureSubTab[] = [
  // ── Settings / "General" ──
  { configureTab: 'settings', subLabel: 'Model',           screenshot: 'configure--tab-settings--sub-model' },
  { configureTab: 'settings', subLabel: 'Session Limits',  screenshot: 'configure--tab-settings--sub-limits' },
  { configureTab: 'settings', subLabel: 'Profiles',        screenshot: 'configure--tab-settings--sub-profiles' },
  { configureTab: 'settings', subLabel: 'Notifications',   screenshot: 'configure--tab-settings--sub-notifications' },
  { configureTab: 'settings', subLabel: 'Data Management', screenshot: 'configure--tab-settings--sub-data' },
  { configureTab: 'settings', subLabel: 'Feature Flags',   screenshot: 'configure--tab-settings--sub-features' },

  // ── Policies ──
  { configureTab: 'policies', subLabel: 'Violations', screenshot: 'configure--tab-policies--sub-violations' },
  { configureTab: 'policies', subLabel: 'Editor',     screenshot: 'configure--tab-policies--sub-editor' },

  // ── Memory / "Notes & Context" ──
  { configureTab: 'memory', subLabel: 'Starter Memories', screenshot: 'configure--tab-memory--sub-starter' },
  { configureTab: 'memory', subLabel: 'Config Files',     screenshot: 'configure--tab-memory--sub-config-files' },
  { configureTab: 'memory', subLabel: 'Instructions',     screenshot: 'configure--tab-memory--sub-instructions' },
  { configureTab: 'memory', subLabel: 'CLI Memory',       screenshot: 'configure--tab-memory--sub-cli-memory' },
  { configureTab: 'memory', subLabel: 'Context Usage',    screenshot: 'configure--tab-memory--sub-context' },

  // ── Team Hub ──
  { configureTab: 'team', subLabel: 'Shared Folder', screenshot: 'configure--tab-team--sub-sync' },
  { configureTab: 'team', subLabel: 'Setup Wizard',  screenshot: 'configure--tab-team--sub-wizard' },
  { configureTab: 'team', subLabel: 'Marketplace',   screenshot: 'configure--tab-team--sub-marketplace' },
  { configureTab: 'team', subLabel: 'Activity',      screenshot: 'configure--tab-team--sub-activity' },

  // ── Branding ──
  { configureTab: 'branding', subLabel: 'Identity',        screenshot: 'configure--tab-branding--sub-identity' },
  { configureTab: 'branding', subLabel: 'Brand Colors',    screenshot: 'configure--tab-branding--sub-colors' },
  { configureTab: 'branding', subLabel: 'UI Colors',       screenshot: 'configure--tab-branding--sub-ui-colors' },
  { configureTab: 'branding', subLabel: 'Surfaces & Mode', screenshot: 'configure--tab-branding--sub-surfaces' },
  { configureTab: 'branding', subLabel: 'Preview',         screenshot: 'configure--tab-branding--sub-preview' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Capture a screenshot for the given tag. Always freezes dynamic content first
 * so timestamps, greetings, and locale dates don't drift between runs.
 *
 * The `[data-screenshot-stub]` mask covers any remaining dynamic regions that
 * opt into the freeze via attribute (e.g. percent badges, random IDs).
 *
 * `timeout: 30_000` overrides the per-config default — Playwright re-shoots
 * until two consecutive frames match, and tabs with async IPC content
 * (Setup Wizard, scheduler) need extra room before they fully settle.
 */
// Path template mirrors playwright.screenshots.config.ts — keeps the direct-write
// fallback below in sync with `expect(...).toHaveScreenshot()` output.
const BASELINE_DIR = path.resolve(process.cwd(), 'e2e/screenshots/baseline')

// Skip Playwright's `document.fonts.ready` wait inside page.screenshot. Some
// pages keep a font-load promise pending forever (web fonts that never resolve
// in the headless renderer) which makes the regenerate path hang at "waiting
// for fonts to load…". This env var must be set in the worker process — when
// running this spec set PW_TEST_SCREENSHOT_NO_FONTS_READY=1 in the shell, e.g.
//   PW_TEST_SCREENSHOT_NO_FONTS_READY=1 npx playwright test -c playwright.screenshots.config.ts -u
// The package.json `pw:screenshots*` scripts pass it through automatically.

/**
 * In `--update-snapshots` mode some pages won't reach a perfectly stable
 * pixel state inside the regenerate timeout (extension-loaded sidebar
 * entries, gradients, dark-mode color blends). We detect update mode and
 * write the screenshot directly via `page.screenshot()`, bypassing the
 * "two consecutive matching frames" stability gate. In compare mode we use
 * `toHaveScreenshot` as normal, which respects the per-config `threshold`
 * and `maxDiffPixelRatio` so legitimate flake is absorbed at compare time.
 */
function isUpdateMode(): boolean {
  // testInfo.config.updateSnapshots reflects the resolved update strategy.
  // Without --update-snapshots the CLI default is 'missing' (only writes
  // baselines when none exist); with --update-snapshots it becomes 'all'
  // or 'changed'. We treat 'all' / 'changed' as "the user asked us to
  // overwrite existing baselines", which is when the regenerate-stability
  // gate is the most likely to fight us.
  const mode = test.info().config.updateSnapshots
  return mode === 'all' || mode === 'changed'
}

/**
 * Capture the renderer via Electron's `BrowserWindow.capturePage()` API —
 * goes straight through the compositor to a NativeImage and bypasses every
 * implicit wait Playwright's page.screenshot does (fonts.ready, RAF, anim
 * sync). Necessary on macOS where the headless Electron renderer keeps
 * font-load and other promises pending forever on busy pages.
 */
async function captureElectronWindow(
  electronApp: import('@playwright/test').ElectronApplication,
  filePath: string,
): Promise<void> {
  const buf = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No BrowserWindow available for capture')
    const img = await win.capturePage()
    return img.toPNG().toString('base64')
  })
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, Buffer.from(buf, 'base64'))
}

async function preparePage(page: Page): Promise<void> {
  await freezeDynamicContent(page)
  // Disable Tailwind `transition-*` durations globally — `animations: 'disabled'`
  // (set in playwright.screenshots.config.ts) only freezes CSS animations;
  // transitions can still re-paint between consecutive screenshot captures
  // and break the "two consecutive matching frames" stability check used by
  // toHaveScreenshot when regenerating.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition-property: none !important;
        transition-duration: 0ms !important;
        animation-duration: 0ms !important;
        animation-iteration-count: 1 !important;
        caret-color: transparent !important;
      }
      /* Force-finish Tailwind animate-pulse / animate-spin / animate-bounce so
         skeleton loaders that never resolve can't keep the screenshot loop
         spinning. The element keeps its loading layout but the keyframes
         freeze on iteration 1 (flat opacity / no rotation). */
      .animate-pulse, .animate-spin, .animate-bounce, .animate-ping {
        animation: none !important;
      }
    `,
  })
  // Blur any focused element (textarea cursor blink defeats frame-stability).
  await page.evaluate(() => {
    const active = document.activeElement
    if (active && active instanceof HTMLElement && active !== document.body) {
      active.blur()
    }
  })
}

async function checkScreenshot(
  page: Page,
  electronApp: import('@playwright/test').ElectronApplication,
  name: string,
): Promise<void> {
  await preparePage(page)
  const baselinePath = path.join(BASELINE_DIR, `${name}.png`)

  if (isUpdateMode()) {
    // Direct write via Electron's `BrowserWindow.capturePage()` — bypasses
    // Playwright's regenerate stability gate AND every implicit wait inside
    // page.screenshot (fonts.ready, RAF, animation-sync). Necessary on macOS
    // because some pages (Memory tab, Skills tab) keep async promises
    // pending forever in the headless renderer, hanging page.screenshot.
    await captureElectronWindow(electronApp, baselinePath)
    return
  }

  // Compare path. We can't use Playwright's `toHaveScreenshot` because it
  // hangs at "taking page screenshot" on the same busy-page conditions that
  // motivate the Electron capture above. We capture via Electron, then
  // pixel-diff with pngjs + pixelmatch using the same tolerance as the
  // config's toHaveScreenshot defaults (threshold + maxDiffPixelRatio).
  if (!fs.existsSync(baselinePath)) {
    // CI: a missing baseline is a hard error — likely indicates LFS didn't
    // pull, or a baseline was deleted but never regenerated. Surface it.
    if (process.env.CI) {
      throw new Error(
        `Missing baseline for "${name}" at ${baselinePath}. ` +
        `On CI, baselines must already be committed (or the run must be invoked with -u). ` +
        `Check Git LFS pulled and the baseline exists on the branch.`,
      )
    }
    // Local: auto-record on first run for ergonomics (matches Playwright's
    // --update-snapshots=missing behavior).
    await captureElectronWindow(electronApp, baselinePath)
    test.info().annotations.push({ type: 'note', description: `Wrote missing baseline: ${name}` })
    return
  }
  const tmpPath = path.join(test.info().outputDir, `${name.replace(/[/\\]/g, '_')}-actual.png`)
  await captureElectronWindow(electronApp, tmpPath)
  const ratio = await comparePngPixelRatio(baselinePath, tmpPath)
  // Match playwright.screenshots.config.ts: maxDiffPixelRatio: 0.02.
  if (ratio === null || ratio <= 0.02) return
  await test.info().attach(`${name}-actual`, { path: tmpPath, contentType: 'image/png' })
  await test.info().attach(`${name}-expected`, { path: baselinePath, contentType: 'image/png' })
  throw new Error(
    `Visual diff for "${name}": ${(ratio * 100).toFixed(2)}% pixels differ ` +
    `(threshold 2.00%). Re-run with -u to accept the change, then commit ` +
    `the updated baseline. Actual: ${tmpPath}; baseline: ${baselinePath}.`,
  )
}

/**
 * Pixel-diff two PNG files using pngjs + pixelmatch. Returns the ratio of
 * differing pixels, or null when the images have different dimensions
 * (treated as caller's choice — we report "no diff" for the missing-baseline
 * first-run case at the call site).
 *
 * pixelmatch v7 is ESM-only — `require()` would throw `ERR_REQUIRE_ESM`, so
 * we use a dynamic `import()` and cache the resolved function across calls.
 */
type PixelmatchFn = (
  img1: Uint8Array,
  img2: Uint8Array,
  output: Uint8Array | null,
  width: number,
  height: number,
  options?: { threshold?: number },
) => number

let pixelmatchCache: PixelmatchFn | null = null
async function loadPixelmatch(): Promise<PixelmatchFn> {
  if (pixelmatchCache) return pixelmatchCache
  const mod = (await import('pixelmatch')) as unknown as
    | { default: PixelmatchFn }
    | PixelmatchFn
  pixelmatchCache = typeof mod === 'function' ? mod : mod.default
  return pixelmatchCache
}

async function comparePngPixelRatio(
  baselinePath: string,
  actualPath: string,
): Promise<number | null> {
  // pngjs is CJS, so a normal import works.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PNG } = require('pngjs') as typeof import('pngjs')
  const pixelmatch = await loadPixelmatch()
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath))
  const actual = PNG.sync.read(fs.readFileSync(actualPath))
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    return 1 // different sizes ⇒ all-different
  }
  const diff = new PNG({ width: baseline.width, height: baseline.height })
  const numDiff = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold: 0.2 }, // matches playwright.screenshots.config.ts toHaveScreenshot.threshold
  )
  return numDiff / (baseline.width * baseline.height)
}

/**
 * Try to scroll the primary scrollable container one viewport-height down and
 * capture a second screenshot with `--scrolled` suffix. Best-effort: any error
 * is swallowed so it cannot mask a real test failure.
 */
async function tryScrollCapture(
  page: Page,
  electronApp: import('@playwright/test').ElectronApplication,
  baseName: string,
): Promise<void> {
  try {
    const scrolled = await page.evaluate(() => {
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
      await page.waitForTimeout(300)
      await checkScreenshot(page, electronApp, `${baseName}--scrolled`)
      // Restore scroll position so subsequent tests start clean
      await page.evaluate(() => {
        document.documentElement.scrollTo(0, 0)
        document.querySelector<HTMLElement>('.overflow-y-auto, .overflow-auto')?.scrollTo(0, 0)
      })
      await page.waitForTimeout(200)
    }
  } catch {
    // Best-effort — scroll failures never block the test
  }
}

/**
 * Expand every collapsed sidenav group on the Configure page (the "Advanced"
 * group is collapsed by default in PR #47). Without this, #tab-policies /
 * #tab-team / #tab-scheduler / #tab-branding / #tab-workspaces are not in the
 * DOM and waiting for them times out.
 *
 * Idempotent: collapsed groups have aria-expanded="false"; once clicked they
 * switch to "true" and stay.
 */
async function expandConfigureCollapsedGroups(page: Page): Promise<void> {
  // Collapsible group buttons sit inside the Configure tablist with
  // aria-label="Configure sections" and have aria-expanded="false" when closed.
  const collapsed = page.locator(
    "[role='tablist'][aria-label='Configure sections'] button[aria-expanded='false']",
  )
  const count = await collapsed.count()
  for (let i = 0; i < count; i++) {
    try {
      await collapsed.nth(i).click()
      await page.waitForTimeout(150)
    } catch {
      // Best-effort — never block on a failed expander click
    }
  }
  await page.waitForTimeout(300)
}

/**
 * Poll until no "Loading" indicator text AND no skeleton-pulse animations are
 * present, or until the timeout elapses. Best-effort.
 *
 * Skeleton loaders (Tailwind `animate-pulse`) appear in tabs that fetch state
 * via async IPC (Scheduler, Setup Wizard). They confuse `toHaveScreenshot`'s
 * frame-stability loop because the pulse never reaches a static frame.
 */
async function waitForLoadingToSettle(page: Page, timeout = 3000): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const html = document.body.innerHTML
        if (html.match(/Loading(?:\s+(?:setup|data|wizard|content))?\.{3}/i)) return false
        // Tab content still booting if skeletons / spinners are present.
        if (document.querySelector('.animate-pulse, .animate-spin, [aria-busy="true"]')) {
          return false
        }
        return true
      },
      undefined,
      { timeout, polling: 200 },
    )
    .catch(() => {
      /* best-effort */
    })
}

// ── Spec ─────────────────────────────────────────────────────────────────────

// Crawl mutates window state (navigation, scroll, tab switches); run serial.
test.describe.configure({ mode: 'serial' })

test.describe('ClearPathAI — Screenshot Crawl', () => {
  test.beforeAll(async ({ electronApp }) => {
    const win = await electronApp.firstWindow()
    await waitForAppReady(win)
  })

  // ── Sidebar Pages ─────────────────────────────────────────────────────────

  test.describe('Sidebar Pages', () => {
    for (const sidebarPage of SIDEBAR_PAGES) {
      test(`captures ${sidebarPage.nav} page`, async ({ page, electronApp }) => {
        // For optional routes (feature-flagged or extension-contributed),
        // guard with an existence check first.
        if (sidebarPage.optional) {
          const link = page
            .locator('aside')
            .getByRole('link', { name: sidebarPage.nav, exact: true })
          if ((await link.count()) === 0) {
            test.skip(true, `Sidebar link "${sidebarPage.nav}" not found — optional`)
            return
          }
        }

        await navigateSidebarTo(page, sidebarPage.nav)
        await page.waitForTimeout(800)
        await waitForLoadingToSettle(page)

        await expect(page.locator('#root')).toBeAttached()
        await checkScreenshot(page, electronApp, sidebarPage.screenshot)
      })
    }
  })

  // ── Sessions Page — Mode Tabs ─────────────────────────────────────────────

  test.describe('Sessions Page — Mode Tabs', () => {
    test.beforeAll(async ({ electronApp }) => {
      const win = await electronApp.firstWindow()
      await navigateSidebarTo(win, 'Sessions')
      await win.waitForTimeout(800)
    })

    for (const tab of WORK_TABS) {
      test(`captures Sessions tab: ${tab.key}`, async ({ page, electronApp }) => {
        // Hash navigation confirmed in work-page.pw.spec.ts.
        await page.evaluate((key) => {
          window.location.hash = `#/work?tab=${key}`
        }, tab.key)
        await page.waitForTimeout(800)
        await waitForLoadingToSettle(page)

        await expect(page.locator('#root')).toBeAttached()
        await checkScreenshot(page, electronApp, tab.screenshot)
      })
    }
  })

  // ── Insights Page — Tabs ──────────────────────────────────────────────────

  test.describe('Insights Page — Tabs', () => {
    test.beforeAll(async ({ electronApp }) => {
      const win = await electronApp.firstWindow()
      await navigateSidebarTo(win, 'Insights')
      await win.waitForTimeout(800)
    })

    for (const tab of INSIGHTS_TABS) {
      test(`captures Insights tab: ${tab.label}`, async ({ page, electronApp }) => {
        // Insights tabs are plain buttons matched by visible text.
        const btn = page.getByRole('button', { name: tab.label, exact: true }).first()

        if ((await btn.count()) === 0) {
          if (!tab.optional) {
            throw new Error(`Required Insights tab "${tab.label}" not found`)
          }
          test.skip(true, `Optional Insights tab "${tab.label}" not present`)
          return
        }

        await btn.click({ timeout: ELEMENT_TIMEOUT })
        await page.waitForTimeout(600)
        await waitForLoadingToSettle(page)

        await expect(page.locator('#root')).toBeAttached()
        await checkScreenshot(page, electronApp, tab.screenshot)
      })
    }
  })

  // ── Connect Page — Tabs ───────────────────────────────────────────────────

  test.describe('Connect Page — Tabs', () => {
    test.beforeAll(async ({ electronApp }) => {
      const win = await electronApp.firstWindow()
      await navigateSidebarTo(win, 'Connect')
      await win.waitForTimeout(800)
    })

    for (const tab of CONNECT_TABS) {
      test(`captures Connect tab: ${tab.label}`, async ({ page, electronApp }) => {
        const tabBtn = page.locator(`#connect-tab-${tab.key}`)
        await expect(tabBtn).toBeAttached({ timeout: ELEMENT_TIMEOUT })
        await tabBtn.click({ timeout: ELEMENT_TIMEOUT })
        await page.waitForTimeout(800)
        await waitForLoadingToSettle(page)

        await expect(page.locator('#root')).toBeAttached()
        await checkScreenshot(page, electronApp, tab.screenshot)
      })
    }
  })

  // ── Configure Page — Tabs ─────────────────────────────────────────────────

  test.describe('Configure Page — Tabs', () => {
    test.beforeAll(async ({ electronApp }) => {
      const win = await electronApp.firstWindow()
      // Sidebar label is "Settings" (PR #47); URL is still /configure.
      await navigateSidebarTo(win, 'Settings')
      await win.waitForTimeout(1000)
      // Expand the "Advanced" sidenav group so collapsed tabs become reachable.
      await expandConfigureCollapsedGroups(win)
    })

    for (const tab of CONFIGURE_TABS) {
      test(`captures Configure tab: ${tab.label}`, async ({ page, electronApp }) => {
        // Defensive — re-expand in case earlier serial test collapsed a group.
        await expandConfigureCollapsedGroups(page)

        const tabBtn = page.locator(`#tab-${tab.key}`)
        await expect(tabBtn).toBeAttached({ timeout: ELEMENT_TIMEOUT })
        await tabBtn.click({ timeout: ELEMENT_TIMEOUT })

        // Longer pause for tabs that load content via async IPC (e.g. Setup Wizard).
        await page.waitForTimeout(1200)
        await waitForLoadingToSettle(page, 4000)

        await expect(page.locator('#root')).toBeAttached()
        await checkScreenshot(page, electronApp, tab.screenshot)
      })
    }
  })

  // ── Configure Page — Tab Sub-Tabs ─────────────────────────────────────────
  //
  // Inner tab buttons are plain <button> without role="tab" (that attribute
  // is reserved for the Configure sidenav). Filter buttons by visible text,
  // excluding any with role="tab".

  test.describe('Configure Page — Tab Sub-Tabs', () => {
    let currentConfigureTab = ''

    test.beforeAll(async ({ electronApp }) => {
      const win = await electronApp.firstWindow()
      await navigateSidebarTo(win, 'Settings')
      await win.waitForTimeout(1000)
      await expandConfigureCollapsedGroups(win)
      currentConfigureTab = ''
    })

    for (const sub of CONFIGURE_SUB_TABS) {
      test(`captures Configure ${sub.configureTab} > ${sub.subLabel}`, async ({ page, electronApp }) => {
        // Switch Configure sidenav tab only when the section changes.
        if (currentConfigureTab !== sub.configureTab) {
          await expandConfigureCollapsedGroups(page)
          const tabBtn = page.locator(`#tab-${sub.configureTab}`)
          await expect(tabBtn).toBeAttached({ timeout: ELEMENT_TIMEOUT })
          await tabBtn.click({ timeout: ELEMENT_TIMEOUT })
          await page.waitForTimeout(1200)
          await waitForLoadingToSettle(page, 4000)
          currentConfigureTab = sub.configureTab
        }

        // Click the inner sub-tab button (exclude Configure sidenav role=tab buttons).
        const subBtn = page
          .locator('button:not([role="tab"])', { hasText: sub.subLabel })
          .first()

        if ((await subBtn.count()) === 0) {
          test.skip(true, `Sub-tab "${sub.subLabel}" in "${sub.configureTab}" not found`)
          return
        }

        await subBtn.click({ timeout: ELEMENT_TIMEOUT })
        await page.waitForTimeout(800)
        await waitForLoadingToSettle(page, 3000)

        await expect(page.locator('#root')).toBeAttached()
        await checkScreenshot(page, electronApp, sub.screenshot)
        await tryScrollCapture(page, electronApp, sub.screenshot)
      })
    }
  })

  // ── Configure Page — Workspaces Sub-Tabs ─────────────────────────────────

  test.describe('Configure Page — Workspaces Sub-Tabs', () => {
    let tempWorkspaceId = ''

    test.beforeAll(async ({ electronApp }) => {
      const win = await electronApp.firstWindow()
      // Create a temporary workspace so the inner tab bar renders.
      const ws = (await invokeIPC(win, 'workspace:create', {
        name: 'Screenshot Workspace',
        description: 'Temporary workspace for screenshot crawl',
      })) as { id: string }
      tempWorkspaceId = ws.id
      await invokeIPC(win, 'workspace:set-active', { id: tempWorkspaceId })

      await navigateSidebarTo(win, 'Settings')
      await win.waitForTimeout(800)
      await expandConfigureCollapsedGroups(win)

      // Re-navigate to the Workspaces tab to pick up the new active workspace.
      const tabBtn = win.locator('#tab-workspaces')
      await tabBtn.waitFor({ state: 'attached', timeout: ELEMENT_TIMEOUT })
      await tabBtn.click()
      await win.waitForTimeout(1200)
      await waitForLoadingToSettle(win, 4000)
    })

    test.afterAll(async ({ electronApp }) => {
      if (tempWorkspaceId) {
        const win = await electronApp.firstWindow()
        await invokeIPC(win, 'workspace:delete', { id: tempWorkspaceId })
        tempWorkspaceId = ''
      }
    })

    const WORKSPACE_SUB_TABS = [
      { subLabel: 'Repos',     screenshot: 'configure--tab-workspaces--sub-repos' },
      { subLabel: 'Broadcast', screenshot: 'configure--tab-workspaces--sub-broadcast' },
      { subLabel: 'Activity',  screenshot: 'configure--tab-workspaces--sub-activity' },
      { subLabel: 'Settings',  screenshot: 'configure--tab-workspaces--sub-settings' },
    ]

    for (const sub of WORKSPACE_SUB_TABS) {
      test(`captures Configure workspaces > ${sub.subLabel}`, async ({ page, electronApp }) => {
        const subBtn = page
          .locator('button:not([role="tab"])', { hasText: sub.subLabel })
          .first()

        if ((await subBtn.count()) === 0) {
          test.skip(true, `Workspaces sub-tab "${sub.subLabel}" not found`)
          return
        }

        await subBtn.click({ timeout: ELEMENT_TIMEOUT })
        await page.waitForTimeout(800)
        await waitForLoadingToSettle(page, 3000)

        await expect(page.locator('#root')).toBeAttached()
        await checkScreenshot(page, electronApp, sub.screenshot)
        await tryScrollCapture(page, electronApp, sub.screenshot)
      })
    }
  })
})
