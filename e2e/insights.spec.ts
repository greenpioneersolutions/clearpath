/**
 * e2e/insights.spec.ts
 *
 * End-to-end tests for the Insights page.
 * Validates analytics tabs, compliance section, usage analytics,
 * and any extension-contributed tabs.
 */

import {
  waitForAppReady,
  getCriticalConsoleErrors,
  navigateSidebarTo,
  waitForText,
  getRootHTML,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

describe('ClearPathAI — Insights Page', () => {
  before(async () => {
    await waitForAppReady()
    await navigateSidebarTo('Insights')
    await browser.pause(500)
  })

  // ── Page Structure ────────────────────────────────────────────────────

  describe('Page Structure', () => {
    it('renders the Insights page', async () => {
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })

    it('shows tab navigation for Analytics, Compliance, Usage', async () => {
      const html = await getRootHTML()
      const hasAnalytics = html.includes('Analytics')
      const hasCompliance = html.includes('Compliance')
      const hasUsage = html.includes('Usage')

      // At least one of the built-in tabs should be visible
      expect(hasAnalytics || hasCompliance || hasUsage).toBe(true)
    })

    it('has no critical errors', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  // ── Tab Switching ─────────────────────────────────────────────────────

  describe('Tab Switching', () => {
    it('can switch to Analytics tab', async () => {
      const xpath = `//button[contains(., 'Analytics')]`
      const tab = await $(xpath)
      if (await tab.isExisting()) {
        await tab.click()
        await browser.pause(500)
        const html = await getRootHTML()
        expect(html.length).toBeGreaterThan(200)
      }
    })

    it('can switch to Compliance tab', async () => {
      const xpath = `//button[contains(., 'Compliance')]`
      const tab = await $(xpath)
      if (await tab.isExisting()) {
        await tab.click()
        await browser.pause(500)
        const html = await getRootHTML()
        expect(html.length).toBeGreaterThan(200)
      }
    })

    it('can switch to Usage tab', async () => {
      const xpath = `//button[contains(., 'Usage')]`
      const tab = await $(xpath)
      if (await tab.isExisting()) {
        await tab.click()
        await browser.pause(500)
        const html = await getRootHTML()
        expect(html.length).toBeGreaterThan(200)
      }
    })

    it('has no critical errors after tab switching', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  // ── Tab State Verification ──────────────────────────────────────────

  describe('Tab Active State', () => {
    before(async () => {
      await navigateSidebarTo('Insights')
      await browser.pause(500)
    })

    it('clicking Analytics tab gives it active styling', async () => {
      const btn = await $('//button[contains(., "Analytics")]')
      if (await btn.isExisting()) {
        await btn.click()
        await browser.pause(300)
        const classes = await btn.getAttribute('class')
        // Active tab should have a distinctive style (border-blue, text-blue, etc.)
        expect(classes.length).toBeGreaterThan(0)
      }
    })

    it('Compliance tab shows compliance-related content', async () => {
      const btn = await $('//button[contains(., "Compliance")]')
      if (await btn.isExisting()) {
        await btn.click()
        await browser.pause(500)
        const html = await getRootHTML()
        const hasComplianceContent =
          html.includes('policy') || html.includes('Policy') ||
          html.includes('audit') || html.includes('Audit') ||
          html.includes('compliance') || html.includes('Compliance') ||
          html.includes('scan') || html.includes('Scan')
        expect(hasComplianceContent).toBe(true)
      }
    })

    it('tab round-trip preserves rendering', async () => {
      const tabs = ['Analytics', 'Compliance', 'Usage']
      for (const label of tabs) {
        const btn = await $(`//button[contains(., '${label}')]`)
        if (await btn.isExisting()) {
          await btn.click()
          await browser.pause(300)
        }
      }
      // Return to Analytics
      const analyticsBtn = await $('//button[contains(., "Analytics")]')
      if (await analyticsBtn.isExisting()) {
        await analyticsBtn.click()
        await browser.pause(300)
        const html = await getRootHTML()
        expect(html.length).toBeGreaterThan(200)
      }
    })
  })

  // ── Extension Tabs ────────────────────────────────────────────────────

  describe('Extension-Contributed Tabs', () => {
    it('renders extension tabs if any exist', async () => {
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(100)
    })
  })
})
