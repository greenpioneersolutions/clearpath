/**
 * e2e/configure.pw.spec.ts
 *
 * End-to-end tests for the Configure page and all its tabs.
 * Validates that every configuration section renders, tab switching works,
 * and key UI elements are present and interactive.
 *
 * Note: tabs in the "Advanced" group (policies, workspaces, team, scheduler,
 * branding) are gated behind a collapsed group in the sidebar — the buttons
 * aren't even rendered when the group is collapsed. To reach those tabs we
 * use #/configure?tab=<key> URL navigation, which Configure.tsx reads on
 * mount and auto-expands the owning group.
 */

import { test, expect } from './fixtures'
import {
  navigateSidebarTo,
  navigateToHash,
  navigateToConfigureTab,
  isConfigureTabSelected,
  clickButton,
  getRootHTML,
  getToggleState,
  clickToggle,
  getInputValue,
  invokeIPC,
  ELEMENT_TIMEOUT,
} from './helpers/pw'
import { captureScreenshot } from './helpers/pw-screenshots'

// Tabs in the "Advanced" group — collapsed by default, buttons not in DOM.
// Reach them via URL deep link (?tab=key) which auto-expands the group.
const ADVANCED_TABS = new Set(['policies', 'workspaces', 'team', 'scheduler', 'branding'])

/** Navigate to a Configure tab — handles collapsed Advanced group. */
async function gotoConfigureTab(page: import('@playwright/test').Page, tabKey: string): Promise<void> {
  if (ADVANCED_TABS.has(tabKey)) {
    await navigateToHash(page, `#/configure?tab=${tabKey}`)
    await page.waitForTimeout(300)
  } else {
    await navigateToConfigureTab(page, tabKey)
  }
}

