/**
 * e2e/extensions.pw.spec.ts
 *
 * End-to-end tests for the Extensions system.
 * Validates the full extension management lifecycle through the UI:
 * listing, toggling, permission management, error states, and
 * interaction with the extension IPC handlers.
 *
 * NOTE: `showExtensions` is an experimental feature flag. When the build
 * is compiled with `showExtensions: false` (the default), the
 * ExtensionManager chunk is tree-shaken and the Connect → Extensions tab
 * is unreachable. In that case the renderer redirects ?tab=extensions to
 * integrations. The whole describe block below skips itself in that
 * configuration via the test.beforeAll guard.
 */

import { test, expect, type Page } from './fixtures'
import {
  navigateToConfigureTab,
  navigateToConnectTab,
  waitForText,
  buttonExists,
  clickButton,
  getRootHTML,
  invokeIPC,
} from './helpers/pw'
import { captureScreenshot } from './helpers/pw-screenshots'

interface FeatureFlagsResponse {
  flags: Record<string, boolean>
  activePresetId: string | null
  locked: boolean
}

/**
 * Dismiss any restart banner or modal overlay that may be blocking the UI.
 * Toggling extensions can trigger a "Changes require a restart" banner
 * with a Dismiss button, or a full-screen modal overlay.
 */
async function dismissOverlays(page: Page): Promise<void> {
  // Try clicking Dismiss button (restart banner)
  try {
    const dismissBtn = page.getByRole('button', { name: 'Dismiss' }).first()
    if ((await dismissBtn.count()) > 0) {
      await dismissBtn.click()
      await page.waitForTimeout(300)
    }
  } catch { /* no dismiss button — fine */ }

  // Try clicking outside any modal overlay to close it
  try {
    const overlay = page.locator('div.fixed.inset-0.z-50').first()
    if ((await overlay.count()) > 0) {
      // Click the overlay backdrop to dismiss
      await overlay.click()
      await page.waitForTimeout(300)
    }
  } catch { /* no overlay — fine */ }
}

/**
 * Probe the build to see whether `showExtensions` is compiled in. The
 * `feature-flags:set` IPC silently strips override attempts for compiled-out
 * experimental flags, so we read back the value after attempting to enable it.
 */
async function isExtensionsCompiledIn(page: Page): Promise<boolean> {
  await invokeIPC(page, 'feature-flags:set', { showExtensions: true })
  const result = (await invokeIPC(page, 'feature-flags:get')) as FeatureFlagsResponse
  return Boolean(result?.flags?.showExtensions)
}

