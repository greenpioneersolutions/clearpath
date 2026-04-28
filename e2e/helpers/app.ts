/**
 * e2e/helpers/app.ts
 *
 * Shared utilities for WebdriverIO Electron e2e tests.
 * These helpers abstract common wait patterns and element queries
 * so individual specs stay concise.
 */

/** Default timeout for waiting on the renderer to be ready (ms). */
export const APP_READY_TIMEOUT = 20000

/** Default timeout for individual element interactions (ms). */
export const ELEMENT_TIMEOUT = 10000

/**
 * Wait until the app renderer has fully loaded by polling for the
 * presence of a root-level DOM element that every page shares.
 *
 * The React app mounts under `<div id="root">` which is always present
 * in the renderer's index.html regardless of which route is active.
 */
export async function waitForAppReady(): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const root = await $('#root')
        return root.isExisting()
      } catch {
        return false
      }
    },
    {
      timeout: APP_READY_TIMEOUT,
      timeoutMsg: `App root element (#root) did not appear within ${APP_READY_TIMEOUT}ms`,
      interval: 500,
    }
  )

  // Wait an additional moment for React hydration and initial IPC calls to settle
  await browser.pause(1000)
}

/**
 * Freeze dynamic content in the DOM to a deterministic placeholder so that
 * screenshot baselines don't drift between runs because of time-of-day
 * greetings, relative timestamps, locale-formatted dates, etc.
 *
 * Two complementary mechanisms run inside the same DOM walk:
 *
 * 1. **Pattern-based replacement** in every text node. Common dynamic
 *    formats are matched by regex and overwritten with constants. This
 *    catches Recharts SVG axis labels, UI badges, list rows, etc. without
 *    requiring component-level changes. Patterns are conservative — they
 *    only match shapes that look unambiguously like timestamps/dates.
 *
 * 2. **`data-screenshot-stub="…"`** per-element override. For dynamic
 *    content that doesn't match a pattern (random IDs, percent badges,
 *    counters), put `data-screenshot-stub="placeholder"` on the smallest
 *    enclosing element in the React component; this helper sets that
 *    element's textContent to the attribute value. Layout is preserved
 *    because the same number of characters can be used as a placeholder.
 *
 * Call this immediately before `browser.checkScreen` — see usage in
 * `e2e/screenshot-crawl.spec.ts`.
 */
export async function freezeDynamicContent(): Promise<void> {
  await browser.execute(() => {
    function replaceDynamic(text: string): string {
      let next = text
      // Time-of-day greetings (HomeHub, dashboard widgets)
      next = next.replace(/Good (morning|afternoon|evening)/g, 'Good day')
      // Relative phrases that don't carry a number
      next = next.replace(/\b(just now|moments? ago|yesterday)\b/gi, '5 minutes ago')
      // "5m ago", "5 minutes ago", "2h ago", "3 days ago", etc.
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
      const textNode = node as Text
      const replaced = replaceDynamic(textNode.data)
      if (replaced !== textNode.data) textNode.data = replaced
    }

    document.querySelectorAll<HTMLElement>('[data-screenshot-stub]').forEach((el: HTMLElement) => {
      const stub = el.getAttribute('data-screenshot-stub') ?? ''
      if (el.textContent !== stub) el.textContent = stub
    })
  })
}

/**
 * Collect browser console logs and return an array of critical errors.
 * Warnings and info messages are filtered out — only errors are flagged.
 *
 * Note: `browser.getLogs` requires the log type to be available; on Electron
 * this is 'browser' for renderer console messages.
 */
export async function getCriticalConsoleErrors(): Promise<string[]> {
  try {
    const logs = await browser.getLogs('browser')
    return (logs as Array<{ level: string; message: string }>)
      .filter((entry) => entry.level === 'SEVERE' || entry.level === 'ERROR')
      .map((entry) => entry.message)
  } catch {
    // getLogs may not be available in all Electron driver configurations
    return []
  }
}

/**
 * Click a sidebar navigation link identified by its visible text label
 * and wait briefly for the route transition to settle.
 *
 * The sidebar renders NavLink elements with text content matching the
 * route labels defined in Sidebar.tsx: Home, Sessions, Notes, Insights,
 * Clear Memory, Learn, plus Connect and Settings (pinned to the bottom).
 * (Work was renamed to Sessions in 1.13.0; the route is still /work.)
 *
 * Note: "Connect" and "Settings" are pinned to the bottom of the sidebar
 * in a <div> outside the main <nav> element, so we search the entire
 * <aside> for any anchor containing the label text.
 *
 * Uses XPath text matching since WebdriverIO's `=` text-selector syntax
 * is not reliably translated in Electron's Chromedriver context.
 */
