/**
 * e2e/helpers/pw.ts
 *
 * Playwright equivalents of the WDIO helpers in `e2e/helpers/app.ts`.
 *
 * Every helper takes `page: Page` as the first argument since there's no
 * `browser` global in Playwright. The export surface mirrors `app.ts` so
 * specs port with minimal diff.
 *
 * Will be renamed to `app.ts` (overwriting the WDIO version) at cutover.
 */
import { expect, type Page } from '@playwright/test'

export const APP_READY_TIMEOUT = 20_000
export const ELEMENT_TIMEOUT = 10_000

// ── App lifecycle ────────────────────────────────────────────────────────────

/**
 * Wait until the renderer has fully loaded. The React app mounts under
 * `<div id="root">` which is always present in renderer/index.html
 * regardless of the active route.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.locator('#root').waitFor({
    state: 'attached',
    timeout: APP_READY_TIMEOUT,
  })
  // Visible nav indicates initial render finished — and gives a much better
  // error message than a bare timeout if the app crashed during boot.
  // Sidebar.tsx renders <aside role="navigation" aria-label="Main navigation">,
  // so this role+name lookup is unambiguous and survives DOM refactors.
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
    timeout: ELEMENT_TIMEOUT,
  })
}

// ── Sidebar navigation ───────────────────────────────────────────────────────

/**
 * Click a sidebar nav link by visible text label.
 *
 * The sidebar (<aside>) holds main nav links AND pinned-bottom links
 * ("Connect", "Settings") that live in a <div> outside the primary <nav>,
 * so we search the whole <aside>.
 */
export async function navigateSidebarTo(page: Page, label: string): Promise<void> {
  await page.locator('aside').getByRole('link', { name: label, exact: true }).first().click()
  // Brief settle for React Router transition; the spec's follow-up
  // assertion is the real wait.
  await page.waitForTimeout(300)
}

// ── Hash routing ─────────────────────────────────────────────────────────────

/**
 * Navigate to a hash route. In Electron's file:// scheme, page.goto()
 * doesn't reliably handle hash routes — set window.location.hash directly.
 */
export async function navigateToHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = h
  }, hash)
  // Hash changes don't trigger a full document load, so just yield to the
  // event loop; the caller asserts on the new page's content.
  await page.waitForTimeout(300)
}

// ── Configure / Connect tabs ─────────────────────────────────────────────────

/**
 * Navigate to the Settings (was "Configure") page and select a specific tab.
 *
 * Tabs are rendered as `<button id="tab-${tabKey}" role="tab">`. Tab keys:
 * setup, accessibility, settings, tools, policies, memory, agents, skills,
 * wizard, workspaces, team, scheduler, branding.
 */
export async function navigateToConfigureTab(page: Page, tabKey: string): Promise<void> {
  await navigateSidebarTo(page, 'Settings')
  await page.locator(`#tab-${tabKey}`).click()
  await page.waitForTimeout(300)
}

/** Navigate to a Connect page tab via URL params. */
export async function navigateToConnectTab(page: Page, tabKey: string): Promise<void> {
  await navigateToHash(page, `#/connect?tab=${tabKey}`)
}

/** Read a tab's `aria-selected` state. */
export async function isConfigureTabSelected(page: Page, tabKey: string): Promise<boolean> {
  const selected = await page.locator(`#tab-${tabKey}`).getAttribute('aria-selected')
  return selected === 'true'
}

/**
 * Wait for the Work page chat area to render. Mirrors WDIO `waitForWorkPage`.
 */
export async function waitForWorkPage(page: Page, timeout = ELEMENT_TIMEOUT): Promise<void> {
  await page.waitForFunction(
    () => (document.getElementById('root')?.innerHTML.length ?? 0) > 200,
    undefined,
    { timeout },
  )
}

/**
 * True if the main content region (Layout's Outlet target) is rendered.
 */
export async function mainContentIsRendered(page: Page): Promise<boolean> {
  return (await page.locator('main, [role="main"], .flex-1').count()) > 0
}

