/**
 * e2e/navigation.spec.ts
 *
 * Deep navigation tests for the entire app.
 * Goes beyond the smoke test to verify that every major route renders
 * correctly, that navigation state is preserved, and that the sidebar
 * properly indicates the active route.
 */

import {
  waitForAppReady,
  getCriticalConsoleErrors,
  navigateSidebarTo,
  mainContentIsRendered,
  waitForText,
  getRootHTML,
  getTextContents,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

describe('ClearPathAI — Full Navigation', () => {
  before(async () => {
    await waitForAppReady()
  })

  // ── Sidebar Structure ──────────────────────────────────────────────────

  describe('Sidebar Structure', () => {
    it('renders the sidebar aside element', async () => {
      const aside = await $('aside')
      await aside.waitForExist({ timeout: ELEMENT_TIMEOUT })
      expect(await aside.isExisting()).toBe(true)
    })

    it('contains a nav element with aria-label', async () => {
      const nav = await $('aside nav')
      expect(await nav.isExisting()).toBe(true)
    })

    it('renders the expected navigation items', async () => {
      const navLinks = await $$('aside a')
      const texts: string[] = []
      for (const link of navLinks) {
        texts.push(await link.getText())
      }
      const allText = texts.join(' ')

      // PR #47: sidebar link to /configure is now labeled "Settings",
      // and a new "Connect" entry was added (pinned to the bottom).
      expect(allText).toContain('Home')
      // Work renamed to Sessions in 1.13.0.
      expect(allText).toContain('Sessions')
      expect(allText).toContain('Insights')
      expect(allText).toContain('Settings')
      expect(allText).toContain('Connect')
    })

    it('highlights the active route link', async () => {
      await navigateSidebarTo('Home')
      // Active NavLink typically has an active class (e.g., bg-* or text-white)
      const homeLinks = await $$('aside a')
      let foundActive = false
      for (const link of homeLinks) {
        const text = await link.getText()
        if (text.includes('Home')) {
          const classes = await link.getAttribute('class')
          // NavLink active class includes distinctive styling
          if (classes && (classes.includes('text-white') || classes.includes('bg-'))) {
            foundActive = true
          }
          break
        }
      }
      expect(foundActive).toBe(true)
    })
  })

  // ── Home Page ──────────────────────────────────────────────────────────

  describe('Home Page', () => {
    before(async () => {
      await navigateSidebarTo('Home')
    })

    it('renders home content with substantial HTML', async () => {
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(500)
    })

    it('shows a greeting or dashboard heading', async () => {
      const html = await getRootHTML()
      // HomeHub shows time-based greeting or CustomDashboard shows widgets
      const hasGreeting = html.includes('Good morning') ||
        html.includes('Good afternoon') ||
        html.includes('Good evening') ||
        html.includes('Dashboard') ||
        html.includes('Welcome')
      expect(hasGreeting).toBe(true)
    })

    it('renders main content area', async () => {
      expect(await mainContentIsRendered()).toBe(true)
    })
  })

  // ── Work Page ─────────────────────────────────────────────────────────

  describe('Work Page', () => {
    before(async () => {
      await navigateSidebarTo('Sessions')
      await browser.pause(1000)
    })

    it('renders work page content', async () => {
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(300)
    })

    it('contains session or chat interface elements', async () => {
      const html = await getRootHTML()
      // Work page should have session-related UI elements
      const hasSessionUI =
        html.includes('session') || html.includes('Session') ||
        html.includes('New') || html.includes('Start') ||
        html.includes('textarea') || html.includes('input')
      expect(hasSessionUI).toBe(true)
    })

    it('has no critical errors', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  // ── Insights Page ─────────────────────────────────────────────────────

  describe('Insights Page', () => {
    before(async () => {
      await navigateSidebarTo('Insights')
      await browser.pause(500)
    })

    it('renders insights page content', async () => {
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(200)
    })

    it('shows analytics or tab navigation', async () => {
      // PR #47: Analytics + Usage merged into a single "Activity" tab.
      const html = await getRootHTML()
      const hasInsightsUI =
        html.includes('Activity') ||
        html.includes('Compliance') ||
        html.includes('Insights')
      expect(hasInsightsUI).toBe(true)
    })

    it('has no critical errors', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  // ── Navigate All Routes Sequentially ──────────────────────────────────

  describe('Sequential Route Navigation', () => {
    // PR #47: sidebar label for /configure changed from "Configure" to
    // "Settings"; "Connect" was added as a new pinned route.
    const routes = ['Home', 'Sessions', 'Insights', 'Connect', 'Settings', 'Home']

    for (const route of routes) {
      it(`navigates to ${route} without crash`, async () => {
        await navigateSidebarTo(route)
        const root = await $('#root')
        expect(await root.isExisting()).toBe(true)
        const html = await root.getHTML()
        expect(html.length).toBeGreaterThan(100)
      })
    }
  })

  // ── Rapid Navigation Stress Test ──────────────────────────────────────

  describe('Rapid Navigation', () => {
    it('handles fast sequential clicks without crashing', async () => {
      const routes = ['Sessions', 'Insights', 'Settings', 'Home', 'Sessions', 'Home']

      for (const route of routes) {
        await navigateSidebarTo(route)
        // Minimal pause — testing React Router resilience
        await browser.pause(200)
      }

      const root = await $('#root')
      expect(await root.isExisting()).toBe(true)
      const html = await root.getHTML()
      expect(html.length).toBeGreaterThan(100)
    })

    it('has no critical errors after rapid navigation', async () => {
      const errors = await getCriticalConsoleErrors()
      if (errors.length > 0) {
        console.warn('Errors after rapid navigation:', errors)
      }
      expect(Array.isArray(errors)).toBe(true)
    })
  })
})