export async function navigateSidebarTo(label: string): Promise<void> {
  // Search the entire sidebar aside (not just nav) to handle pinned-bottom
  // links (Connect, Settings) that live in a div outside the primary <nav>
  const xpath = `//aside//a[contains(., '${label}')]`
  const link = await $(xpath)

  await link.waitForExist({ timeout: ELEMENT_TIMEOUT })
  await link.waitForClickable({ timeout: ELEMENT_TIMEOUT })
  await link.click()

  // Brief pause for React Router transition
  await browser.pause(500)
}

/**
 * Check whether the main content area (the Outlet render target)
 * has at least some rendered content.
 */
export async function mainContentIsRendered(): Promise<boolean> {
  try {
    // The Layout component wraps content in a flex container that holds
    // the sidebar and the main Outlet region. Look for `main` or the
    // flex container that hosts the page content.
    const main = await $('main, [role="main"], .flex-1')
    return main.isExisting()
  } catch {
    return false
  }
}

// ── Configure Page Helpers ──────────────────────────────────────────────────

/**
 * Navigate to the Configure page and select a specific tab.
 *
 * The sidebar link to /configure has the visible label "Settings" (the
 * route path itself is still /configure, the label was changed in PR #47).
 *
 * Tab keys: setup, accessibility, settings, tools, policies, memory,
 * agents, skills, wizard, workspaces, team, scheduler, branding.
 *
 * Tabs that previously lived under Configure but moved to /connect in
 * PR #47 — integrations, extensions, plus the Settings sub-tabs Plugins,
 * Environment, Webhooks — should be reached via navigateToConnectTab().
 */
export async function navigateToConfigureTab(tabKey: string): Promise<void> {
  await navigateSidebarTo('Settings')

  const tabButton = await $(`#tab-${tabKey}`)
  await tabButton.waitForExist({ timeout: ELEMENT_TIMEOUT })
  await tabButton.waitForClickable({ timeout: ELEMENT_TIMEOUT })
  await tabButton.click()

  // Wait for tab content to render
  await browser.pause(500)
}

// ── Connect Page Helpers ────────────────────────────────────────────────────

/**
 * Navigate to the Connect page and switch to a specific sub-tab via
 * the ?tab= URL param (which Connect.tsx reads on mount).
 *
 * Sub-tab keys: integrations, extensions, mcp, environment, plugins,
 * webhooks. PR #47 introduced Connect as the home for integration-style
 * surfaces that previously lived in Configure.
 */
export async function navigateToConnectTab(tabKey: string): Promise<void> {
  await browser.execute((key: string) => {
    window.location.hash = `#/connect?tab=${key}`
  }, tabKey)
  await browser.pause(500)
}

/**
 * Check if a Configure tab is currently selected (has aria-selected="true").
 */
export async function isConfigureTabSelected(tabKey: string): Promise<boolean> {
  try {
    const tabButton = await $(`#tab-${tabKey}`)
    const selected = await tabButton.getAttribute('aria-selected')
    return selected === 'true'
  } catch {
    return false
  }
}

// ── Work Page Helpers ───────────────────────────────────────────────────────

/**
 * Wait for the Work page to be ready (chat area rendered).
 */
export async function waitForWorkPage(): Promise<void> {
  await browser.waitUntil(
    async () => {
      const root = await $('#root')
      const html = await root.getHTML()
      return html.length > 200
    },
    { timeout: ELEMENT_TIMEOUT, interval: 300 }
  )
}

// ── Generic Helpers ─────────────────────────────────────────────────────────

/**
 * Get all visible text content from elements matching a selector.
 */
export async function getTextContents(selector: string): Promise<string[]> {
  const elements = await $$(selector)
  const texts: string[] = []
  for (const el of elements) {
    try {
      const text = await el.getText()
      if (text.trim()) texts.push(text.trim())
    } catch {
      // Element may have gone stale during iteration
    }
  }
  return texts
}

/**
 * Check if any element matching a selector contains the given text.
 */
