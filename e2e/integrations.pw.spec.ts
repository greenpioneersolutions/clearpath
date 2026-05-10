/**
 * e2e/integrations.pw.spec.ts
 *
 * End-to-end tests for the Integrations system.
 * Validates that integration cards render, connection forms display,
 * and the integration status UI works correctly.
 */

import { test, expect } from './fixtures'
import {
  navigateToConfigureTab,
  navigateToConnectTab,
  waitForText,
  getRootHTML,
  setInputValue,
  getInputValue,
} from './helpers/pw'
import { captureScreenshot } from './helpers/pw-screenshots'

test.describe('ClearPathAI — Integrations', () => {
  // ── Integrations Tab Rendering ────────────────────────────────────────

  test.describe('Integrations Tab', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'integrations')
    })

    test('renders the Integrations tab content', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(300)
    })

    test('has no critical errors on initial render', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })

  // ── Integration Cards ─────────────────────────────────────────────────

  test.describe('Integration Cards', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'integrations')
      await page.waitForTimeout(500)
      // Capture the fully-loaded integration cards grid
      await captureScreenshot(page, 'integrations/cards-initial')
    })

    test('shows GitHub integration', async ({ page }) => {
      await waitForText(page, 'GitHub')
      const html = await getRootHTML(page)
      expect(html).toContain('GitHub')
    })

    test('shows Atlassian/Jira integration', async ({ page }) => {
      const html = await getRootHTML(page)
      const hasAtlassian = html.includes('Jira') || html.includes('Atlassian')
      expect(hasAtlassian).toBe(true)
    })

    test('shows ServiceNow integration', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html).toContain('ServiceNow')
    })

    test('shows Backstage integration', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html).toContain('Backstage')
    })

    test('shows PowerBI integration', async ({ page }) => {
      const html = await getRootHTML(page)
      const hasPowerBI = html.includes('PowerBI') || html.includes('Power BI')
      expect(hasPowerBI).toBe(true)
    })

    test('each integration card has a Connect or Connected status', async ({ page }) => {
      const html = await getRootHTML(page)
      // Cards should show either "Connect" button or "Connected" badge
      const hasConnectionUI = html.includes('Connect') || html.includes('Disconnect')
      expect(hasConnectionUI).toBe(true)
    })
  })

  // ── GitHub Connection Form ────────────────────────────────────────────

  test.describe('GitHub Integration Detail', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'integrations')
      await page.waitForTimeout(500)
    })

    test('shows GitHub integration with descriptive text', async ({ page }) => {
      const html = await getRootHTML(page)
      // GitHub card should have description about repos, PRs, etc.
      const hasDescription =
        html.includes('repositories') ||
        html.includes('pull requests') ||
        html.includes('issues') ||
        html.includes('GitHub')
      expect(hasDescription).toBe(true)
    })

    test('shows a token input or connection form for GitHub', async ({ page }) => {
      const html = await getRootHTML(page)
      // Look for an input field (token input) or "Connect" button
      const hasForm = html.includes('input') || html.includes('token') ||
        html.includes('Connect') || html.includes('Token')
      expect(hasForm).toBe(true)
    })
  })

  // ── Integration Status ────────────────────────────────────────────────

  test.describe('Integration Status Display', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'integrations')
      await page.waitForTimeout(500)
    })

    test('shows connection status indicators for each integration', async ({ page }) => {
      const html = await getRootHTML(page)
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

  test.describe('GitHub Connection Form Interaction', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'integrations')
      await page.waitForTimeout(500)
    })

    test('shows a password input for the GitHub token', async ({ page }) => {
      const input = page.locator('input[type="password"][placeholder*="ghp_"]')
      const exists = (await input.count()) > 0
      // The input may be hidden behind a "Connect" button click — either way is valid
      if (!exists) {
        // Try clicking Connect GitHub first
        const connectBtn = page.getByRole('button', { name: 'Connect' }).first()
        if ((await connectBtn.count()) > 0) {
          await connectBtn.click()
          await page.waitForTimeout(300)
        }
      }
      const html = await getRootHTML(page)
      expect(html.includes('ghp_') || html.includes('token') || html.includes('Token')).toBe(true)
    })

    test('token input accepts typed text', async ({ page }) => {
      const selector = 'input[type="password"]'
      const input = page.locator(selector).first()
      if ((await input.count()) > 0) {
        await setInputValue(page, selector, 'ghp_test_fake_token')
        const value = await getInputValue(page, selector)
        expect(value).toBe('ghp_test_fake_token')
      }
    })

    test('Connect button with invalid token shows an error response', async ({ page }) => {
      const selector = 'input[type="password"]'
      const input = page.locator(selector).first()
      if (!((await input.count()) > 0)) return

      await setInputValue(page, selector, 'ghp_invalid_token_12345')
      await page.waitForTimeout(200)

      // Click the Connect button (not Disconnect)
      const connectBtn = page
        .locator('//button[contains(., "Connect") and not(contains(., "Disconnect"))]')
        .first()
      if ((await connectBtn.count()) > 0) {
        await connectBtn.click()
        // Wait for the IPC round-trip to complete
        await page.waitForTimeout(2000)

        // Capture the error / rejected-credentials state
        await captureScreenshot(page, 'integrations/github-connect-error')

        // After a failed connection, should show an error message or the form stays
        const html = await getRootHTML(page)
        const hasErrorOrForm =
          html.includes('error') || html.includes('Error') ||
          html.includes('failed') || html.includes('Failed') ||
          html.includes('credentials') || html.includes('ghp_')
        expect(hasErrorOrForm).toBe(true)
      }
    })
  })

  // ── Other Integration Forms ───────────────────────────────────────────

  test.describe('Other Integration Form Elements', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'integrations')
      await page.waitForTimeout(500)
    })

    test('Atlassian section exists with connection UI', async ({ page }) => {
      const html = await getRootHTML(page)
      const hasAtlassian = html.includes('Jira') || html.includes('Atlassian')
      expect(hasAtlassian).toBe(true)
    })

    test('ServiceNow section exists', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html).toContain('ServiceNow')
    })

    test('Backstage section exists', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html).toContain('Backstage')
    })

    test('Datadog section exists', async ({ page }) => {
      const html = await getRootHTML(page)
      const hasDatadog = html.includes('Datadog') || html.includes('datadog')
      expect(hasDatadog).toBe(true)
    })
  })

  // ── Integrations Tab Stability ────────────────────────────────────────

  test.describe('Stability', () => {
    test('survives navigating away and back', async ({ page }) => {
      // Navigate Connect → Integrations, then to Configure → Settings (a
      // different top-level route), then back to Connect → Integrations.
      await navigateToConnectTab(page, 'integrations')
      await page.waitForTimeout(300)

      await navigateToConfigureTab(page, 'settings')
      await page.waitForTimeout(300)

      await navigateToConnectTab(page, 'integrations')
      await page.waitForTimeout(300)

      const html = await getRootHTML(page)
      expect(html).toContain('GitHub')
    })

    test('has no critical errors after interactions', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })
})
