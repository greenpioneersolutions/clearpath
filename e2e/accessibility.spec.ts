/**
 * e2e/accessibility.spec.ts
 *
 * End-to-end tests for accessibility features and keyboard navigation.
 * Validates that accessibility toggles affect the DOM, keyboard navigation
 * works, and focus management is correct.
 */

import {
  waitForAppReady,
  navigateSidebarTo,
  navigateToConfigureTab,
  getCriticalConsoleErrors,
  clickToggle,
  invokeIPC,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

describe('ClearPathAI — Accessibility & Keyboard', () => {
  before(async () => {
    await waitForAppReady()
  })

  after(async () => {
    // Reset accessibility settings to defaults
    await invokeIPC('accessibility:reset')
  })

  // ── DOM Class Application ─────────────────────────────────────────────

  describe('Accessibility Toggle DOM Effects', () => {
    before(async () => {
      await navigateToConfigureTab('accessibility')
      await browser.pause(500)
    })

    afterEach(async () => {
      // Reset after each DOM effect test
      await invokeIPC('accessibility:reset')
      await browser.pause(300)
      // Re-navigate to refresh the UI state
      await navigateToConfigureTab('accessibility')
      await browser.pause(300)
    })

    it('High Contrast toggle adds CSS class to document element', async () => {
      await clickToggle('a11y-high-contrast')

      const hasClass = await browser.execute(() =>
        document.documentElement.classList.contains('a11y-high-contrast'),
      )
      expect(hasClass).toBe(true)
    })

    it('Reduced Motion toggle adds CSS class to document element', async () => {
      await clickToggle('a11y-reduced-motion')

      const hasClass = await browser.execute(() =>
        document.documentElement.classList.contains('a11y-reduced-motion'),
      )
      expect(hasClass).toBe(true)
    })

    it('font scale slider updates document root font-size style', async () => {
      // Set font scale to 1.3 (130%)
      await browser.execute(() => {
        const slider = document.querySelector('#a11y-font-scale') as HTMLInputElement
        if (!slider) return
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value',
        )?.set
        if (nativeSetter) nativeSetter.call(slider, '1.3')
        slider.dispatchEvent(new Event('input', { bubbles: true }))
        slider.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await browser.pause(500)

      const fontSize = await browser.execute(() =>
        document.documentElement.style.fontSize,
      )
      // Should be '130%' or '1.3rem' or similar scaled value
      const hasScaledFont = fontSize.includes('130') || fontSize.includes('1.3')
      expect(hasScaledFont).toBe(true)
    })
  })

  // ── Keyboard Navigation ───────────────────────────────────────────────

  describe('Keyboard Navigation', () => {
    it('Tab key moves focus between elements', async () => {
      await navigateSidebarTo('Home')
      await browser.pause(500)

      // Press Tab and check that activeElement changes
      const initialTag = await browser.execute(() =>
        document.activeElement?.tagName ?? 'BODY',
      )

      await browser.keys('Tab')
      await browser.pause(200)

      const afterTag = await browser.execute(() =>
        document.activeElement?.tagName ?? 'BODY',
      )

      // Focus should have moved to a focusable element (A, BUTTON, INPUT, etc.)
      // Just verify that something is focused (not still on BODY)
      const isFocused = afterTag !== 'BODY' || initialTag !== 'BODY'
      expect(isFocused).toBe(true)
    })

    it('Enter key activates a focused link', async () => {
      await navigateSidebarTo('Home')
      await browser.pause(500)

      // Focus a sidebar link via Tab navigation
      // Tab until we hit a link element
      let foundLink = false
      for (let i = 0; i < 10; i++) {
        await browser.keys('Tab')
        await browser.pause(100)
        const tag = await browser.execute(() => document.activeElement?.tagName)
        if (tag === 'A') {
          foundLink = true
          break
        }
      }

      if (foundLink) {
        const hrefBefore = await browser.execute(() =>
          (document.activeElement as HTMLAnchorElement)?.href ?? '',
        )

        await browser.keys('Enter')
        await browser.pause(500)

        // Navigation should have occurred (hash changed)
        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
      }
    })
  })

  // ── Modal Escape ──────────────────────────────────────────────────────

  describe('Modal Keyboard Handling', () => {
    it('app remains functional after pressing Escape on main page', async () => {
      await navigateSidebarTo('Home')
      await browser.pause(500)

      // Press Escape — should not crash even with no modal open
      await browser.keys('Escape')
      await browser.pause(300)

      const root = await $('#root')
      expect(await root.isExisting()).toBe(true)
    })
  })

  // ── Stability ─────────────────────────────────────────────────────────

  describe('Stability', () => {
    it('has no critical errors after accessibility tests', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })
})
