/**
 * e2e/work-launchpad.pw.spec.ts
 *
 * E2E coverage for the Work launchpad — the default empty state of /work
 * after the showWorkLaunchpad flag was retired. Also exercises the global
 * ActiveSessionsBanner which mounts in Layout.tsx and is visible from any
 * route while one or more sessions are running.
 */

import { test, expect } from './fixtures'
import {
  navigateSidebarTo,
  navigateToHash,
  invokeIPC,
  waitForSelector,
} from './helpers/pw'
import type { Page } from '@playwright/test'

async function stopAllRunningSessions(page: Page): Promise<void> {
  const sessions = (await invokeIPC(page, 'cli:list-sessions')) as Array<{ sessionId: string; status: string }>
  for (const s of sessions.filter((x) => x.status === 'running')) {
    try { await invokeIPC(page, 'cli:stop-session', { sessionId: s.sessionId }) } catch { /* ignore */ }
  }
  await page.waitForTimeout(400)
}

test.describe('ClearPathAI — Work Launchpad', () => {
  test.beforeEach(async ({ page }) => {
    await stopAllRunningSessions(page)
    await navigateSidebarTo(page, 'Sessions')
    await navigateToHash(page, '#/work')
  })

  test.describe('Launchpad rendering', () => {
    test('renders the launchpad container', async ({ page }) => {
      await expect(page.locator('[data-testid="work-launchpad"]')).toBeAttached()
    })

    test('renders all three sub-cards', async ({ page }) => {
      // Post-1.14.0 launchpad: Active + Recent are composed inside the
      // `pick-up-where-you-left-off-card` wrapper, which collapses both
      // inner cards into a merged empty state when there is nothing to
      // resume (the path this test always hits — beforeEach stops every
      // running session). Asserting on the wrapper covers both the
      // populated and merged-empty branches without flaking.
      const ids = [
        'quick-start-card',
        'workflows-card',
        'pick-up-where-you-left-off-card',
      ]
      for (const id of ids) {
        await expect(page.locator(`[data-testid="${id}"]`)).toBeAttached()
      }
    })
  })

  test.describe('Quick start submits and routes to ?id=<sessionId>', () => {
    test('typing + clicking New Chat moves the URL into ?id= and shows the session view', async ({ page }) => {
      await navigateToHash(page, '#/work')
      await waitForSelector(page, '[data-testid="quick-start-textarea"]')

      const ta = page.locator('[data-testid="quick-start-textarea"]')
      await ta.click()
      await ta.fill('hello from e2e')

      const submit = page.locator('[data-testid="quick-start-submit"]')
      await submit.click()
      await page.waitForTimeout(900)

      const hash = await page.evaluate(() => window.location.hash)
      expect(hash).toMatch(/#\/work\?.*\bid=/)

      await expect(page.locator('[data-testid="work-launchpad"]')).toHaveCount(0)
    })
  })

  test.describe('Sidebar Work nav resets back to launchpad', () => {
    test('clicking Work in the sidebar from /work?id=… returns the URL to /work and re-renders the launchpad', async ({ page }) => {
      // First, drive the URL into the ?id= state so we have something to reset from.
      await navigateToHash(page, '#/work')
      await waitForSelector(page, '[data-testid="quick-start-textarea"]')
      const ta = page.locator('[data-testid="quick-start-textarea"]')
      await ta.click()
      await ta.fill('hello from e2e')
      await page.locator('[data-testid="quick-start-submit"]').click()
      await page.waitForTimeout(900)

      const beforeHash = await page.evaluate(() => window.location.hash)
      expect(beforeHash).toMatch(/\bid=/)

      await navigateSidebarTo(page, 'Sessions')
      await page.waitForTimeout(500)

      const afterHash = await page.evaluate(() => window.location.hash)
      expect(afterHash).toMatch(/^#\/work\/?$/)

      await expect(page.locator('[data-testid="work-launchpad"]')).toBeAttached()
    })
  })

  test.describe('Global ActiveSessionsBanner', () => {
    test('is hidden when no sessions are running', async ({ page }) => {
      await stopAllRunningSessions(page)
      await page.waitForTimeout(500)
      await expect(page.locator('[data-testid="active-sessions-banner"]')).toHaveCount(0)
    })

    test('renders one chip when a session is running and clicking it routes to ?id=<sessionId>', async ({ page }) => {
      const result = (await invokeIPC(page, 'cli:start-session', {
        cli: 'copilot-cli', mode: 'interactive', name: 'banner-e2e',
      })) as { sessionId?: string } | null
      const sessionId = result?.sessionId
      expect(typeof sessionId).toBe('string')

      await page.waitForTimeout(900)
      await waitForSelector(page, '[data-testid="active-sessions-banner"]')
      const chipCount = await page.locator('[data-testid="active-session-chip"]').count()
      expect(chipCount).toBeGreaterThanOrEqual(1)

      const targetChip = page.locator(`[data-testid="active-session-chip"][data-session-id="${sessionId}"]`)
      await expect(targetChip).toBeAttached()
      await targetChip.click()
      await page.waitForTimeout(600)

      const hash = await page.evaluate(() => window.location.hash)
      expect(hash).toContain(`id=${sessionId}`)
    })

    test('is rendered globally (still visible on a non-Work route)', async ({ page }) => {
      // Start a session so the banner is visible.
      await invokeIPC(page, 'cli:start-session', {
        cli: 'copilot-cli', mode: 'interactive', name: 'banner-global-e2e',
      })
      await page.waitForTimeout(900)

      await navigateSidebarTo(page, 'Insights')
      await page.waitForTimeout(500)
      await expect(page.locator('[data-testid="active-sessions-banner"]')).toBeAttached()

      await stopAllRunningSessions(page)
      // The hook polls cli:list-sessions every 5s as a backstop; wait for that
      // interval to fire so the banner re-renders against the empty list.
      await expect(page.locator('[data-testid="active-sessions-banner"]')).toHaveCount(0, {
        timeout: 8000,
      })
    })
  })
})
