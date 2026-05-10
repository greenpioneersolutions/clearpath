/**
 * e2e/home.pw.spec.ts
 *
 * End-to-end tests for the Home page / Dashboard — Playwright port.
 * Validates the greeting, action cards, recent sessions,
 * progress tracking, and quick prompt input.
 */

import { test, expect } from './fixtures'
import {
  navigateSidebarTo,
  getRootHTML,
  setInputValue,
  getInputValue,
} from './helpers/pw'
import { captureScreenshot } from './helpers/pw-screenshots'

test.describe('ClearPathAI — Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateSidebarTo(page, 'Home')
    await page.waitForTimeout(500)
  })

  // ── Page Content ──────────────────────────────────────────────────────

  test.describe('Home Content', () => {
    test('renders the Home page with substantial content', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(500)
      // Capture the fully-loaded Home dashboard (greeting, action cards, progress)
      await captureScreenshot(page, 'home/dashboard-initial')
    })

    test('shows a time-based greeting or welcome message', async ({ page }) => {
      const html = await getRootHTML(page)
      const hasGreeting =
        html.includes('Good morning') ||
        html.includes('Good afternoon') ||
        html.includes('Good evening') ||
        html.includes('Welcome') ||
        html.includes('Dashboard')
      expect(hasGreeting).toBe(true)
    })

    test('has no critical errors', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })

  // ── Action Cards ──────────────────────────────────────────────────────

  test.describe('Action Cards', () => {
    test('shows action cards or quick-start options', async ({ page }) => {
      const html = await getRootHTML(page)
      // HomeHub shows action cards with prompts
      const hasActions =
        html.includes('Ask') || html.includes('question') ||
        html.includes('Write') || html.includes('guidance') ||
        html.includes('widget') || html.includes('Quick')
      expect(hasActions).toBe(true)
    })
  })

  // ── Progress Tracking ─────────────────────────────────────────────────

  test.describe('Progress & Stats', () => {
    test('shows progress or usage statistics', async ({ page }) => {
      const html = await getRootHTML(page)
      // HomeHub sidebar shows progress ring, streak, time invested
      const hasStats =
        html.includes('progress') || html.includes('Progress') ||
        html.includes('%') || html.includes('streak') ||
        html.includes('Streak') || html.includes('Session') ||
        html.includes('session')
      expect(hasStats).toBe(true)
    })
  })

  // ── Quick Prompt Interaction ───────────────────────────────────────────

  test.describe('Quick Prompt', () => {
    test('quick prompt input exists with aria-label', async ({ page }) => {
      const input = page.locator('[aria-label="Quick prompt"]')
      await expect(input).toBeAttached()
    })

    test('accepts typed text', async ({ page }) => {
      const selector = '[aria-label="Quick prompt"]'
      await setInputValue(page, selector, 'Help me write a memo')
      const value = await getInputValue(page, selector)
      expect(value).toBe('Help me write a memo')

      // Capture the quick-prompt input with typed text
      await captureScreenshot(page, 'home/quick-prompt-typed')

      // Clear for next tests
      await setInputValue(page, selector, '')
    })

    test('pressing Enter with text navigates to Work page', async ({ page }) => {
      const selector = '[aria-label="Quick prompt"]'
      await setInputValue(page, selector, 'Test prompt')
      await page.waitForTimeout(200)

      await page.locator(selector).click()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1000)

      // Should have navigated to Work page
      const hash = await page.evaluate(() => window.location.hash)
      expect(hash).toContain('/work')
    })
  })

  // ── Action Card Navigation ────────────────────────────────────────────

  test.describe('Action Card Navigation', () => {
    test('action cards have clickable links/buttons', async ({ page }) => {
      const html = await getRootHTML(page)
      const hasClickable = html.includes('href') || html.includes('button') ||
        html.includes('onClick')
      expect(hasClickable).toBe(true)
    })

    test('clicking an action card navigates away from home', async ({ page }) => {
      // Find the first action card link (these navigate to /work with params)
      const cardLink = page.locator('a[href*="/work"]').first()
      if ((await cardLink.count()) > 0) {
        await cardLink.click()
        await page.waitForTimeout(500)

        const hash = await page.evaluate(() => window.location.hash)
        expect(hash).toContain('/work')
      }
    })
  })
})
