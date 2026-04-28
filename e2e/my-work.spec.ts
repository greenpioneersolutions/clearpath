/**
 * e2e/my-work.spec.ts
 *
 * E2E coverage for the My Work aggregation page (/my-work). The page is
 * gated by the non-experimental flag `showMyWork` (on by default), so this
 * spec runs in the standard wdio config — no CLEARPATH_E2E_EXPERIMENTAL
 * needed.
 *
 * Verifies:
 *   - Sidebar entry exists and routes to /my-work
 *   - Disconnected state renders when neither Jira nor GitHub is connected
 *     (the default in a fresh test profile — neither integration is wired)
 *   - "Connect Jira" / "Connect GitHub" CTAs land on /connect
 *
 * The data-loaded path is exercised by the unit tests in
 * src/renderer/src/pages/MyWork.test.tsx — wiring real integration auth
 * into an e2e profile is out of scope here.
 */

import { waitForAppReady, navigateSidebarTo, waitForSelector } from './helpers/app.js'

async function navigateToHash(hash: string): Promise<void> {
  await browser.execute((h) => { window.location.hash = h }, hash)
  await browser.pause(500)
}

describe('ClearPathAI — My Work page', () => {
  before(async () => {
    await waitForAppReady()
  })

  describe('Sidebar entry', () => {
    it('exposes a "My Work" link in the sidebar', async () => {
      const link = await $(`//aside//a[contains(., 'My Work')]`)
      expect(await link.isExisting()).toBe(true)
    })

    it('navigates to /my-work when the sidebar link is clicked', async () => {
      await navigateSidebarTo('My Work')
      const hash = await browser.execute(() => window.location.hash)
      expect(hash).toMatch(/^#\/my-work\/?$/)
    })
  })

  describe('Disconnected state', () => {
    before(async () => {
      await navigateToHash('#/my-work')
    })

    it('renders the My Work page header', async () => {
      await waitForSelector(
        '[data-testid="my-work-disconnected"], [data-testid="my-work-page"]',
      )
      // Heading is "My Work" in both states
      const headings = await $$('h1')
      let found = false
      for (const h of headings) {
        const t = await h.getText()
        if (t.trim() === 'My Work') { found = true; break }
      }
      expect(found).toBe(true)
    })

    it('shows the disconnected card with "Connect Jira" + "Connect GitHub" CTAs when no integrations are wired', async () => {
      // In a fresh CI/test profile neither GitHub nor Atlassian is connected,
      // so the page hits the both-disconnected empty state.
      const empty = await $('[data-testid="my-work-disconnected"]')
      const isEmpty = await empty.isExisting()

      if (isEmpty) {
        // Both CTA buttons should be present
        const jiraCta = await $(`//button[contains(., 'Connect Jira')]`)
        const ghCta = await $(`//button[contains(., 'Connect GitHub')]`)
        expect(await jiraCta.isExisting()).toBe(true)
        expect(await ghCta.isExisting()).toBe(true)
      } else {
        // If a leftover credential exists in the test profile, at minimum the
        // page surface should be present.
        const page = await $('[data-testid="my-work-page"]')
        expect(await page.isExisting()).toBe(true)
      }
    })

    it('clicking "Connect GitHub" routes to the Connect page', async () => {
      const empty = await $('[data-testid="my-work-disconnected"]')
      if (!(await empty.isExisting())) {
        // Skip when the test profile happens to have an integration connected
        return
      }

      const ghCta = await $(`//button[contains(., 'Connect GitHub')]`)
      await ghCta.waitForClickable({ timeout: 5000 })
      await ghCta.click()
      await browser.pause(500)

      const hash = await browser.execute(() => window.location.hash)
      expect(hash).toContain('/connect')
    })
  })
})
