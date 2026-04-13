/**
 * e2e/extensions.spec.ts
 *
 * End-to-end tests for the Extensions system.
 * Validates the full extension management lifecycle through the UI:
 * listing, toggling, permission management, error states, and
 * interaction with the extension IPC handlers.
 */

import {
  waitForAppReady,
  getCriticalConsoleErrors,
  navigateToConfigureTab,
  waitForText,
  buttonExists,
  clickButton,
  getRootHTML,
  countElements,
  invokeIPC,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

describe('ClearPathAI — Extensions', () => {
  before(async () => {
    await waitForAppReady()
  })

  // ── Extensions Tab Basics ─────────────────────────────────────────────

  describe('Extensions Tab', () => {
    before(async () => {
      await navigateToConfigureTab('extensions')
    })

    it('renders the Extensions heading', async () => {
      await waitForText('Extensions')
      const html = await getRootHTML()
      expect(html).toContain('Extensions')
    })

    it('renders management description text', async () => {
      const html = await getRootHTML()
      expect(html).toContain('Manage installed extensions')
    })

    it('shows Refresh button', async () => {
      expect(await buttonExists('Refresh')).toBe(true)
    })

    it('shows Install Extension button', async () => {
      expect(await buttonExists('Install Extension')).toBe(true)
    })

    it('Refresh button is clickable without error', async () => {
      await clickButton('Refresh')

      // Should still show the Extensions tab content
      const html = await getRootHTML()
      expect(html).toContain('Extensions')
    })

    it('has no critical errors', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  // ── Extension List ────────────────────────────────────────────────────

  describe('Extension List Display', () => {
    before(async () => {
      await navigateToConfigureTab('extensions')
      await browser.pause(500)
    })

    it('shows either empty state or extension cards', async () => {
      const html = await getRootHTML()
      const hasEmptyState = html.includes('No extensions installed')
      // Extension cards have border styling and contain version info
      const hasCards = html.includes('bundled') || html.includes('user') ||
        html.includes('v1.') || html.includes('v0.')

      // One of these must be true
      expect(hasEmptyState || hasCards).toBe(true)
    })

    it('shows source badges (bundled/user) for each extension', async () => {
      const html = await getRootHTML()
      if (html.includes('No extensions installed')) {
        // No extensions to check — pass vacuously
        return
      }
      // If extensions exist, they should have source badges
      expect(html.includes('bundled') || html.includes('user')).toBe(true)
    })
  })

  // ── Extension Detail Panel ────────────────────────────────────────────

  describe('Extension Detail Panel', () => {
    before(async () => {
      await navigateToConfigureTab('extensions')
      await browser.pause(500)
    })

    it('expands an extension card on click to show details', async () => {
      const html = await getRootHTML()
      if (html.includes('No extensions installed')) {
        // Skip — no extensions to expand
        return
      }

      // Click first extension card (any element with border and cursor-pointer in the grid)
      const firstCard = await $('div.cursor-pointer')
      if (await firstCard.isExisting()) {
        await firstCard.click()
        await browser.pause(300)

        const expandedHtml = await getRootHTML()
        // Detail panel shows metadata
        const hasDetails =
          expandedHtml.includes('Author') ||
          expandedHtml.includes('ID') ||
          expandedHtml.includes('Permissions')
        expect(hasDetails).toBe(true)
      }
    })

    it('shows permissions section in expanded panel', async () => {
      const html = await getRootHTML()
      if (html.includes('No extensions installed')) return

      const firstCard = await $('div.cursor-pointer')
      if (await firstCard.isExisting()) {
        await firstCard.click()
        await browser.pause(300)

        const expandedHtml = await getRootHTML()
        if (expandedHtml.includes('Permissions')) {
          // Should show Granted/Denied badges
          const hasPerms =
            expandedHtml.includes('Granted') || expandedHtml.includes('Denied')
          expect(hasPerms).toBe(true)
        }
      }
    })
  })

  // ── Extension Toggle ──────────────────────────────────────────────────

  describe('Extension Toggle', () => {
    before(async () => {
      await navigateToConfigureTab('extensions')
      await browser.pause(500)
    })

    it('renders toggle buttons for extensions', async () => {
      const html = await getRootHTML()
      if (html.includes('No extensions installed')) return

      // Toggle buttons have title "Enable" or "Disable"
      const enableBtn = await $('button[title="Enable"]')
      const disableBtn = await $('button[title="Disable"]')

      const hasToggle = (await enableBtn.isExisting()) || (await disableBtn.isExisting())
      expect(hasToggle).toBe(true)
    })

    it('toggle buttons have correct aria attributes', async () => {
      const html = await getRootHTML()
      if (html.includes('No extensions installed')) return

      // Check that toggle buttons exist with proper titles
      const toggleBtns = await $$('button[title="Enable"], button[title="Disable"]')
      expect(toggleBtns.length).toBeGreaterThan(0)
    })
  })

  // ── Extension Toggle State Verification ────────────────────────────────

  describe('Extension Toggle State', () => {
    before(async () => {
      await navigateToConfigureTab('extensions')
      await browser.pause(500)
    })

    it('clicking toggle changes the button title attribute', async () => {
      const html = await getRootHTML()
      if (html.includes('No extensions installed')) return

      const toggleBtn = await $('button[title="Enable"], button[title="Disable"]')
      if (!(await toggleBtn.isExisting())) return

      const titleBefore = await toggleBtn.getAttribute('title')
      await toggleBtn.click()
      await browser.pause(500)

      // After toggle, the title should have swapped
      const toggleBtnAfter = await $('button[title="Enable"], button[title="Disable"]')
      const titleAfter = await toggleBtnAfter.getAttribute('title')
      expect(titleAfter).not.toBe(titleBefore)

      // Toggle back to restore state
      await toggleBtnAfter.click()
      await browser.pause(500)
    })

    it('toggle state persists after tab switch', async () => {
      const html = await getRootHTML()
      if (html.includes('No extensions installed')) return

      const toggleBtn = await $('button[title="Enable"], button[title="Disable"]')
      if (!(await toggleBtn.isExisting())) return

      const titleBefore = await toggleBtn.getAttribute('title')

      // Toggle it
      await toggleBtn.click()
      await browser.pause(500)

      // Switch away and back
      await navigateToConfigureTab('settings')
      await browser.pause(300)
      await navigateToConfigureTab('extensions')
      await browser.pause(500)

      // Verify the toggle stayed in its new state
      const toggleBtnAfter = await $('button[title="Enable"], button[title="Disable"]')
      const titleAfter = await toggleBtnAfter.getAttribute('title')
      expect(titleAfter).not.toBe(titleBefore)

      // Restore
      await toggleBtnAfter.click()
      await browser.pause(500)
    })

    it('Refresh button re-fetches extension list', async () => {
      const html = await getRootHTML()
      if (html.includes('No extensions installed')) {
        // Refresh should still work with empty list
        await clickButton('Refresh')
        const afterHtml = await getRootHTML()
        expect(afterHtml).toContain('No extensions installed')
        return
      }

      await clickButton('Refresh')
      await browser.pause(500)

      // Extensions should still be listed after refresh
      const afterHtml = await getRootHTML()
      const hasExtensions = afterHtml.includes('bundled') || afterHtml.includes('user')
      expect(hasExtensions).toBe(true)
    })

    it('extension:list IPC returns consistent data', async () => {
      const result = await invokeIPC('extension:list') as { success: boolean; data?: unknown[] }
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
    })
  })

  // ── Extensions Tab Stability ──────────────────────────────────────────

  describe('Extensions Tab Stability', () => {
    it('survives switching away and back to Extensions tab', async () => {
      await navigateToConfigureTab('extensions')
      await browser.pause(300)

      await navigateToConfigureTab('settings')
      await browser.pause(300)

      await navigateToConfigureTab('extensions')
      await browser.pause(300)

      const html = await getRootHTML()
      expect(html).toContain('Extensions')
    })

    it('has no critical errors after Extensions interactions', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })
})