test.describe('ClearPathAI — Configure Page', () => {
  // ── Tab List Rendering ──────────────────────────────────────────────────

  test.describe('Tab Navigation', () => {
    test('navigates to Configure page from sidebar', async ({ page }) => {
      // PR #47: sidebar link to /configure is now labeled "Settings"
      await navigateSidebarTo(page, 'Settings')
      await expect(page.locator('#root')).toBeAttached()
    })

    test('renders the tab list with role="tablist"', async ({ page }) => {
      await navigateSidebarTo(page, 'Settings')
      const tablist = page.locator('[role="tablist"]')
      await expect(tablist).toBeAttached({ timeout: ELEMENT_TIMEOUT })
    })

    test('renders all expected tab buttons', async ({ page }) => {
      // PR #47: integrations/extensions moved to /connect; tools tab added.
      // Visible labels aligned to CLI vocabulary (keys unchanged):
      //   agents="Agents", skills="Skills", memory="Project Memory",
      //   settings="General", branding="Branding", tools="Tools & Permissions".
      // Advanced group is collapsed by default — expand it via URL navigation
      // so its tab buttons attach to the DOM.
      await navigateToHash(page, '#/configure?tab=branding')
      await page.waitForTimeout(500)

      const expectedTabs = [
        'Setup Wizard', 'Accessibility', 'General', 'Tools & Permissions',
        'Policies', 'Project Memory', 'Agents', 'Skills',
        'Session Wizard', 'Workspaces', 'Team Hub', 'Scheduler', 'Branding',
      ]

      for (const label of expectedTabs) {
        const tab = page.locator('button[role="tab"]').filter({ hasText: label }).first()
        await expect(tab).toBeAttached()
      }
    })

    test('has Settings tab selected by default', async ({ page }) => {
      // Configure component caches tab state internally — to assert the
      // initial default we have to unmount it first by routing away, then
      // navigate back via the sidebar (which uses /configure with no
      // ?tab= param, so the useState initializer's default of 'settings' wins).
      await navigateSidebarTo(page, 'Home')
      await page.waitForTimeout(300)
      await navigateSidebarTo(page, 'Settings')
      await page.waitForTimeout(300)
      const selected = await isConfigureTabSelected(page, 'settings')
      expect(selected).toBe(true)
    })

    test('switches tabs when clicked and updates aria-selected', async ({ page }) => {
      await gotoConfigureTab(page, 'policies')
      expect(await isConfigureTabSelected(page, 'policies')).toBe(true)
      expect(await isConfigureTabSelected(page, 'settings')).toBe(false)
    })
  })

  // ── Individual Tab Content ──────────────────────────────────────────────

  test.describe('Settings Tab', () => {
    test('renders settings content', async ({ page }) => {
      await gotoConfigureTab(page, 'settings')
      const html = await getRootHTML(page)
      // Settings tab should have substantial content
      expect(html.length).toBeGreaterThan(500)
    })

    test('has no critical errors', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })

  // Integrations and Extensions tabs were moved to /connect in PR #47.
  // Their tests now live in e2e/integrations.spec.ts and e2e/extensions.spec.ts
  // (which navigate via navigateToConnectTab).

  test.describe('Tools & Permissions Tab', () => {
    test('renders the Tools tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'tools')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('Policies Tab', () => {
    test('renders the Policies tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'policies')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('Memory Tab', () => {
    test('renders the Memory tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'memory')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('Agents Tab', () => {
    test('renders the Agents tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'agents')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('Skills Tab', () => {
    test('renders the Skills tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'skills')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('Workspaces Tab', () => {
    test('renders the Workspaces tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'workspaces')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('Team Hub Tab', () => {
    test('renders the Team Hub tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'team')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('Scheduler Tab', () => {
    test('renders the Scheduler tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'scheduler')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('White Label Tab', () => {
    test('renders the White Label tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'branding')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('Accessibility Tab', () => {
    test('renders the Accessibility tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'accessibility')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('Setup Wizard Tab', () => {
    test('renders the Setup Wizard tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'setup')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  test.describe('Session Wizard Tab', () => {
    test('renders the Session Wizard tab content', async ({ page }) => {
      await gotoConfigureTab(page, 'wizard')
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })
  })

  // ── Accessibility Interactions ──────────────────────────────────────────

  test.describe('Accessibility Interactions', () => {
    test.beforeEach(async ({ page }) => {
      await gotoConfigureTab(page, 'accessibility')
    })

    test.afterEach(async ({ page }) => {
      // Always reset accessibility settings after each test
      await invokeIPC(page, 'accessibility:reset')
    })

    test('font scale slider exists with default near 1.0', async ({ page }) => {
      const value = await getInputValue(page, '#a11y-font-scale')
      const num = parseFloat(value)
      expect(num).toBeGreaterThanOrEqual(0.85)
      expect(num).toBeLessThanOrEqual(1.5)
    })

    test('changing font scale slider updates the percentage label', async ({ page }) => {
      // Set slider to 1.2 (120%) via React's native value setter so the
      // controlled component fires onChange.
      await page.evaluate(() => {
        const slider = document.querySelector('#a11y-font-scale') as HTMLInputElement
        if (!slider) return
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value',
        )?.set
        if (nativeSetter) nativeSetter.call(slider, '1.2')
        slider.dispatchEvent(new Event('input', { bubbles: true }))
        slider.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await page.waitForTimeout(300)

      // Capture font-scale state (label now shows 120%)
      await captureScreenshot(page, 'configure/accessibility-font-scale-120')

      // The label should show 120%
      const html = await getRootHTML(page)
      expect(html).toContain('120%')
    })

    test('font scale change persists via IPC', async ({ page }) => {
      // Drive the slider via two distinct values so React's onChange fires
      // even if a previous test left state at our target. Reading the slider
      // first via inputValue is unreliable because the React state is
      // independent of the main-process store — afterEach's
      // `accessibility:reset` only clears main, not the in-memory provider.
      await page.evaluate(() => {
        const slider = document.querySelector('#a11y-font-scale') as HTMLInputElement
        if (!slider) return
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value',
        )?.set
        // Bounce off a different value first to guarantee a state change.
        if (nativeSetter) nativeSetter.call(slider, '1.0')
        slider.dispatchEvent(new Event('input', { bubbles: true }))
        slider.dispatchEvent(new Event('change', { bubbles: true }))
        if (nativeSetter) nativeSetter.call(slider, '1.2')
        slider.dispatchEvent(new Event('input', { bubbles: true }))
        slider.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await page.waitForTimeout(400)

      const result = await invokeIPC(page, 'accessibility:get') as Record<string, unknown>
      expect(result.fontScale).toBe(1.2)
    })

    test('Reduced Motion toggle has boolean aria-checked state', async ({ page }) => {
      const state = await getToggleState(page, 'a11y-reduced-motion')
      expect(typeof state).toBe('boolean')
    })

    test('clicking Reduced Motion toggle flips its state', async ({ page }) => {
      const initial = await getToggleState(page, 'a11y-reduced-motion')
      await clickToggle(page, 'a11y-reduced-motion')
      const after = await getToggleState(page, 'a11y-reduced-motion')
      expect(after).toBe(!initial)
    })

    test('High Contrast toggle click changes state and persists via IPC', async ({ page }) => {
      const initial = await getToggleState(page, 'a11y-high-contrast')
      await clickToggle(page, 'a11y-high-contrast')
      const after = await getToggleState(page, 'a11y-high-contrast')
      expect(after).toBe(!initial)

      // Capture high-contrast toggled-on state
      await captureScreenshot(page, 'configure/accessibility-high-contrast-on')

      // Verify IPC persistence
      const result = await invokeIPC(page, 'accessibility:get') as Record<string, unknown>
      expect(result.highContrast).toBe(after)
    })

    test('Screen Reader Mode toggle flips state', async ({ page }) => {
      const initial = await getToggleState(page, 'a11y-sr-mode')
      await clickToggle(page, 'a11y-sr-mode')
      const after = await getToggleState(page, 'a11y-sr-mode')
      expect(after).toBe(!initial)
    })

    test('focus indicator radio group has 3 options', async ({ page }) => {
      const radioCount = await page.locator('[role="radiogroup"] [role="radio"]').count()
      expect(radioCount).toBe(3)
    })

    test('clicking a focus radio button updates aria-checked', async ({ page }) => {
      const radios = page.locator('[role="radiogroup"] [role="radio"]')
      // Click the second radio (index 1)
      await radios.nth(1).click()
      await page.waitForTimeout(300)

      const checked = await radios.nth(1).getAttribute('aria-checked')
      expect(checked).toBe('true')

      // The first should no longer be checked
      const firstChecked = await radios.nth(0).getAttribute('aria-checked')
      expect(firstChecked).toBe('false')
    })

    test('Reset to Defaults button resets all toggles and IPC state', async ({ page }) => {
      // Flip a toggle
      await clickToggle(page, 'a11y-high-contrast')

      // Click Reset to Defaults
      await clickButton(page, 'Reset')
      await page.waitForTimeout(500)

      // Capture post-reset state (all controls back to defaults)
      await captureScreenshot(page, 'configure/accessibility-after-reset')

      // Verify IPC state is reset
      const result = await invokeIPC(page, 'accessibility:get') as Record<string, unknown>
      expect(result.highContrast).toBe(false)
      expect(result.fontScale).toBe(1)
    })
  })

  // ── Cross-Tab Navigation Stability ─────────────────────────────────────

  test.describe('Tab Round-Trip Stability', () => {
    test('cycles through all tabs without crashing or console errors', async ({ page, consoleErrors }) => {
      // PR #47: integrations/extensions removed; tools added.
      const tabs = [
        'settings', 'tools', 'policies',
        'memory', 'agents', 'skills', 'workspaces',
        'team', 'scheduler', 'branding', 'setup',
        'accessibility', 'wizard',
      ]

      for (const tabKey of tabs) {
        await gotoConfigureTab(page, tabKey)
        const root = page.locator('#root')
        await expect(root).toBeAttached()
        const html = await root.innerHTML()
        expect(html.length).toBeGreaterThan(100)
      }

      // The cycle interactions happen inside this test body so consoleErrors
      // (test-scoped) actually covers them.
      expect(consoleErrors).toEqual([])
    })
  })
})
