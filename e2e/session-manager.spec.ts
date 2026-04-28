/**
 * e2e/session-manager.spec.ts
 *
 * E2E coverage for the SessionManager modal — specifically bulk operations
 * (archive / unarchive). The Sessions modal is opened from the Sessions
 * launchpad's "See more →" link in RecentSessionsCard. Persisted sessions
 * are seeded by spinning up real sessions via cli:start-session, then
 * stopping them so they show up in the modal's Active list.
 *
 * NOTE on rate limits: cli:start-session is capped at 5/minute by the IPC
 * rate limiter (src/main/utils/rateLimiter.ts). To stay well below that
 * ceiling we seed a fixed pool of 4 stopped sessions ONCE in `before()`
 * and reset their archived flags between tests via cli:archive-sessions.
 * Re-seeding per test would trip the limiter and produce flaky failures.
 */

import {
  waitForAppReady,
  navigateSidebarTo,
  invokeIPC,
  waitForSelector,
} from './helpers/app.js'

interface PersistedSession {
  sessionId: string
  cli: 'copilot' | 'claude'
  name?: string
  archived?: boolean
}

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
  await browser.pause(300)
}

async function clearPersistedSessions(): Promise<void> {
  const persisted = (await invokeIPC('cli:get-persisted-sessions')) as PersistedSession[]
  if (persisted.length === 0) return
  await invokeIPC('cli:delete-sessions', { sessionIds: persisted.map((s) => s.sessionId) })
  await browser.pause(200)
}

/**
 * Start a session, stop it immediately, and return its id. Sessions are
 * persisted on start (CLIManager.persistSession) so archive flags stick
 * after the child process exits. Counts against the 5-per-minute rate
 * limit on cli:start-session — seed sparingly.
 */
async function seedStoppedSession(name: string): Promise<string> {
  const result = (await invokeIPC('cli:start-session', {
    cli: 'copilot-cli', mode: 'interactive', name,
  })) as { sessionId?: string; error?: string } | null
  if (result && 'error' in result && result.error) {
    throw new Error(`seedStoppedSession("${name}") rate-limited: ${result.error}`)
  }
  const sessionId = result?.sessionId
  if (!sessionId) throw new Error(`failed to seed session "${name}"`)
  try { await invokeIPC('cli:stop-session', { sessionId }) } catch { /* ignore */ }
  await browser.pause(150)
  return sessionId
}

async function openSessionManager(): Promise<void> {
  await navigateSidebarTo('Sessions')
  await navigateToHash('#/work')
  await waitForSelector('[data-testid="recent-sessions-see-more"]')
  const seeMore = await $('[data-testid="recent-sessions-see-more"]')
  await seeMore.waitForClickable({ timeout: 5000 })
  await seeMore.click()
  await waitForSelector('[role="dialog"]')
  await browser.pause(400)
}

async function closeSessionManager(): Promise<void> {
  const dialog = await $('[role="dialog"]')
  if (!(await dialog.isExisting())) return
  const doneBtn = await $('//button[normalize-space()="Done"]')
  if (await doneBtn.isExisting()) {
    await doneBtn.click()
    await browser.pause(300)
  }
}

/**
 * Reset the archived flag on every session in the pool to the requested
 * state via the bulk IPC. Cheap to call — does not consume start-session
 * rate budget.
 */
async function resetPoolArchiveState(ids: string[], archived: boolean): Promise<void> {
  await invokeIPC('cli:archive-sessions', { sessionIds: ids, archived })
  await browser.pause(200)
}

