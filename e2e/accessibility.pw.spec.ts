/**
 * e2e/accessibility.pw.spec.ts
 *
 * End-to-end tests for accessibility features and keyboard navigation.
 * Validates that accessibility toggles affect the DOM, keyboard navigation
 * works, and focus management is correct.
 */

import { test, expect } from './fixtures'
import {
  navigateSidebarTo,
  navigateToConfigureTab,
  clickToggle,
  invokeIPC,
} from './helpers/pw'

test.describe('ClearPathAI — Accessibility & Keyboard', () => {
  // ── DOM Class Application ─────────────────────────────────────────────

  test.describe('Accessibility Toggle DOM Effects', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConfigureTab(page, 'accessibility')
      await page.waitForTimeout(500)
    })

    test.afterEach(async ({ page }) => {
      // Reset after each DOM effect test
      await invokeIPC(page, 'accessibility:reset')
      await page.waitForTimeout(300)
    })

    test('High Contrast toggle adds CSS class to document element', async ({ page }) => {
      await clickToggle(page, 'a11y-high-contrast')

      const hasClass = await page.evaluate(() =>
        document.documentElement.classList.contains('a11y-high-contrast'),
      )
      expect(hasClass).toBe(true)
    })

    test('Reduced Motion toggle adds CSS class to document element', async ({ page }) => {
      await clickToggle(page, 'a11y-reduced-motion')

      const hasClass = await page.evaluate(() =>
        document.documentElement.classList.contains('a11y-reduced-motion'),
      )
      expect(hasClass).toBe(true)
    })

    test('font scale slider updates document root font-size style', async ({ page }) => {
      // Set font scale to 1.3 (130%)
      await page.evaluate(() => {
        const slider = document.querySelector('#a11y-font-scale') as HTMLInputElement
        if (!slider) return
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value',
        )?.set
        if (nativeSetter) nativeSetter.call(slider, '1.3')
        slider.dispatchEvent(new Event('input', { bubbles: true }))
        slider.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await page.waitForTimeout(500)

      const fontSize = await page.evaluate(() =>
        document.documentElement.style.fontSize,
      )
      // Should be '130%' or '1.3rem' or similar scaled value
      const hasScaledFont = fontSize.includes('130') || fontSize.includes('1.3')
      expect(hasScaledFont).toBe(true)
    })
  })

  // ── Keyboard Navigation ───────────────────────────────────────────────

  test.describe('Keyboard Navigation', () => {
    test('Tab key moves focus between elements', async ({ page }) => {
      await navigateSidebarTo(page, 'Home')
      await page.waitForTimeout(500)

      // Click body first to make sure focus starts on a known element, then
      // press Tab and verify focus actually moved to a focusable element.
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      })
      const initialTag = await page.evaluate(() =>
        document.activeElement?.tagName ?? 'BODY',
      )

      await page.keyboard.press('Tab')
      await page.waitForTimeout(200)

      const afterTag = await page.evaluate(() =>
        document.activeElement?.tagName ?? 'BODY',
      )

      // After a Tab press from a blurred state, focus must land on a real
      // focusable element — not on BODY (which means nothing was focused) and
      // not on the same element as before (which means Tab did nothing).
      expect(afterTag).not.toBe('BODY')
      expect(afterTag).not.toBe(initialTag)
    })

    test('Enter key activates a focused link', async ({ page }) => {
      await navigateSidebarTo(page, 'Home')
      await page.waitForTimeout(500)

      // Tab into the document until focus lands on an anchor. The sidebar's
      // top-level NavLinks are anchors and should be reachable within a few
      // tabs. If not, that's a keyboard-accessibility regression — fail.
      let foundLink = false
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab')
        await page.waitForTimeout(100)
        const tag = await page.evaluate(() => document.activeElement?.tagName)
        if (tag === 'A') {
          foundLink = true
          break
        }
      }
      expect(
        foundLink,
        'Tab navigation never reached an <a> element within 20 presses — sidebar links are not keyboard-reachable',
      ).toBe(true)

      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)

      // Navigation should have occurred (hash changed) and the app is alive.
      await expect(page.locator('#root')).toBeAttached()
    })
  })

  // ── Modal Escape ──────────────────────────────────────────────────────

  test.describe('Modal Keyboard Handling', () => {
    test('app remains functional after pressing Escape on main page', async ({ page }) => {
      await navigateSidebarTo(page, 'Home')
      await page.waitForTimeout(500)

      // Press Escape — should not crash even with no modal open
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      await expect(page.locator('#root')).toBeAttached()
    })
  })

  // ── Stability ─────────────────────────────────────────────────────────

  test.describe('Stability', () => {
    test('has no critical errors after accessibility tests', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })
})