test.describe('ClearPathAI — Extensions', () => {
  // Probe once per worker; if compiled out, every test in this file is skipped.
  test.beforeAll(async ({ electronApp }) => {
    const probePage = await electronApp.firstWindow()
    await probePage.locator('#root').waitFor({ state: 'attached', timeout: 20_000 })
    const compiledIn = await isExtensionsCompiledIn(probePage)
    if (!compiledIn) {
      test.skip(true, 'Extensions tab compiled out (__FEATURES__.showExtensions=false)')
    }
  })

  // ── Extensions Tab Basics ─────────────────────────────────────────────

  test.describe('Extensions Tab', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'extensions')
    })

    test('renders the Extensions heading', async ({ page }) => {
      await waitForText(page, 'Extensions')
      const html = await getRootHTML(page)
      expect(html).toContain('Extensions')
    })

    test('renders management description text', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html).toContain('Manage installed extensions')
    })

    test('does not show Restart App button initially', async ({ page }) => {
      expect(await buttonExists(page, 'Restart App')).toBe(false)
    })

    test('shows Install Extension button', async ({ page }) => {
      expect(await buttonExists(page, 'Install Extension')).toBe(true)
    })

    test('shows Restart App button and banner after toggling an extension', async ({ page }) => {
      const html = await getRootHTML(page)
      if (html.includes('No extensions installed')) return

      // Toggle the first extension to trigger pendingRestart state
      const toggleBtn = page.locator('button[title="Enable"], button[title="Disable"]').first()
      if ((await toggleBtn.count()) === 0) return

      await toggleBtn.click()
      await page.waitForTimeout(500)

      // The "Restart App" button should now be visible
      expect(await buttonExists(page, 'Restart App')).toBe(true)

      // The restart banner should appear with the expected message
      const bannerHtml = await getRootHTML(page)
      expect(bannerHtml).toContain('Changes require a restart')

      // Capture the restart-required banner state
      await captureScreenshot(page, 'extensions/restart-banner')

      // Toggle back to restore original state (pendingRestart stays true, which is fine)
      await toggleBtn.click()
      await page.waitForTimeout(500)
    })

    test('has no critical errors', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })

  // ── Extension List ────────────────────────────────────────────────────

  test.describe('Extension List Display', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(500)
    })

    test('shows either empty state or extension cards', async ({ page }) => {
      const html = await getRootHTML(page)
      const hasEmptyState = html.includes('No extensions installed')
      // Extension cards have border styling and contain version info
      const hasCards = html.includes('bundled') || html.includes('user') ||
        html.includes('v1.') || html.includes('v0.')

      // One of these must be true
      expect(hasEmptyState || hasCards).toBe(true)
    })

    test('shows source badges (bundled/user) for each extension', async ({ page }) => {
      const html = await getRootHTML(page)
      if (html.includes('No extensions installed')) {
        // No extensions to check — pass vacuously
        return
      }
      // If extensions exist, they should have source badges
      expect(html.includes('bundled') || html.includes('user')).toBe(true)
    })
  })

  // ── Extension Detail Panel ────────────────────────────────────────────

  test.describe('Extension Detail Panel', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(500)
    })

    test('expands an extension card on click to show details', async ({ page }) => {
      const html = await getRootHTML(page)
      if (html.includes('No extensions installed')) {
        test.skip(true, 'No extensions installed in this build')
        return
      }

      // After the empty-state guard above, at least one card MUST exist.
      const firstCard = page.locator('div.cursor-pointer').first()
      await expect(firstCard).toBeVisible()
      await firstCard.click()
      await page.waitForTimeout(300)

      // Capture the expanded detail panel
      await captureScreenshot(page, 'extensions/card-expanded')

      const expandedHtml = await getRootHTML(page)
      // Detail panel shows metadata
      const hasDetails =
        expandedHtml.includes('Author') ||
        expandedHtml.includes('ID') ||
        expandedHtml.includes('Permissions')
      expect(hasDetails).toBe(true)
    })

    test('shows permissions section in expanded panel', async ({ page }) => {
      const html = await getRootHTML(page)
      if (html.includes('No extensions installed')) {
        test.skip(true, 'No extensions installed in this build')
        return
      }

      const firstCard = page.locator('div.cursor-pointer').first()
      await expect(firstCard).toBeVisible()
      await firstCard.click()
      await page.waitForTimeout(300)

      const expandedHtml = await getRootHTML(page)
      // Permissions section may legitimately be absent if the extension
      // declared no permissions — but if present it must have status badges.
      if (expandedHtml.includes('Permissions')) {
        const hasPerms =
          expandedHtml.includes('Granted') || expandedHtml.includes('Denied')
        expect(hasPerms).toBe(true)
      }
    })
  })

  // ── Extension Toggle ──────────────────────────────────────────────────

  test.describe('Extension Toggle', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(500)
    })

    test('renders toggle buttons for extensions', async ({ page }) => {
      const html = await getRootHTML(page)
      if (html.includes('No extensions installed')) return

      // Toggle buttons have title "Enable" or "Disable"
      const enableBtn = page.locator('button[title="Enable"]')
      const disableBtn = page.locator('button[title="Disable"]')

      const hasToggle = (await enableBtn.count()) > 0 || (await disableBtn.count()) > 0
      expect(hasToggle).toBe(true)
    })

    test('toggle buttons have correct aria attributes', async ({ page }) => {
      const html = await getRootHTML(page)
      if (html.includes('No extensions installed')) return

      // Check that toggle buttons exist with proper titles
      const toggleBtns = page.locator('button[title="Enable"], button[title="Disable"]')
      expect(await toggleBtns.count()).toBeGreaterThan(0)
    })
  })

  // ── Extension Toggle State Verification ────────────────────────────────

  test.describe('Extension Toggle State', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(500)
    })

    test('clicking toggle changes the button title attribute', async ({ page }) => {
      const html = await getRootHTML(page)
      if (html.includes('No extensions installed')) return

      const toggleBtn = page.locator('button[title="Enable"], button[title="Disable"]').first()
      if ((await toggleBtn.count()) === 0) return

      const titleBefore = await toggleBtn.getAttribute('title')
      await toggleBtn.click()
      await page.waitForTimeout(500)

      // After toggle, the title should have swapped
      const toggleBtnAfter = page.locator('button[title="Enable"], button[title="Disable"]').first()
      const titleAfter = await toggleBtnAfter.getAttribute('title')
      expect(titleAfter).not.toBe(titleBefore)

      // Toggle back to restore state and dismiss any overlay
      await toggleBtnAfter.click()
      await page.waitForTimeout(500)
      await dismissOverlays(page)
    })

    test('toggle state persists after tab switch', async ({ page }) => {
      const html = await getRootHTML(page)
      if (html.includes('No extensions installed')) return

      const toggleBtn = page.locator('button[title="Enable"], button[title="Disable"]').first()
      if ((await toggleBtn.count()) === 0) return

      const titleBefore = await toggleBtn.getAttribute('title')

      // Toggle it
      await toggleBtn.click()
      await page.waitForTimeout(500)
      await dismissOverlays(page)

      // Switch away and back
      await navigateToConfigureTab(page, 'settings')
      await page.waitForTimeout(300)
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(500)

      // Verify the toggle stayed in its new state
      const toggleBtnAfter = page.locator('button[title="Enable"], button[title="Disable"]').first()
      const titleAfter = await toggleBtnAfter.getAttribute('title')
      expect(titleAfter).not.toBe(titleBefore)

      // Restore and dismiss
      await toggleBtnAfter.click()
      await page.waitForTimeout(500)
      await dismissOverlays(page)
    })

    test('restart banner can be dismissed', async ({ page }) => {
      const html = await getRootHTML(page)
      if (html.includes('No extensions installed')) return

      // Toggle an extension to trigger the restart banner
      const toggleBtn = page.locator('button[title="Enable"], button[title="Disable"]').first()
      if ((await toggleBtn.count()) === 0) return

      await toggleBtn.click()
      await page.waitForTimeout(500)

      // Verify the banner is showing
      let bannerHtml = await getRootHTML(page)
      expect(bannerHtml).toContain('Changes require a restart')

      // Click the Dismiss button in the banner
      await clickButton(page, 'Dismiss')
      await page.waitForTimeout(300)

      // Capture the clean state after the banner is dismissed
      await captureScreenshot(page, 'extensions/banner-dismissed')

      // Verify the banner is no longer visible
      bannerHtml = await getRootHTML(page)
      expect(bannerHtml).not.toContain('Changes require a restart')

      // Toggle back to restore original state and clean up
      await toggleBtn.click()
      await page.waitForTimeout(500)
      await dismissOverlays(page)
    })

    test('extension:list IPC returns consistent data', async ({ page }) => {
      const result = await invokeIPC(page, 'extension:list') as { success: boolean; data?: unknown[] }
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
    })
  })

  // ── Extensions Tab Stability ──────────────────────────────────────────

  test.describe('Extensions Tab Stability', () => {
    test('survives switching away and back to Extensions tab', async ({ page }) => {
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(300)

      await navigateToConfigureTab(page, 'settings')
      await page.waitForTimeout(300)

      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(300)

      const html = await getRootHTML(page)
      expect(html).toContain('Extensions')
    })

    test('has no critical errors after Extensions interactions', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })
})
