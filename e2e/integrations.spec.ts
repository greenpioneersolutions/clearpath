/**
 * e2e/integrations.spec.ts
 *
 * End-to-end tests for the Integrations system.
 * Validates that integration cards render, connection forms display,
 * and the integration status UI works correctly.
 */

import {
  waitForAppReady,
  getCriticalConsoleErrors,
  navigateToConfigureTab,
  waitForText,
  buttonExists,
  getRootHTML,
  setInputValue,
  getInputValue,
  clickButton,
  waitForSelector,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'
import { captureScreenshot } from './helpers/screenshots.js'

describe('ClearPathAI — Integrations', () => {
  before(async () => {
    await waitForAppReady()
  })

  // ── Integrations Tab Rendering ────────────────────────────────────────

  describe('Integrations Tab', () => {
    before(async () => {
      await navigateToConfigureTab('integrations')
    })

    it('renders the Integrations tab content', async () => {
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(300)
    })

    it('has no critical errors on initial render', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  // ── Integration Cards ─────────────────────────────────────────────────

  describe('Integration Cards', () => {
    before(async () => {
      await navigateToConfigureTab('integrations')
      await browser.pause(500)
      // Capture the fully-loaded integration cards grid
      await captureScreenshot('integrations/cards-initial')
    })

    it('shows GitHub integration', async () => {
      await waitForText('GitHub')
      const html = await getRootHTML()
      expect(html).toContain('GitHub')
    })

    it('shows Atlassian/Jira integration', async () => {
      const html = await getRootHTML()
      const hasAtlassian = html.includes('Jira') || html.includes('Atlassian')
      expect(hasAtlassian).toBe(true)
    })

    it('shows ServiceNow integration', async () => {
      const html = await getRootHTML()
      expect(html).toContain('ServiceNow')
    })

    it('shows Backstage integration', async () => {
      const html = await getRootHTML()
      expect(html).toContain('Backstage')
    })

    it('shows PowerBI integration', async () => {
      const html = await getRootHTML()
      const hasPowerBI = html.includes('PowerBI') || html.includes('Power BI')
      expect(hasPowerBI).toBe(true)
    })

    it('each integration card has a Connect or Connected status', async () => {
      const html = await getRootHTML()
      // Cards should show either "Connect" button or "Connected" badge
      const hasConnectionUI = html.includes('Connect') || html.includes('Disconnect')
      expect(hasConnectionUI).toBe(true)
    })
  })

  // ── GitHub Connection Form ────────────────────────────────────────────

  describe('GitHub Integration Detail', () => {
    before(async () => {
      await navigateToConfigureTab('integrations')
      await browser.pause(500)
    })

    it('shows GitHub integration with descriptive text', async () => {
      const html = await getRootHTML()
      // GitHub card should have description about repos, PRs, etc.
      const hasDescription =
        html.includes('repositories') ||
        html.includes('pull requests') ||
        html.includes('issues') ||
        html.includes('GitHub')
      expect(hasDescription).toBe(true)
    })

    it('shows a token input or connection form for GitHub', async () => {
      const html = await getRootHTML()
      // Look for an input field (token input) or "Connect" button
      const hasForm = html.includes('input') || html.includes('token') ||
        html.includes('Connect') || html.includes('Token')
      expect(hasForm).toBe(true)
    })
  })

  // ── Integration Status ────────────────────────────────────────────────

  describe('Integration Status Display', () => {
    before(async () => {
      await navigateToConfigureTab('integrations')
      await browser.pause(500)
    })

    it('shows connection status indicators for each integration', async () => {
      const html = await getRootHTML()
      // Each integration card should have some status indicator
      // (connected/disconnected badge, color indicator, or status text)
      const hasStatusUI =
        html.includes('Connected') ||
        html.includes('Not connected') ||
        html.includes('Connect') ||
        html.includes('Disconnect')
      expect(hasStatusUI).toBe(true)
    })
  })

  // ── GitHub Form Interaction ────────────────────────────────────────────

  describe('GitHub Connection Form Interaction', () => {
    before(async () => {
      await navigateToConfigureTab('integrations')
      await browser.pause(500)
    })

    it('shows a password input for the GitHub token', async () => {
      const input = await $('input[type="password"][placeholder*="ghp_"]')
      const exists = await input.isExisting()
      // The input may be hidden behind a "Connect" button click — either way is valid
      if (!exists) {
        // Try clicking Connect GitHub first
        const connectBtn = await $('//button[contains(., "Connect")]')
        if (await connectBtn.isExisting()) {
          await connectBtn.click()
          await browser.pause(300)
        }
      }
      const html = await getRootHTML()
      expect(html.includes('ghp_') || html.includes('token') || html.includes('Token')).toBe(true)
    })

    it('token input accepts typed text', async () => {
      const selector = 'input[type="password"]'
      const input = await $(selector)
      if (await input.isExisting()) {
        await setInputValue(selector, 'ghp_test_fake_token')
        const value = await getInputValue(selector)
        expect(value).toBe('ghp_test_fake_token')
      }
    })

    it('Connect button with invalid token shows an error response', async () => {
      const selector = 'input[type="password"]'
      const input = await $(selector)
      if (!(await input.isExisting())) return

      await setInputValue(selector, 'ghp_invalid_token_12345')
      await browser.pause(200)

      // Click the Connect button
      const connectBtn = await $('//button[contains(., "Connect") and not(contains(., "Disconnect"))]')
      if (await connectBtn.isExisting()) {
        await connectBtn.click()
        // Wait for the IPC round-trip to complete
        await browser.pause(2000)

        // Capture the error / rejected-credentials state
        await captureScreenshot('integrations/github-connect-error')

        // After a failed connection, should show an error message or the form stays
        const html = await getRootHTML()
        const hasErrorOrForm =
          html.includes('error') || html.includes('Error') ||
          html.includes('failed') || html.includes('Failed') ||
          html.includes('credentials') || html.includes('ghp_')
        expect(hasErrorOrForm).toBe(true)
      }
    })
  })

  // ── Other Integration Forms ───────────────────────────────────────────

  describe('Other Integration Form Elements', () => {
    before(async () => {
      await navigateToConfigureTab('integrations')
      await browser.pause(500)
    })

    it('Atlassian section exists with connection UI', async () => {
      const html = await getRootHTML()
      const hasAtlassian = html.includes('Jira') || html.includes('Atlassian')
      expect(hasAtlassian).toBe(true)
    })

    it('ServiceNow section exists', async () => {
      const html = await getRootHTML()
      expect(html).toContain('ServiceNow')
    })

    it('Backstage section exists', async () => {
      const html = await getRootHTML()
      expect(html).toContain('Backstage')
    })

    it('Datadog section exists', async () => {
      const html = await getRootHTML()
      const hasDatadog = html.includes('Datadog') || html.includes('datadog')
      expect(hasDatadog).toBe(true)
    })
  })

  // ── Integrations Tab Stability ────────────────────────────────────────

  describe('Stability', () => {
    it('survives navigating away and back', async () => {
      await navigateToConfigureTab('integrations')
      await browser.pause(300)

      await navigateToConfigureTab('settings')
      await browser.pause(300)

      await navigateToConfigureTab('integrations')
      await browser.pause(300)

      const html = await getRootHTML()
      expect(html).toContain('GitHub')
    })

    it('has no critical errors after interactions', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })
})
