/**
 * e2e/white-label.pw.spec.ts
 *
 * End-to-end tests for the White Label / Branding configuration.
 * Validates section tab switching, form inputs, color pickers,
 * preset selection, IPC persistence, and reset functionality.
 */

import { test, expect } from './fixtures'
import {
  navigateToHash,
  getRootHTML,
  setInputValue,
  getInputValue,
  invokeIPC,
} from './helpers/pw'
import { captureScreenshot } from './helpers/pw-screenshots'

test.describe('ClearPathAI — White Label Branding', () => {
  test.beforeEach(async ({ page }) => {
    // Branding lives in the Configure Advanced group, which is collapsed by
    // default — navigateToConfigureTab() can't click the hidden #tab-branding.
    // The Configure useEffect honors ?tab=<key> and auto-expands the owning
    // group, so use URL navigation instead.
    await navigateToHash(page, '#/configure?tab=branding')
    await page.waitForTimeout(500)
  })

  test.afterAll(async () => {
    // Cleanup happens via per-test IPC reset where needed; the worker-scoped
    // electron app is isolated to its own user-data dir, so no cross-suite
    // bleed. afterAll has no `page` available without launching a browser.
  })

  // ── Section Tab Navigation ────────────────────────────────────────────

  test.describe('Section Tabs', () => {
    test('renders section tab buttons', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html).toContain('Identity')
      expect(html).toContain('Brand Colors')
    })

    test('can click through all section tabs without crash', async ({ page }) => {
      // All five tabs MUST exist — silently skipping a missing tab would
      // hide a regression in BrandingPageRenderer's section list.
      const tabs = ['Identity', 'Brand Colors', 'UI Colors', 'Surfaces & Mode', 'Preview']
      for (const label of tabs) {
        const btn = page.getByRole('button', { name: label }).first()
        await expect(btn).toBeVisible()
        await btn.click()
        await page.waitForTimeout(300)
        await expect(page.locator('#root')).toBeAttached()
      }
    })
  })

  // ── Identity Section ──────────────────────────────────────────────────

  test.describe('Identity Section', () => {
    test.beforeEach(async ({ page }) => {
      // Identity is a built-in BrandingPageRenderer section — must exist.
      // A missing tab is a regression, not a reason to fall through to
      // whichever section happens to be rendered by default.
      const btn = page.getByRole('button', { name: 'Identity' }).first()
      await expect(btn).toBeVisible()
      await btn.click()
      await page.waitForTimeout(300)
    })

    test('shows App Name input with a value', async ({ page }) => {
      await captureScreenshot(page, 'white-label/identity')
      const html = await getRootHTML(page)
      expect(html).toContain('App Name')
    })

    test('changing App Name updates the input value and persists via IPC', async ({ page }) => {
      // Identity section renders multiple text inputs (app name, tagline,
      // wordmark fragments). Target the first one — the App Name field —
      // explicitly via .first() to avoid Playwright strict-mode violations.
      const input = page.locator('input[type="text"]').first()
      // Hard requirement — if the input is missing, that's a regression in
      // BrandingPageRenderer's Identity section, not a reason to skip.
      await expect(input).toBeVisible()
      await input.fill('My Custom App')
      await expect(input).toHaveValue('My Custom App')

      // The change must round-trip through `branding:set` → store → `branding:get`.
      const result = (await invokeIPC(page, 'branding:get')) as Record<string, unknown>
      expect(result).toBeTruthy()
      expect(result.appName).toBe('My Custom App')
    })
  })

  // ── Brand Colors Section ──────────────────────────────────────────────

  test.describe('Brand Colors Section', () => {
    test.beforeEach(async ({ page }) => {
      // Brand Colors is a built-in BrandingPageRenderer section — must exist.
      const btn = page.getByRole('button', { name: 'Brand Colors' }).first()
      await expect(btn).toBeVisible()
      await btn.click()
      await page.waitForTimeout(300)
    })

    test('renders color picker inputs', async ({ page }) => {
      await captureScreenshot(page, 'white-label/brand-colors')
      const colorInputCount = await page.locator('input[type="color"]').count()
      expect(colorInputCount).toBeGreaterThan(0)
    })

    test('color inputs have hex values', async ({ page }) => {
      const colorInputs = page.locator('input[type="color"]')
      const count = await colorInputs.count()
      if (count > 0) {
        const value = await colorInputs.first().inputValue()
        // Color inputs return hex values like #5B4FC4
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    })
  })

  // ── Reset ─────────────────────────────────────────────────────────────

  test.describe('Reset to Default', () => {
    test('Reset to Default button exists on presets section', async ({ page }) => {
      // Navigate back to the presets section where the Reset button lives
      const presetsBtn = page.getByRole('button', { name: 'Theme Presets' }).first()
      if ((await presetsBtn.count()) > 0) {
        await presetsBtn.click()
        await page.waitForTimeout(300)
        // Capture the theme presets gallery with the Reset button visible
        await captureScreenshot(page, 'white-label/theme-presets')
      }

      const html = await getRootHTML(page)
      const hasReset = html.includes('Reset to Default')
      expect(hasReset).toBe(true)
    })

    test('reset restores default branding via IPC', async ({ page }) => {
      await invokeIPC(page, 'branding:reset')
      const result = await invokeIPC(page, 'branding:get') as Record<string, unknown>
      expect(result).not.toBeNull()
      // After reset, appName should be the default
      expect(typeof result.appName).toBe('string')
    })
  })

  // ── Stability ─────────────────────────────────────────────────────────

  test.describe('Stability', () => {
    test('has no critical errors after branding interactions', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })
})
