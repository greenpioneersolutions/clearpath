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
 * route labels defined in Sidebar.tsx: Home, Work, Insights, Configure, Learn.
 *
 * Note: "Configure" is pinned to the bottom of the sidebar in a <div>
 * outside the main <nav> element, so we search the entire <aside> for
 * any anchor containing the label text.
 *
 * Uses XPath text matching since WebdriverIO's `=` text-selector syntax
 * is not reliably translated in Electron's Chromedriver context.
 */
export async function navigateSidebarTo(label: string): Promise<void> {
  // Search the entire sidebar aside (not just nav) to handle Configure which is
  // rendered in a div pinned to the bottom, outside the primary <nav>
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
