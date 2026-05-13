/**
 * e2e/navigation.pw.spec.ts
 *
 * Deep navigation tests for the entire app — Playwright port.
 * Goes beyond the smoke test to verify that every major route renders
 * correctly, that navigation state is preserved, and that the sidebar
 * properly indicates the active route.
 */

import { test, expect } from './fixtures'
import {
  navigateSidebarTo,
  mainContentIsRendered,
  getRootHTML,
  ELEMENT_TIMEOUT,
} from './helpers/pw'

test.describe('ClearPathAI — Full Navigation', () => {
  // ── Sidebar Structure ──────────────────────────────────────────────────

  test.describe('Sidebar Structure', () => {
    test('renders the sidebar aside element', async ({ page }) => {
      const aside = page.locator('aside')
      await expect(aside).toBeAttached({ timeout: ELEMENT_TIMEOUT })
    })

    test('contains a nav element with aria-label', async ({ page }) => {
      // Sidebar.tsx renders the inner primary <nav aria-label="Primary">
      // inside <aside role="navigation" aria-label="Main navigation">.
      // Assert the actual aria-label value so this test catches regressions
      // where the attribute is dropped or renamed (which screen readers care about).
      const nav = page.locator('aside nav')
      await expect(nav).toBeAttached()
      await expect(nav).toHaveAttribute('aria-label', 'Primary')
    })

    test('renders the expected navigation items', async ({ page }) => {
      const texts = await page.locator('aside a').allTextContents()
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

    test('highlights the active route link', async ({ page }) => {
      await navigateSidebarTo(page, 'Home')
      // Active NavLink typically has an active class (e.g., bg-* or text-white)
      const homeLinks = await page.locator('aside a').all()
      let foundActive = false
      for (const link of homeLinks) {
        const text = (await link.textContent()) ?? ''
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

  test.describe('Home Page', () => {
    test.beforeEach(async ({ page }) => {
      await navigateSidebarTo(page, 'Home')
    })

    test('renders home content with substantial HTML', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(500)
    })

    test('shows a greeting or dashboard heading', async ({ page }) => {
      const html = await getRootHTML(page)
      // HomeHub shows time-based greeting or CustomDashboard shows widgets
      const hasGreeting = html.includes('Good morning') ||
        html.includes('Good afternoon') ||
        html.includes('Good evening') ||
        html.includes('Dashboard') ||
        html.includes('Welcome')
      expect(hasGreeting).toBe(true)
    })

    test('renders main content area', async ({ page }) => {
      expect(await mainContentIsRendered(page)).toBe(true)
    })
  })

  // ── Work Page ─────────────────────────────────────────────────────────

  test.describe('Work Page', () => {
    test.beforeEach(async ({ page }) => {
      await navigateSidebarTo(page, 'Sessions')
      await page.waitForTimeout(1000)
    })

    test('renders work page content', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(300)
    })

    test('contains session or chat interface elements', async ({ page }) => {
      const html = await getRootHTML(page)
      // Work page should have session-related UI elements
      const hasSessionUI =
        html.includes('session') || html.includes('Session') ||
        html.includes('New') || html.includes('Start') ||
        html.includes('textarea') || html.includes('input')
      expect(hasSessionUI).toBe(true)
    })

    test('has no critical errors', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })

  // ── Insights Page ─────────────────────────────────────────────────────

  test.describe('Insights Page', () => {
    test.beforeEach(async ({ page }) => {
      await navigateSidebarTo(page, 'Insights')
      await page.waitForTimeout(500)
    })

    test('renders insights page content', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })

    test('shows analytics or tab navigation', async ({ page }) => {
      // PR #47: Analytics + Usage merged into a single "Activity" tab.
      const html = await getRootHTML(page)
      const hasInsightsUI =
        html.includes('Activity') ||
        html.includes('Compliance') ||
        html.includes('Insights')
      expect(hasInsightsUI).toBe(true)
    })

    test('has no critical errors', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })

  // ── Navigate All Routes Sequentially ──────────────────────────────────

  test.describe('Sequential Route Navigation', () => {
    // PR #47: sidebar label for /configure changed from "Configure" to
    // "Settings"; "Connect" was added as a new pinned route.
    const routes = ['Home', 'Sessions', 'Insights', 'Connect', 'Settings', 'Home (return)']

    for (const route of routes) {
      test(`navigates to ${route} without crash`, async ({ page }) => {
        const target = route === 'Home (return)' ? 'Home' : route
        await navigateSidebarTo(page, target)
        const root = page.locator('#root')
        await expect(root).toBeAttached()
        const html = await root.innerHTML()
        expect(html.length).toBeGreaterThan(100)
      })
    }
  })

  // ── Rapid Navigation Stress Test ──────────────────────────────────────

  test.describe('Rapid Navigation', () => {
    test('handles fast sequential clicks without crashing', async ({ page }) => {
      const routes = ['Sessions', 'Insights', 'Settings', 'Home', 'Sessions', 'Home']

      for (const route of routes) {
        await navigateSidebarTo(page, route)
        // Minimal pause — testing React Router resilience
        await page.waitForTimeout(200)
      }

      const root = page.locator('#root')
      await expect(root).toBeAttached()
      const html = await root.innerHTML()
      expect(html.length).toBeGreaterThan(100)
    })

    test('has no critical errors after rapid navigation', async ({ page, consoleErrors }) => {
      // Drive the rapid-navigation flow inside this test so consoleErrors
      // (per-test fixture) can observe any errors caused by it.
      const routes = ['Sessions', 'Insights', 'Settings', 'Home']
      for (const route of routes) {
        await navigateSidebarTo(page, route)
        await page.waitForTimeout(200)
      }
      expect(consoleErrors).toEqual([])
    })
  })
})
