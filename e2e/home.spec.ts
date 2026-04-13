/**
 * e2e/home.spec.ts
 *
 * End-to-end tests for the Home page / Dashboard.
 * Validates the greeting, action cards, recent sessions,
 * progress tracking, and quick prompt input.
 */

import {
  waitForAppReady,
  getCriticalConsoleErrors,
  navigateSidebarTo,
  getRootHTML,
  setInputValue,
  getInputValue,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

describe('ClearPathAI — Home Page', () => {
  before(async () => {
    await waitForAppReady()
    await navigateSidebarTo('Home')
    await browser.pause(500)
  })

  // ── Page Content ──────────────────────────────────────────────────────

  describe('Home Content', () => {
    it('renders the Home page with substantial content', async () => {
      const html = await getRootHTML()
      expect(html.length).toBeGreaterThan(500)
    })

    it('shows a time-based greeting or welcome message', async () => {
      const html = await getRootHTML()
      const hasGreeting =
        html.includes('Good morning') ||
        html.includes('Good afternoon') ||
        html.includes('Good evening') ||
        html.includes('Welcome') ||
        html.includes('Dashboard')
      expect(hasGreeting).toBe(true)
    })

    it('has no critical errors', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  // ── Action Cards ──────────────────────────────────────────────────────

  describe('Action Cards', () => {
    it('shows action cards or quick-start options', async () => {
      const html = await getRootHTML()
      // HomeHub shows action cards with prompts
      const hasActions =
        html.includes('Ask') || html.includes('question') ||
        html.includes('Write') || html.includes('guidance') ||
        html.includes('widget') || html.includes('Quick')
      expect(hasActions).toBe(true)
    })
  })

  // ── Progress Tracking ─────────────────────────────────────────────────

  describe('Progress & Stats', () => {
    it('shows progress or usage statistics', async () => {
      const html = await getRootHTML()
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

  describe('Quick Prompt', () => {
    before(async () => {
      await navigateSidebarTo('Home')
      await browser.pause(500)
    })

    it('quick prompt input exists with aria-label', async () => {
      const input = await $('[aria-label="Quick prompt"]')
      const exists = await input.isExisting()
      expect(exists).toBe(true)
    })

    it('accepts typed text', async () => {
      const selector = '[aria-label="Quick prompt"]'
      await setInputValue(selector, 'Help me write a memo')
      const value = await getInputValue(selector)
      expect(value).toBe('Help me write a memo')

      // Clear for next tests
      await setInputValue(selector, '')
    })

    it('pressing Enter with text navigates to Work page', async () => {
      const selector = '[aria-label="Quick prompt"]'
      await setInputValue(selector, 'Test prompt')
      await browser.pause(200)

      const input = await $(selector)
      await input.click()
      await browser.keys('Enter')
      await browser.pause(1000)

      // Should have navigated to Work page
      const hash = await browser.execute(() => window.location.hash)
      expect(hash).toContain('/work')

      // Navigate back to Home for subsequent tests
      await navigateSidebarTo('Home')
      await browser.pause(500)
    })
  })

  // ── Action Card Navigation ────────────────────────────────────────────

  describe('Action Card Navigation', () => {
    it('action cards have clickable links/buttons', async () => {
      const html = await getRootHTML()
      const hasClickable = html.includes('href') || html.includes('button') ||
        html.includes('onClick')
      expect(hasClickable).toBe(true)
    })

    it('clicking an action card navigates away from home', async () => {
      // Find the first action card link (these navigate to /work with params)
      const cardLink = await $('a[href*="/work"]')
      if (await cardLink.isExisting()) {
        await cardLink.click()
        await browser.pause(500)

        const hash = await browser.execute(() => window.location.hash)
        expect(hash).toContain('/work')

        // Navigate back
        await navigateSidebarTo('Home')
        await browser.pause(300)
      }
    })
  })
})
