/**
 * e2e/work-launchpad.spec.ts
 *
 * E2E coverage for the Work launchpad — the default empty state of /work
 * after the showWorkLaunchpad flag was retired. Also exercises the global
 * ActiveSessionsBanner which mounts in Layout.tsx and is visible from any
 * route while one or more sessions are running.
 */

import {
  waitForAppReady,
  navigateSidebarTo,
  invokeIPC,
  waitForSelector,
} from './helpers/app.js'

async function navigateToHash(hash: string): Promise<void> {
  await browser.execute((h) => {
    window.location.hash = h
  }, hash)
  await browser.pause(600)
}

async function stopAllRunningSessions(): Promise<void> {
  const sessions = (await invokeIPC('cli:list-sessions')) as Array<{ sessionId: string; status: string }>
  for (const s of sessions.filter((x) => x.status === 'running')) {
    try { await invokeIPC('cli:stop-session', { sessionId: s.sessionId }) } catch { /* ignore */ }
  }
  await browser.pause(400)
}

describe('ClearPathAI — Work Launchpad', () => {
  before(async () => {
    await waitForAppReady()
    await stopAllRunningSessions()
    await navigateSidebarTo('Sessions')
    await navigateToHash('#/work')
  })

  describe('Launchpad rendering', () => {
    it('renders the launchpad container', async () => {
      await waitForSelector('[data-testid="work-launchpad"]')
      const el = await $('[data-testid="work-launchpad"]')
      expect(await el.isExisting()).toBe(true)
    })

    it('renders all four sub-cards', async () => {
      const ids = [
        'quick-start-card',
        'workflows-card',
        'active-sessions-card',
        'recent-sessions-card',
      ]
      for (const id of ids) {
        const el = await $(`[data-testid="${id}"]`)
        expect(await el.isExisting()).toBe(true)
      }
    })
  })

  describe('Quick start submits and routes to ?id=<sessionId>', () => {
    it('typing + clicking New Chat moves the URL into ?id= and shows the session view', async () => {
      await navigateToHash('#/work')
      await waitForSelector('[data-testid="quick-start-textarea"]')

      const ta = await $('[data-testid="quick-start-textarea"]')
      await ta.click()
      await ta.setValue('hello from e2e')

      const submit = await $('[data-testid="quick-start-submit"]')
      await submit.waitForClickable({ timeout: 5000 })
      await submit.click()
      await browser.pause(900)

      const hash = await browser.execute(() => window.location.hash)
      expect(hash).toMatch(/#\/work\?.*\bid=/)

      const launchpad = await $('[data-testid="work-launchpad"]')
      expect(await launchpad.isExisting()).toBe(false)
    })
  })

  describe('Sidebar Work nav resets back to launchpad', () => {
    it('clicking Work in the sidebar from /work?id=… returns the URL to /work and re-renders the launchpad', async () => {
      const beforeHash = await browser.execute(() => window.location.hash)
      expect(beforeHash).toMatch(/\bid=/)

      await navigateSidebarTo('Sessions')
      await browser.pause(500)

      const afterHash = await browser.execute(() => window.location.hash)
      expect(afterHash).toMatch(/^#\/work\/?$/)

      const launchpad = await $('[data-testid="work-launchpad"]')
      expect(await launchpad.isExisting()).toBe(true)
    })
  })

  describe('Global ActiveSessionsBanner', () => {
    it('is hidden when no sessions are running', async () => {
      await stopAllRunningSessions()
      await browser.pause(500)
      const banner = await $('[data-testid="active-sessions-banner"]')
      expect(await banner.isExisting()).toBe(false)
    })

    it('renders one chip when a session is running and clicking it routes to ?id=<sessionId>', async () => {
      const result = (await invokeIPC('cli:start-session', {
        cli: 'copilot-cli', mode: 'interactive', name: 'banner-e2e',
      })) as { sessionId?: string } | null
      const sessionId = result?.sessionId
      expect(typeof sessionId).toBe('string')

      await browser.pause(900)
      await waitForSelector('[data-testid="active-sessions-banner"]')
      const chips = await $$('[data-testid="active-session-chip"]')
      expect(chips.length).toBeGreaterThanOrEqual(1)

      const targetChip = await $(`[data-testid="active-session-chip"][data-session-id="${sessionId}"]`)
      expect(await targetChip.isExisting()).toBe(true)
      await targetChip.click()
      await browser.pause(600)

      const hash = await browser.execute(() => window.location.hash)
      expect(hash).toContain(`id=${sessionId}`)
    })

    it('is rendered globally (still visible on a non-Work route)', async () => {
      await navigateSidebarTo('Insights')
      await browser.pause(500)
      const banner = await $('[data-testid="active-sessions-banner"]')
      expect(await banner.isExisting()).toBe(true)

      await stopAllRunningSessions()
      // The hook polls cli:list-sessions every 5s as a backstop; wait for that
      // interval to fire so the banner re-renders against the empty list.
      await browser.waitUntil(
        async () => !(await (await $('[data-testid="active-sessions-banner"]')).isExisting()),
        { timeout: 8000, timeoutMsg: 'banner did not disappear after sessions were stopped' },
      )
    })
  })
})