describe('ClearPathAI — Session Manager bulk operations', () => {
  // Shared pool of 4 stopped sessions, seeded once. Each test resets archive
  // state before running so order-independence is preserved.
  const pool: string[] = []

  before(async () => {
    await waitForAppReady()
    await stopAllRunningSessions()
    await clearPersistedSessions()

    // Seed the pool. 4 sessions stays well under the 5/min limit and lets
    // us pair sessions for bulk operations.
    pool.push(await seedStoppedSession('bulk-pool-1'))
    pool.push(await seedStoppedSession('bulk-pool-2'))
    pool.push(await seedStoppedSession('bulk-pool-3'))
    pool.push(await seedStoppedSession('bulk-pool-4'))
  })

  beforeEach(async () => {
    await stopAllRunningSessions()
    await resetPoolArchiveState(pool, false)
  })

  afterEach(async () => {
    await closeSessionManager()
  })

  after(async () => {
    await closeSessionManager()
    await clearPersistedSessions()
  })

  describe('bulk archive on Active tab', () => {
    it('archives all selected sessions when Archive is clicked', async () => {
      await openSessionManager()

      // Active tab starts selected by default. Select the first two rows.
      const checkboxes = await $$('[role="dialog"] input[type="checkbox"]')
      expect(checkboxes.length).toBeGreaterThanOrEqual(2)
      await checkboxes[0].click()
      await checkboxes[1].click()
      await browser.pause(200)

      const archiveBtn = await $('//div[@role="dialog"]//button[normalize-space()="Archive"]')
      await archiveBtn.waitForClickable({ timeout: 5000 })
      await archiveBtn.click()

      // Expect two of the four pool sessions to flip to archived=true.
      // We do not assert which two — the modal sorts by recency and that
      // ordering depends on seed timing — only that the count is correct.
      await browser.waitUntil(
        async () => {
          const persisted = (await invokeIPC('cli:get-persisted-sessions')) as PersistedSession[]
          const inPool = persisted.filter((s) => pool.includes(s.sessionId))
          const archivedCount = inPool.filter((s) => s.archived === true).length
          return archivedCount === 2
        },
        { timeout: 5000, timeoutMsg: 'expected exactly two pool sessions to be archived' },
      )
    })

    it('moves archived rows off the Active tab and surfaces them under Archived', async () => {
      await openSessionManager()

      const checkboxes = await $$('[role="dialog"] input[type="checkbox"]')
      await checkboxes[0].click()
      const archiveBtn = await $('//div[@role="dialog"]//button[normalize-space()="Archive"]')
      await archiveBtn.click()
      await browser.pause(600)

      const archivedTab = await $('//div[@role="dialog"]//button[contains(., "Archived (")]')
      const archivedLabel = await archivedTab.getText()
      // The pool has 4 sessions; one was just archived.
      expect(archivedLabel).toContain('Archived (1)')

      const persisted = (await invokeIPC('cli:get-persisted-sessions')) as PersistedSession[]
      const archivedCount = persisted.filter((s) => pool.includes(s.sessionId) && s.archived === true).length
      expect(archivedCount).toBe(1)
    })
  })

  describe('bulk unarchive on Archived tab', () => {
    it('flips archived sessions back to active when Unarchive is clicked', async () => {
      // Pre-archive two of the pool — done via the bulk IPC, not the UI we
      // are testing, so the precondition is independent of the SUT path.
      const toArchive = pool.slice(0, 2)
      await invokeIPC('cli:archive-sessions', { sessionIds: toArchive, archived: true })
      await browser.pause(300)

      await openSessionManager()

      // Switch to Archived tab — the only place the bulk Unarchive button surfaces.
      const archivedTab = await $('//div[@role="dialog"]//button[contains(., "Archived (")]')
      await archivedTab.waitForClickable({ timeout: 5000 })
      await archivedTab.click()
      await browser.pause(300)

      const checkboxes = await $$('[role="dialog"] input[type="checkbox"]')
      expect(checkboxes.length).toBeGreaterThanOrEqual(2)
      await checkboxes[0].click()
      await checkboxes[1].click()
      await browser.pause(200)

      const unarchiveBtn = await $('//div[@role="dialog"]//button[normalize-space()="Unarchive"]')
      await unarchiveBtn.waitForClickable({ timeout: 5000 })
      await unarchiveBtn.click()

      await browser.waitUntil(
        async () => {
          const persisted = (await invokeIPC('cli:get-persisted-sessions')) as PersistedSession[]
          const inPool = persisted.filter((s) => pool.includes(s.sessionId))
          const archivedCount = inPool.filter((s) => s.archived === true).length
          return archivedCount === 0
        },
        { timeout: 5000, timeoutMsg: 'expected all pool sessions to be unarchived' },
      )
    })
  })

  describe('selection lifecycle', () => {
    it('clears the selection counter after a bulk archive completes', async () => {
      await openSessionManager()

      const cb = await $('[role="dialog"] input[type="checkbox"]')
      await cb.click()
      // Allow React state to flush before querying the rendered counter.
      await browser.pause(200)

      // Use contains(., …) — JSX renders `{selected.size} selected` as two
      // adjacent text nodes ("1" + " selected"), so contains(text(), …) only
      // sees one of them. The dot operator concatenates all descendant text.
      const counter = await $('//div[@role="dialog"]//*[contains(., "1 selected")]')
      expect(await counter.isExisting()).toBe(true)

      const archiveBtn = await $('//div[@role="dialog"]//button[normalize-space()="Archive"]')
      await archiveBtn.click()
      await browser.pause(600)

      // After the bulk action runs, the "N selected" row should be gone.
      // Use a regex against the dialog body rather than another XPath — the
      // span unmounts entirely when selected.size becomes 0.
      const dialog = await $('[role="dialog"]')
      const dialogText = await dialog.getText()
      expect(/\d+ selected/.test(dialogText)).toBe(false)
    })
  })
})
