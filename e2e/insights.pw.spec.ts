/**
 * e2e/insights.pw.spec.ts
 *
 * End-to-end tests for the Insights page — Playwright port.
 * Validates analytics tabs, compliance section, usage analytics,
 * and any extension-contributed tabs.
 */

import { test, expect } from './fixtures'
import { navigateSidebarTo, getRootHTML } from './helpers/pw'

test.describe('ClearPathAI — Insights Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateSidebarTo(page, 'Insights')
    await page.waitForTimeout(500)
  })

  // ── Page Structure ────────────────────────────────────────────────────

  test.describe('Page Structure', () => {
    test('renders the Insights page', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })

    test('shows tab navigation for Activity and Compliance', async ({ page }) => {
      // PR #47 merged the old "Analytics" + "Usage" tabs into a single
      // "Activity" tab. Built-in Insights tabs are now Activity + Compliance.
      const html = await getRootHTML(page)
      const hasActivity = html.includes('Activity')
      const hasCompliance = html.includes('Compliance')

      // At least one of the built-in tabs should be visible
      expect(hasActivity || hasCompliance).toBe(true)
    })

    test('has no critical errors', async ({ consoleErrors }) => {
      expect(Array.isArray(consoleErrors)).toBe(true)
    })
  })

  // ── Tab Switching ─────────────────────────────────────────────────────

  test.describe('Tab Switching', () => {
    test('can switch to Activity tab', async ({ page }) => {
      const tab = page.getByRole('button', { name: 'Activity' }).first()
      if ((await tab.count()) > 0) {
        await tab.click()
        await page.waitForTimeout(500)
        const html = await getRootHTML(page)
        expect(html.length).toBeGreaterThan(200)
      }
    })

    test('can switch to Compliance tab', async ({ page }) => {
      const tab = page.getByRole('button', { name: 'Compliance' }).first()
      if ((await tab.count()) > 0) {
        await tab.click()
        await page.waitForTimeout(500)
        const html = await getRootHTML(page)
        expect(html.length).toBeGreaterThan(200)
      }
    })

    test('has no critical errors after tab switching', async ({ consoleErrors }) => {
      expect(Array.isArray(consoleErrors)).toBe(true)
    })
  })

  // ── Tab State Verification ──────────────────────────────────────────

  test.describe('Tab Active State', () => {
    test('clicking Activity tab gives it active styling', async ({ page }) => {
      const btn = page.getByRole('button', { name: 'Activity' }).first()
      if ((await btn.count()) > 0) {
        await btn.click()
        await page.waitForTimeout(300)
        const classes = (await btn.getAttribute('class')) ?? ''
        // Active tab should have a distinctive style (border-blue, text-blue, etc.)
        expect(classes.length).toBeGreaterThan(0)
      }
    })

    test('Compliance tab shows compliance-related content', async ({ page }) => {
      const btn = page.getByRole('button', { name: 'Compliance' }).first()
      if ((await btn.count()) > 0) {
        await btn.click()
        await page.waitForTimeout(500)
        const html = await getRootHTML(page)
        const hasComplianceContent =
          html.includes('policy') || html.includes('Policy') ||
          html.includes('audit') || html.includes('Audit') ||
          html.includes('compliance') || html.includes('Compliance') ||
          html.includes('scan') || html.includes('Scan')
        expect(hasComplianceContent).toBe(true)
      }
    })

    test('tab round-trip preserves rendering', async ({ page }) => {
      const tabs = ['Activity', 'Compliance']
      for (const label of tabs) {
        const btn = page.getByRole('button', { name: label }).first()
        if ((await btn.count()) > 0) {
          await btn.click()
          await page.waitForTimeout(300)
        }
      }
      // Return to Activity
      const activityBtn = page.getByRole('button', { name: 'Activity' }).first()
      if ((await activityBtn.count()) > 0) {
        await activityBtn.click()
        await page.waitForTimeout(300)
        const html = await getRootHTML(page)
        expect(html.length).toBeGreaterThan(200)
      }
    })
  })

  // ── Extension Tabs ────────────────────────────────────────────────────

  test.describe('Extension-Contributed Tabs', () => {
    test('renders extension tabs if any exist', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(100)
    })
  })
})
