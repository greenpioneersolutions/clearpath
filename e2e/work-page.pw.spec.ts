/**
 * e2e/work-page.pw.spec.ts
 *
 * End-to-end tests for the Work page — the chat/session interface.
 * Validates session management, chat input, panel toggles, and
 * mode switching all render and function without crashing.
 */

import { test, expect } from './fixtures'
import {
  navigateSidebarTo,
  navigateToHash,
  getRootHTML,
  setInputValue,
  getInputValue,
} from './helpers/pw'
import { captureScreenshot } from './helpers/pw-screenshots'

test.describe('ClearPathAI — Work Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateSidebarTo(page, 'Sessions')
    await page.waitForTimeout(1000)
  })

  // ── Core Structure ────────────────────────────────────────────────────

  test.describe('Page Structure', () => {
    test('renders the Work page with substantial content', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(500)
    })

    test('renders without critical console errors', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })

    test('contains a chat input area or session controls', async ({ page }) => {
      const html = await getRootHTML(page)
      // Work page should have an input mechanism for chat
      const hasInput =
        html.includes('textarea') ||
        html.includes('input') ||
        html.includes('placeholder') ||
        html.includes('Send') ||
        html.includes('Start')
      expect(hasInput).toBe(true)
    })
  })

  // ── Session Interface ─────────────────────────────────────────────────

  test.describe('Session Interface', () => {
    test('shows session controls or new session option', async ({ page }) => {
      const html = await getRootHTML(page)
      const hasSessionUI =
        html.includes('Session') || html.includes('session') ||
        html.includes('New') || html.includes('Start') ||
        html.includes('Select')
      expect(hasSessionUI).toBe(true)
    })

    test('displays CLI backend status or selector', async ({ page }) => {
      const html = await getRootHTML(page)
      // Should indicate which CLI backend is active
      const hasBackendInfo =
        html.includes('Copilot') || html.includes('copilot') ||
        html.includes('Claude') || html.includes('claude') ||
        html.includes('Local') || html.includes('backend')
      expect(hasBackendInfo).toBe(true)
    })
  })

  // ── Navigation Within Work ────────────────────────────────────────────

  test.describe('Work Page Tabs', () => {
    test('can switch to compose mode via hash', async ({ page }) => {
      await navigateToHash(page, '#/work?tab=compose')

      const root = page.locator('#root')
      await expect(root).toBeAttached()
      const html = await root.innerHTML()
      expect(html.length).toBeGreaterThan(200)
    })

    test('can switch to schedule mode via hash', async ({ page }) => {
      await navigateToHash(page, '#/work?tab=schedule')

      const root = page.locator('#root')
      await expect(root).toBeAttached()
    })

    test('can switch to memory/notes mode via hash', async ({ page }) => {
      await navigateToHash(page, '#/work?tab=memory')

      const root = page.locator('#root')
      await expect(root).toBeAttached()
    })

    test('returns to session tab cleanly', async ({ page }) => {
      await navigateToHash(page, '#/work?tab=session')

      const root = page.locator('#root')
      await expect(root).toBeAttached()
      const html = await root.innerHTML()
      expect(html.length).toBeGreaterThan(200)
    })
  })

  // PR #47 removed the right-rail panels (?panel=agents|tools|templates|
  // skills|subagents) from Work.tsx. The URL params still parse but render
  // nothing, so the previous panel deep-link tests were dropped.

  // ── Command Input ──────────────────────────────────────────────────────
  //
  // The chat textarea only renders when a session is selected/active.
  // Without a running CLI binary the input won't be present, so every
  // test in this block guards with an existence check and passes
  // gracefully when the element is absent (expected in CI).

  test.describe('Command Input', () => {
    async function isInputAvailable(page: import('@playwright/test').Page): Promise<boolean> {
      const textarea = page.locator('[aria-label="Message input"]')
      return (await textarea.count()) > 0
    }

    test('chat input area or session placeholder renders', async ({ page }) => {
      const inputAvailable = await isInputAvailable(page)
      // Either the textarea is present (session active) or
      // the page shows session controls — both are valid states
      const html = await getRootHTML(page)
      const hasUI = inputAvailable || html.includes('Session') ||
        html.includes('New') || html.includes('Start')
      expect(hasUI).toBe(true)
    })

    test('textarea accepts typed text (when session active)', async ({ page }) => {
      if (!(await isInputAvailable(page))) return // No active session — skip gracefully

      const selector = '[aria-label="Message input"]'
      await setInputValue(page, selector, 'Hello world')
      const value = await getInputValue(page, selector)
      expect(value).toBe('Hello world')
      await setInputValue(page, selector, '')
    })

    test('Send button exists (when session active)', async ({ page }) => {
      if (!(await isInputAvailable(page))) return

      const btn = page.locator('[aria-label="Send message"]')
      expect(await btn.count()).toBeGreaterThan(0)
    })

    test('typing / shows slash command autocomplete (when session active)', async ({ page }) => {
      if (!(await isInputAvailable(page))) return

      const selector = '[aria-label="Message input"]'
      const textarea = page.locator(selector).first()
      await textarea.click()
      await page.waitForTimeout(200)

      await setInputValue(page, selector, '/')
      await page.waitForTimeout(500)

      const listbox = page.locator('[role="listbox"]')
      const hasListbox = (await listbox.count()) > 0

      // Capture the autocomplete dropdown while it's visible
      if (hasListbox) await captureScreenshot(page, 'work/slash-autocomplete')

      await setInputValue(page, selector, '')
      await page.waitForTimeout(300)

      expect(hasListbox).toBe(true)
    })

    test('pressing Escape closes autocomplete (when session active)', async ({ page }) => {
      if (!(await isInputAvailable(page))) return

      const selector = '[aria-label="Message input"]'
      await setInputValue(page, selector, '/')
      await page.waitForTimeout(500)

      const listboxBefore = page.locator('[role="listbox"]')
      if ((await listboxBefore.count()) > 0) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        const listboxAfter = page.locator('[role="listbox"]')
        expect(await listboxAfter.count()).toBe(0)
      }

      await setInputValue(page, selector, '')
    })

    test('Enter on empty input does not crash (when session active)', async ({ page }) => {
      if (!(await isInputAvailable(page))) return

      const selector = '[aria-label="Message input"]'
      await setInputValue(page, selector, '')
      await page.waitForTimeout(200)

      const textarea = page.locator(selector).first()
      await textarea.click()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(300)

      const root = page.locator('#root')
      await expect(root).toBeAttached()
    })
  })

  // ── Mode Switching ────────────────────────────────────────────────────

  test.describe('Mode Switching', () => {
    test('mode buttons render with Session label', async ({ page }) => {
      const html = await getRootHTML(page)
      expect(html).toContain('Session')
    })

    test('clicking mode buttons changes active styling without crash', async ({ page }) => {
      // Find and click through mode buttons
      const modeLabels = ['Compose', 'Session']
      for (const label of modeLabels) {
        const btn = page.getByRole('button', { name: label }).first()
        if ((await btn.count()) > 0) {
          await btn.click()
          await page.waitForTimeout(300)
          // Capture each mode's active state
          await captureScreenshot(page, `work/mode-${label.toLowerCase()}`)
          const root = page.locator('#root')
          await expect(root).toBeAttached()
        }
      }
    })

    test('session select dropdown or session UI exists', async ({ page }) => {
      const html = await getRootHTML(page)
      const hasSessionUI =
        html.includes('select') || html.includes('Session') ||
        html.includes('New') || html.includes('session')
      expect(hasSessionUI).toBe(true)
    })
  })

  // ── Stability ─────────────────────────────────────────────────────────

  test.describe('Work Page Stability', () => {
    test('handles leaving and returning to Work page', async ({ page }) => {
      await navigateSidebarTo(page, 'Sessions')
      await page.waitForTimeout(300)

      await navigateSidebarTo(page, 'Home')
      await page.waitForTimeout(300)

      await navigateSidebarTo(page, 'Sessions')
      await page.waitForTimeout(500)

      const root = page.locator('#root')
      await expect(root).toBeAttached()
      const html = await root.innerHTML()
      expect(html.length).toBeGreaterThan(200)
    })

    test('has no critical errors after Work page interactions', async ({ consoleErrors }) => {
      expect(consoleErrors).toEqual([])
    })
  })
})