// ── Inputs (React-controlled) ────────────────────────────────────────────────

/**
 * Read an input value. `Locator.inputValue()` reads the actual DOM property
 * (not `getAttribute('value')` which is the initial attribute).
 */
export async function getInputValue(page: Page, selector: string): Promise<string> {
  return page.locator(selector).inputValue()
}

/**
 * Set an input value. `Locator.fill()` fires React's onChange because it
 * dispatches real input events from the browser side. For stubborn cases
 * (CodeMirror, Monaco, custom controlled wrappers) use
 * `setInputValueLowLevel` below.
 */
export async function setInputValue(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).fill(value)
}

/**
 * Native-setter fallback for controlled components that intercept input
 * events. Walks the React-patched HTMLInputElement.prototype.value setter
 * and dispatches a synthetic input event with bubbles.
 */
export async function setInputValueLowLevel(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    ([sel, val]) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null
      if (!el) throw new Error(`Element not found: ${sel}`)
      const proto =
        el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      if (!setter) throw new Error('No value setter found on prototype')
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    [selector, value] as const,
  )
}

// ── IPC bridge ───────────────────────────────────────────────────────────────

/** Round-trip an IPC call through the preload bridge. */
export async function invokeIPC<T = unknown>(
  page: Page,
  channel: string,
  args?: unknown,
): Promise<T> {
  return page.evaluate(
    ([ch, a]) =>
      (window as unknown as { electronAPI: { invoke: (c: string, a?: unknown) => Promise<unknown> } })
        .electronAPI.invoke(ch, a),
    [channel, args] as const,
  ) as Promise<T>
}

// ── Lookups ──────────────────────────────────────────────────────────────────

/** True if any element matching `text` exists on the page. */
export async function elementWithTextExists(page: Page, text: string): Promise<boolean> {
  return (await page.getByText(text).count()) > 0
}

/** Wait for text to appear anywhere on the page (substring match). */
export async function waitForText(
  page: Page,
  text: string,
  timeout = ELEMENT_TIMEOUT,
): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible({ timeout })
}

/** True if any button with visible text equal to (or containing) `text` exists. */
export async function buttonExists(page: Page, text: string): Promise<boolean> {
  return (await page.getByRole('button', { name: text }).count()) > 0
}

/** Click the first button containing `text`. */
export async function clickButton(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: text }).first().click()
  await page.waitForTimeout(200)
}

/** Count elements matching a CSS selector. */
export async function countElements(page: Page, selector: string): Promise<number> {
  return page.locator(selector).count()
}

/**
 * Wait for a CSS selector to attach to the DOM. Prefer locator-targeted
 * assertions (`expect(loc).toBeVisible()`) when possible.
 */
export async function waitForSelector(
  page: Page,
  selector: string,
  timeout = ELEMENT_TIMEOUT,
): Promise<void> {
  await page.locator(selector).waitFor({ state: 'attached', timeout })
}

// ── Toggles (aria-checked-based) ─────────────────────────────────────────────

export async function getToggleState(page: Page, id: string): Promise<boolean> {
  const checked = await page.locator(`#${id}`).getAttribute('aria-checked')
  return checked === 'true'
}

export async function clickToggle(page: Page, id: string): Promise<void> {
  await page.locator(`#${id}`).click()
  await page.waitForTimeout(200)
}

// ── Misc ─────────────────────────────────────────────────────────────────────

/** Get all text contents of elements matching a selector. */
export async function getTextContents(page: Page, selector: string): Promise<string[]> {
  const all = await page.locator(selector).allTextContents()
  return all.map((t) => t.trim()).filter((t) => t.length > 0)
}

/** Get the rendered #root HTML (for length-based smoke checks). */
export async function getRootHTML(page: Page): Promise<string> {
  return page.locator('#root').innerHTML()
}