export async function elementWithTextExists(selector: string, text: string): Promise<boolean> {
  const texts = await getTextContents(selector)
  return texts.some((t) => t.includes(text))
}

/**
 * Wait for text to appear anywhere in the page body.
 */
export async function waitForText(text: string, timeout = ELEMENT_TIMEOUT): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const body = await $('body')
        const html = await body.getHTML()
        return html.includes(text)
      } catch {
        return false
      }
    },
    { timeout, timeoutMsg: `Text "${text}" did not appear within ${timeout}ms`, interval: 300 }
  )
}

/**
 * Check if any button with specific text exists and is visible.
 */
export async function buttonExists(text: string): Promise<boolean> {
  try {
    const xpath = `//button[contains(., '${text}')]`
    const btn = await $(xpath)
    return btn.isExisting()
  } catch {
    return false
  }
}

/**
 * Click a button identified by its visible text.
 */
export async function clickButton(text: string): Promise<void> {
  const xpath = `//button[contains(., '${text}')]`
  const btn = await $(xpath)
  await btn.waitForClickable({ timeout: ELEMENT_TIMEOUT })
  await btn.click()
  await browser.pause(300)
}

/**
 * Count how many elements match a given CSS selector.
 */
export async function countElements(selector: string): Promise<number> {
  const elements = await $$(selector)
  return elements.length
}

/**
 * Get the page HTML inside #root for content assertions.
 */
export async function getRootHTML(): Promise<string> {
  const root = await $('#root')
  return root.getHTML()
}

// ── Interaction Helpers ─────────────────────────────────────────────────────

/**
 * Navigate to a hash route within the Electron app.
 * In Electron the renderer loads from file://, so browser.url('http://...')
 * doesn't work. This sets window.location.hash directly.
 */
export async function navigateToHash(hash: string): Promise<void> {
  await browser.execute((h) => {
    window.location.hash = h
  }, hash)
  await browser.pause(500)
}

/**
 * Read the aria-checked state of a toggle switch by its element id.
 * Returns true if aria-checked="true", false otherwise.
 */
export async function getToggleState(id: string): Promise<boolean> {
  const el = await $(`#${id}`)
  const checked = await el.getAttribute('aria-checked')
  return checked === 'true'
}

/**
 * Click a toggle switch by its element id and wait for state propagation.
 */
export async function clickToggle(id: string): Promise<void> {
  const el = await $(`#${id}`)
  await el.waitForClickable({ timeout: ELEMENT_TIMEOUT })
  await el.click()
  await browser.pause(300)
}

/**
 * Read an input element's current value via browser.execute.
 * WebdriverIO's getValue() can be unreliable with React controlled inputs.
 */
export async function getInputValue(selector: string): Promise<string> {
  return browser.execute((sel) => {
    const el = document.querySelector(sel) as HTMLInputElement | null
    return el?.value ?? ''
  }, selector)
}

/**
 * Set an input element's value and dispatch an 'input' event so React
 * picks up the change. Standard WebdriverIO setValue() doesn't always
 * trigger React's synthetic event system in Electron.
 */
export async function setInputValue(selector: string, value: string): Promise<void> {
  await browser.execute(
    (sel, val) => {
      const el = document.querySelector(sel) as HTMLInputElement | null
      if (!el) return
      // Use the native setter to bypass React's controlled input tracking
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )?.set ?? Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value',
      )?.set
      if (nativeSetter) {
        nativeSetter.call(el, val)
      } else {
        el.value = val
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    selector,
    value,
  )
  await browser.pause(200)
}

/**
 * Call an IPC channel directly from the renderer via window.electronAPI.invoke.
 * Returns the raw IPC response. Useful for verifying persistence and state.
 */
export async function invokeIPC(channel: string, args?: unknown): Promise<unknown> {
  return browser.execute(
    (ch, a) => {
      const api = (window as unknown as { electronAPI: { invoke: (c: string, a?: unknown) => Promise<unknown> } }).electronAPI
      return api.invoke(ch, a)
    },
    channel,
    args,
  )
}

/**
 * Wait for a CSS selector to exist in the DOM.
 */
export async function waitForSelector(selector: string, timeout = ELEMENT_TIMEOUT): Promise<void> {
  await browser.waitUntil(
    async () => {
      const el = await $(selector)
      return el.isExisting()
    },
    { timeout, timeoutMsg: `Selector "${selector}" did not appear within ${timeout}ms`, interval: 300 },
  )
}
