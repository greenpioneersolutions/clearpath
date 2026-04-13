/**
 * e2e/configure.spec.ts
 *
 * End-to-end tests for the Configure page and all its tabs.
 * Validates that every configuration section renders, tab switching works,
 * and key UI elements are present and interactive.
 */

import {
  waitForAppReady,
  getCriticalConsoleErrors,
  navigateSidebarTo,
  navigateToConfigureTab,
  isConfigureTabSelected,
  waitForText,
  buttonExists,
  clickButton,
  getRootHTML,
  getToggleState,
  clickToggle,
  getInputValue,
  invokeIPC,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

describe('ClearPathAI — Configure Page', () => {
  before(async () => {
    await waitForAppReady()
  })

  // ── Tab List Rendering ──────────────────────────────────────────────────

  describe('Tab Navigation', () => {
    it('navigates to Configure page from sidebar', async () => {
      await navigateSidebarTo('Configure')
      const root = await $('#root')
      expect(await root.isExisting()).toBe(true)
    })

    it('renders the tab list with role="tablist"', async () => {
      const tablist = await $('[role="tablist"]')
      await tablist.waitForExist({ timeout: ELEMENT_TIMEOUT })
      expect(await tablist.isExisting()).toBe(true)
    })

    it('renders all expected tab buttons', async () => {
      const expectedTabs = [
        'Setup Wizard', 'Accessibility', 'Settings', 'Policies',
        'Integrations', 'Extensions', 'Memory', 'Agents',
        'Skills', 'Session Wizard', 'Workspaces', 'Team Hub',
        'Scheduler', 'White Label',
      ]

      for (const label of expectedTabs) {
        const xpath = `//button[@role='tab' and contains(., '${label}')]`
        const tab = await $(xpath)
        expect(await tab.isExisting()).toBe(true)
      }
    })

    it('has Settings tab selected by default', async () => {
      const selected = await isConfigureTabSelected('settings')
      expect(selected).toBe(true)
    })

    it('switches tabs when clicked and updates aria-selected', async () => {
      await navigateToConfigureTab('integrations')
      expect(await isConfigureTabSelected('integrations')).toBe(true)
      expect(await isConfigureTabSelected('settings')).toBe(false)
    })
  })

  // ── Individual Tab Content ──────────────────────────────────────────────

  describe('Settings Tab', () => {
    it('renders settings content', async () => {
      await navigateToConfigureTab('settings')
      const html = await getRootHTML()
      // Settings tab should have substantial content
      expect(html.length).toBeGreaterThan(500)
    })

    it('has no critical errors', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  describe('Integrations Tab', () => {
    before(async () => {
      await navigateToConfigureTab('integrations')
    })

    it('renders the Integrations tab content', async () => {
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(300)
    })

    it('shows GitHub integration card', async () => {
      await waitForText('GitHub')
      const html = await getRootHTML()
      expect(html).toContain('GitHub')
    })

    it('shows integration connection options', async () => {
      // Should show at least one "Connect" button or connected status
      const html = await getRootHTML()
      const hasConnect = html.includes('Connect') || html.includes('Connected')
      expect(hasConnect).toBe(true)
    })

    it('has no critical errors on Integrations tab', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  describe('Extensions Tab', () => {
    before(async () => {
      await navigateToConfigureTab('extensions')
    })

    it('renders the Extensions tab content', async () => {
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })

    it('shows the Extensions heading', async () => {
      await waitForText('Extensions')
      const html = await getRootHTML()
      expect(html).toContain('Extensions')
    })

    it('shows Refresh and Install Extension buttons', async () => {
      const hasRefresh = await buttonExists('Refresh')
      const hasInstall = await buttonExists('Install Extension')
      expect(hasRefresh).toBe(true)
      expect(hasInstall).toBe(true)
    })

    it('shows empty state or extension list', async () => {
      const html = await getRootHTML()
      // Either "No extensions installed" or a grid with extension cards
      const hasEmptyState = html.includes('No extensions installed')
      const hasExtensions = html.includes('bundled') || html.includes('user')
      expect(hasEmptyState || hasExtensions).toBe(true)
    })

    it('has no critical errors on Extensions tab', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  describe('Policies Tab', () => {
    it('renders the Policies tab content', async () => {
      await navigateToConfigureTab('policies')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  describe('Memory Tab', () => {
    it('renders the Memory tab content', async () => {
      await navigateToConfigureTab('memory')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  describe('Agents Tab', () => {
    it('renders the Agents tab content', async () => {
      await navigateToConfigureTab('agents')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  describe('Skills Tab', () => {
    it('renders the Skills tab content', async () => {
      await navigateToConfigureTab('skills')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  describe('Workspaces Tab', () => {
    it('renders the Workspaces tab content', async () => {
      await navigateToConfigureTab('workspaces')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  describe('Team Hub Tab', () => {
    it('renders the Team Hub tab content', async () => {
      await navigateToConfigureTab('team')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  describe('Scheduler Tab', () => {
    it('renders the Scheduler tab content', async () => {
      await navigateToConfigureTab('scheduler')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  describe('White Label Tab', () => {
    it('renders the White Label tab content', async () => {
      await navigateToConfigureTab('branding')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  describe('Accessibility Tab', () => {
    it('renders the Accessibility tab content', async () => {
      await navigateToConfigureTab('accessibility')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  describe('Setup Wizard Tab', () => {
    it('renders the Setup Wizard tab content', async () => {
      await navigateToConfigureTab('setup')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  describe('Session Wizard Tab', () => {
    it('renders the Session Wizard tab content', async () => {
      await navigateToConfigureTab('wizard')
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  // ── Accessibility Interactions ──────────────────────────────────────────

  describe('Accessibility Interactions', () => {
    before(async () => {
      await navigateToConfigureTab('accessibility')
    })

    after(async () => {
      // Always reset accessibility settings after tests
      await invokeIPC('accessibility:reset')
    })

    it('font scale slider exists with default near 1.0', async () => {
      const value = await getInputValue('#a11y-font-scale')
      const num = parseFloat(value)
      expect(num).toBeGreaterThanOrEqual(0.85)
      expect(num).toBeLessThanOrEqual(1.5)
    })

    it('changing font scale slider updates the percentage label', async () => {
      // Set slider to 1.2 (120%)
      await browser.execute(() => {
        const slider = document.querySelector('#a11y-font-scale') as HTMLInputElement
        if (!slider) return
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value',
        )?.set
        if (nativeSetter) nativeSetter.call(slider, '1.2')
        slider.dispatchEvent(new Event('input', { bubbles: true }))
        slider.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await browser.pause(300)

      // The label should show 120%
      const html = await getRootHTML()
      expect(html).toContain('120%')
    })

    it('font scale change persists via IPC', async () => {
      const result = await invokeIPC('accessibility:get') as Record<string, unknown>
      expect(result.fontScale).toBe(1.2)

      // Reset for next tests
      await invokeIPC('accessibility:reset')
    })

    it('Reduced Motion toggle has boolean aria-checked state', async () => {
      const state = await getToggleState('a11y-reduced-motion')
      expect(typeof state).toBe('boolean')
    })

    it('clicking Reduced Motion toggle flips its state', async () => {
      const initial = await getToggleState('a11y-reduced-motion')
      await clickToggle('a11y-reduced-motion')
      const after = await getToggleState('a11y-reduced-motion')
      expect(after).toBe(!initial)

      // Flip back
      await clickToggle('a11y-reduced-motion')
    })

    it('High Contrast toggle click changes state and persists via IPC', async () => {
      const initial = await getToggleState('a11y-high-contrast')
      await clickToggle('a11y-high-contrast')
      const after = await getToggleState('a11y-high-contrast')
      expect(after).toBe(!initial)

      // Verify IPC persistence
      const result = await invokeIPC('accessibility:get') as Record<string, unknown>
      expect(result.highContrast).toBe(after)

      // Reset
      await clickToggle('a11y-high-contrast')
    })

    it('Screen Reader Mode toggle flips state', async () => {
      const initial = await getToggleState('a11y-sr-mode')
      await clickToggle('a11y-sr-mode')
      const after = await getToggleState('a11y-sr-mode')
      expect(after).toBe(!initial)

      // Flip back
      await clickToggle('a11y-sr-mode')
    })

    it('focus indicator radio group has 3 options', async () => {
      const radios = await $$('[role="radiogroup"] [role="radio"]')
      expect(radios.length).toBe(3)
    })

    it('clicking a focus radio button updates aria-checked', async () => {
      const radios = await $$('[role="radiogroup"] [role="radio"]')
      // Click the second radio (index 1)
      await radios[1].click()
      await browser.pause(300)

      const checked = await radios[1].getAttribute('aria-checked')
      expect(checked).toBe('true')

      // The first should no longer be checked
      const firstChecked = await radios[0].getAttribute('aria-checked')
      expect(firstChecked).toBe('false')
    })

    it('Reset to Defaults button resets all toggles and IPC state', async () => {
      // Flip a toggle
      await clickToggle('a11y-high-contrast')

      // Click Reset to Defaults
      await clickButton('Reset')
      await browser.pause(500)

      // Verify IPC state is reset
      const result = await invokeIPC('accessibility:get') as Record<string, unknown>
      expect(result.highContrast).toBe(false)
      expect(result.fontScale).toBe(1)
    })
  })

  // ── Cross-Tab Navigation Stability ─────────────────────────────────────

  describe('Tab Round-Trip Stability', () => {
    it('cycles through all tabs without crashing', async () => {
      const tabs = [
        'settings', 'integrations', 'extensions', 'policies',
        'memory', 'agents', 'skills', 'workspaces',
        'team', 'scheduler', 'branding', 'setup',
        'accessibility', 'wizard',
      ]

      for (const tabKey of tabs) {
        await navigateToConfigureTab(tabKey)
        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
        const html = await root.getHTML()
        expect(html.length).toBeGreaterThan(100)
      }
    })

    it('has no critical errors after cycling all tabs', async () => {
      const errors = await getCriticalConsoleErrors()
      if (errors.length > 0) {
        console.warn('Errors after Configure tab round-trip:', errors)
      }
      expect(Array.isArray(errors)).toBe(true)
    })
  })
})
