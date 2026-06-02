/**
 * e2e/permissions-activity-ui.pw.spec.ts
 *
 * Functional + screenshot coverage for the permission-broker UI added in this
 * feature: the per-session "Files & activity" drawer (Work page) and the
 * "Permission requests" panel (Configure → Tools & Permissions). The permission
 * prompt modal only appears for a live tool call (no CLI binary in CI), so it's
 * covered by unit tests; here we capture the surfaces that render without one.
 */

import { test, expect } from './fixtures'
import { navigateToHash, waitForSelector, navigateToConfigureTab } from './helpers/pw'
import { captureScreenshot } from './helpers/pw-screenshots'

test.describe('ClearPathAI — Permission/activity UI', () => {
  test('the "Files & activity" drawer opens for a session and shows its empty state', async ({ page }) => {
    // Start a session from the launchpad so the session view (with the drawer
    // toggle) renders. The CLI spawn fails in CI, but the session is created +
    // selected, which is all the drawer toggle needs.
    await navigateToHash(page, '#/work')
    await waitForSelector(page, '[data-testid="quick-start-textarea"]')
    await page.locator('[data-testid="quick-start-textarea"]').fill('open the activity drawer')
    await page.locator('[data-testid="quick-start-submit"]').click()
    await page.waitForTimeout(900)

    const toggle = page.getByRole('button', { name: /Files & activity/i })
    if ((await toggle.count()) === 0) {
      test.skip(true, 'session view did not render (no CLI in CI) — drawer toggle unavailable')
      return
    }
    await toggle.first().click()

    const drawer = page.locator('[data-testid="session-activity-panel"]')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText(/No activity yet/i)).toBeVisible()
    await captureScreenshot(page, 'permissions/activity-drawer-empty')

    // Closing via the × restores the chat.
    await drawer.getByRole('button', { name: 'Close' }).click()
    await expect(drawer).toHaveCount(0)
  })

  test('the Tools & Permissions › Requests tab renders the permission-requests panel', async ({ page }) => {
    await navigateToConfigureTab(page, 'tools')

    // The broker-driven panel lives on the internal "Requests" sub-tab.
    const requestsTab = page.getByRole('button', { name: 'Requests', exact: true })
    await expect(requestsTab.first()).toBeVisible()
    await requestsTab.first().click()
    await page.waitForTimeout(400)

    const html = await page.locator('#root').innerHTML()
    expect(html).toMatch(/Permission requests|No pending permission requests/)
    await captureScreenshot(page, 'permissions/tools-requests-panel')
  })
})
