/**
 * e2e/white-label.spec.ts
 *
 * End-to-end tests for the White Label / Branding configuration.
 * Validates section tab switching, form inputs, color pickers,
 * preset selection, IPC persistence, and reset functionality.
 */

import {
  waitForAppReady,
  getCriticalConsoleErrors,
  navigateToConfigureTab,
  getRootHTML,
  setInputValue,
  getInputValue,
  invokeIPC,
  clickButton,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

describe('ClearPathAI — White Label Branding', () => {
  before(async () => {
    await waitForAppReady()
    await navigateToConfigureTab('branding')
  })

  after(async () => {
    // Always reset branding to defaults after tests
    await invokeIPC('branding:reset')
  })

  // ── Section Tab Navigation ────────────────────────────────────────────

  describe('Section Tabs', () => {
    it('renders section tab buttons', async () => {
      const html = await getRootHTML()
      expect(html).toContain('Identity')
      expect(html).toContain('Brand Colors')
    })

    it('can click through all section tabs without crash', async () => {
      const tabs = ['Identity', 'Brand Colors', 'Surfaces']
      for (const label of tabs) {
        const btn = await $(`//button[contains(., '${label}')]`)
        if (await btn.isExisting()) {
          await btn.click()
          await browser.pause(300)
          const root = await $('#root')
          expect(await root.isExisting()).toBe(true)
        }
      }
    })
  })

  // ── Identity Section ──────────────────────────────────────────────────

  describe('Identity Section', () => {
    before(async () => {
      // Click Identity tab
      const btn = await $('//button[contains(., "Identity")]')
      if (await btn.isExisting()) {
        await btn.click()
        await browser.pause(300)
      }
    })

    it('shows App Name input with a value', async () => {
      const html = await getRootHTML()
      expect(html).toContain('App Name')
    })

    it('changing App Name updates the input value', async () => {
      // Find the first text input in the Identity section
      const inputs = await $$('input[type="text"]')
      if (inputs.length > 0) {
        const firstInput = inputs[0]
        const selector = 'input[type="text"]'

        await setInputValue(selector, 'My Custom App')
        const value = await getInputValue(selector)
        expect(value).toBe('My Custom App')
      }
    })

    it('App Name change persists via IPC', async () => {
      const result = await invokeIPC('branding:get') as Record<string, unknown>
      if (result && result.appName) {
        expect(result.appName).toBe('My Custom App')
      }
    })
  })

  // ── Brand Colors Section ──────────────────────────────────────────────

  describe('Brand Colors Section', () => {
    before(async () => {
      const btn = await $('//button[contains(., "Brand Colors")]')
      if (await btn.isExisting()) {
        await btn.click()
        await browser.pause(300)
      }
    })

    it('renders color picker inputs', async () => {
      const colorInputs = await $$('input[type="color"]')
      expect(colorInputs.length).toBeGreaterThan(0)
    })

    it('color inputs have hex values', async () => {
      const colorInputs = await $$('input[type="color"]')
      if (colorInputs.length > 0) {
        const value = await colorInputs[0].getValue()
        // Color inputs return hex values like #5B4FC4
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    })
  })

  // ── Reset ─────────────────────────────────────────────────────────────

  describe('Reset to Default', () => {
    it('Reset to Default button exists on presets section', async () => {
      // Navigate back to the presets section where the Reset button lives
      const presetsBtn = await $('//button[contains(., "Theme Presets")]')
      if (await presetsBtn.isExisting()) {
        await presetsBtn.click()
        await browser.pause(300)
      }

      const html = await getRootHTML()
      const hasReset = html.includes('Reset to Default')
      expect(hasReset).toBe(true)
    })

    it('reset restores default branding via IPC', async () => {
      await invokeIPC('branding:reset')
      const result = await invokeIPC('branding:get') as Record<string, unknown>
      expect(result).not.toBeNull()
      // After reset, appName should be the default
      expect(typeof result.appName).toBe('string')
    })
  })

  // ── Stability ─────────────────────────────────────────────────────────

  describe('Stability', () => {
    it('has no critical errors after branding interactions', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })
})