/**
 * Collect renderer console errors gathered during the test.
 *
 * In Playwright, the `consoleErrors` test fixture (in `e2e/fixtures.ts`) is
 * the canonical source — it auto-attaches via page.on('console') and
 * page.on('pageerror'). This helper is a thin shim for migrated specs that
 * call `getCriticalConsoleErrors()` inline; it returns whatever has been
 * collected so far. Spec authors should prefer the fixture when possible.
 */
export async function getCriticalConsoleErrors(
  errors?: string[],
): Promise<string[]> {
  return errors ?? []
}

// ── Dynamic content freezer ──────────────────────────────────────────────────

/**
 * Replace dynamic text patterns with deterministic placeholders so visual
 * baselines don't drift between runs. Pure DOM logic — ports 1:1 from the
 * WDIO version.
 *
 * Two complementary mechanisms:
 *   1. Pattern-based replacement of common timestamp/date formats inside
 *      every text node.
 *   2. `data-screenshot-stub="…"` attribute override for content that
 *      doesn't match a pattern (random IDs, percent badges, counters).
 *      Place the attribute on the smallest enclosing element and the
 *      helper sets that element's textContent to the attribute value.
 *
 * Call immediately before `expect(page).toHaveScreenshot(...)`.
 */
export async function freezeDynamicContent(page: Page): Promise<void> {
  await page.evaluate(() => {
    function replaceDynamic(text: string): string {
      let next = text
      // Time-of-day greetings
      next = next.replace(/Good (morning|afternoon|evening)/g, 'Good day')
      // Relative phrases without a number
      next = next.replace(/\b(just now|moments? ago|yesterday)\b/gi, '5 minutes ago')
      // "5m ago", "5 minutes ago", "2h ago", "3 days ago" etc.
      next = next.replace(
        /\b\d+\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|y)\s+ago\b/gi,
        '5 minutes ago',
      )
      // Long-form locale date+time first (more specific) so the date-only
      // pattern doesn't fire on the date half and leave stray punctuation.
      next = next.replace(
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}(,\s+\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM))?/g,
        'Apr 26, 2026, 2:45 PM',
      )
      // 12-hour clock "2:45 PM" / "12:34:56 PM"
      next = next.replace(/\b\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM)\b/g, '2:45 PM')
      // Short locale date "4/26/2026"
      next = next.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '4/26/2026')
      // ISO calendar date "2026-04-26"
      next = next.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '2026-04-26')
      // Stopwatch durations like "2m 15s"
      next = next.replace(/\b\d+m\s+\d+s\b/g, '2m 15s')
      return next
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const t = node as Text
      const replaced = replaceDynamic(t.data)
      if (replaced !== t.data) t.data = replaced
    }
    document.querySelectorAll<HTMLElement>('[data-screenshot-stub]').forEach((el) => {
      const stub = el.getAttribute('data-screenshot-stub') ?? ''
      if (el.textContent !== stub) el.textContent = stub
    })
  })
}

// ── Visual: Loading-state settle ─────────────────────────────────────────────

/**
 * Wait for any loading spinners / skeletons to disappear before capture.
 * Best-effort: no failure if the timeout elapses (some pages keep skeletons).
 */
export async function waitForLoadingToSettle(
  page: Page,
  timeout = 10_000,
): Promise<void> {
  await page
    .waitForFunction(
      () =>
        !document.querySelector(
          '[data-loading="true"], .animate-spin, [aria-busy="true"]',
        ),
      undefined,
      { timeout },
    )
    .catch(() => {
      /* best-effort — leave spinners alone */
    })
  await page.waitForTimeout(200)
}

// ── Visual: Window content size ─────────────────────────────────────────────

/**
 * Pin the Electron window content area to exactly 1280×800 on every
 * platform. Defensive — fixtures.ts already does this once per test.
 */
export async function pinWindowSize(
  electronApp: import('@playwright/test').ElectronApplication,
  width = 1280,
  height = 800,
): Promise<void> {
  await electronApp.evaluate(
    ({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      win?.setContentSize(w, h)
    },
    [width, height] as const,
  )
}
