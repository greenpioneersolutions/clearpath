/**
 * e2e/session-manager.pw.spec.ts
 *
 * E2E coverage for the SessionManager modal — specifically bulk operations
 * (archive / unarchive). The Sessions modal is opened from the Sessions
 * launchpad's "See more →" link in RecentSessionsCard. Persisted sessions
 * are seeded by spinning up real sessions via cli:start-session, then
 * stopping them so they show up in the modal's Active list.
 *
 * NOTE on rate limits: cli:start-session is capped at 5/minute by the IPC
 * rate limiter (src/main/utils/rateLimiter.ts). To stay well below that
 * ceiling we seed a fixed pool of 4 stopped sessions ONCE in `test.beforeAll()`
 * and reset their archived flags between tests via cli:archive-sessions.
 * Re-seeding per test would trip the limiter and produce flaky failures.
 */

import { test, expect, type Page } from './fixtures'
import {
  navigateSidebarTo,
  navigateToHash,
  invokeIPC,
  waitForSelector,
} from './helpers/pw'

interface PersistedSession {
  sessionId: string
  cli: 'copilot' | 'claude'
  name?: string
  archived?: boolean
}

async function stopAllRunningSessions(page: Page): Promise<void> {
  const sessions = (await invokeIPC(page, 'cli:list-sessions')) as Array<{ sessionId: string; status: string }>
  for (const s of sessions.filter((x) => x.status === 'running')) {
    try { await invokeIPC(page, 'cli:stop-session', { sessionId: s.sessionId }) } catch { /* ignore */ }
  }
  await page.waitForTimeout(300)
}

async function clearPersistedSessions(page: Page): Promise<void> {
  const persisted = (await invokeIPC(page, 'cli:get-persisted-sessions')) as PersistedSession[]
  if (persisted.length === 0) return
  await invokeIPC(page, 'cli:delete-sessions', { sessionIds: persisted.map((s) => s.sessionId) })
  await page.waitForTimeout(200)
}

/**
 * Start a session, stop it immediately, and return its id. Sessions are
 * persisted on start (CLIManager.persistSession) so archive flags stick
 * after the child process exits. Counts against the 5-per-minute rate
 * limit on cli:start-session — seed sparingly.
 */
async function seedStoppedSession(page: Page, name: string): Promise<string> {
  const result = (await invokeIPC(page, 'cli:start-session', {
    cli: 'copilot-cli', mode: 'interactive', name,
  })) as { sessionId?: string; error?: string } | null
  if (result && 'error' in result && result.error) {
    throw new Error(`seedStoppedSession("${name}") rate-limited: ${result.error}`)
  }
  const sessionId = result?.sessionId
  if (!sessionId) throw new Error(`failed to seed session "${name}"`)
  try { await invokeIPC(page, 'cli:stop-session', { sessionId }) } catch { /* ignore */ }
  await page.waitForTimeout(150)
  return sessionId
}

async function openSessionManager(page: Page): Promise<void> {
  await navigateSidebarTo(page, 'Sessions')
  await navigateToHash(page, '#/work')
  await waitForSelector(page, '[data-testid="recent-sessions-see-more"]')
  const seeMore = page.locator('[data-testid="recent-sessions-see-more"]')
  await seeMore.click()
  await waitForSelector(page, '[role="dialog"]')
  await page.waitForTimeout(400)
}

async function closeSessionManager(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"]')
  if ((await dialog.count()) === 0) return
  // Footer button is `aria-label="Close session manager"` with text "Done";
  // header has an aria-label="Close" "X" button. Either works.
  const doneBtn = page.getByRole('button', { name: 'Close session manager' }).first()
  if ((await doneBtn.count()) > 0) {
    await doneBtn.click({ force: true }).catch(() => { /* dialog may already be closing */ })
    await page.waitForTimeout(300)
  }
  // Best-effort: if dialog is still open, hit Escape.
  if ((await dialog.count()) > 0) {
    await page.keyboard.press('Escape').catch(() => { /* ignore */ })
    await page.waitForTimeout(300)
  }
}

/**
 * Reset the archived flag on every session in the pool to the requested
 * state via the bulk IPC. Cheap to call — does not consume start-session
 * rate budget.
 */
async function resetPoolArchiveState(page: Page, ids: string[], archived: boolean): Promise<void> {
  await invokeIPC(page, 'cli:archive-sessions', { sessionIds: ids, archived })
  await page.waitForTimeout(200)
}

/**
 * Poll the persisted-sessions IPC until `predicate(sessions)` returns true.
 * Replacement for browser-side waitForFunction — invokeIPC must run in
 * Node context, so we poll from the test runner side.
 */
async function waitForPersistedState(
  page: Page,
  predicate: (sessions: PersistedSession[]) => boolean,
  timeoutMs = 5000,
  intervalMs = 250,
  message = 'persisted sessions did not match predicate',
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const persisted = (await invokeIPC(page, 'cli:get-persisted-sessions')) as PersistedSession[]
    if (predicate(persisted)) return
    await page.waitForTimeout(intervalMs)
  }
  throw new Error(`Timed out after ${timeoutMs}ms: ${message}`)
}

test.describe('ClearPathAI — Session Manager bulk operations', () => {
  // Shared pool of 4 stopped sessions, seeded once. Each test resets archive
  // state before running so order-independence is preserved.
  const pool: string[] = []

  test.beforeAll(async ({ electronApp }) => {
    // Get the first window for setup work
    const setupPage = await electronApp.firstWindow()
    await setupPage.locator('#root').waitFor({ state: 'attached', timeout: 20_000 })
    await stopAllRunningSessions(setupPage)
    await clearPersistedSessions(setupPage)

    // Seed the pool. 4 sessions stays well under the 5/min limit and lets
    // us pair sessions for bulk operations.
    pool.push(await seedStoppedSession(setupPage, 'bulk-pool-1'))
    pool.push(await seedStoppedSession(setupPage, 'bulk-pool-2'))
    pool.push(await seedStoppedSession(setupPage, 'bulk-pool-3'))
    pool.push(await seedStoppedSession(setupPage, 'bulk-pool-4'))
  })

  test.beforeEach(async ({ page }) => {
    await stopAllRunningSessions(page)
    await resetPoolArchiveState(page, pool, false)
  })

  test.afterEach(async ({ page }) => {
    await closeSessionManager(page)
  })

  test.afterAll(async ({ electronApp }) => {
    const teardownPage = await electronApp.firstWindow()
    await closeSessionManager(teardownPage)
    await clearPersistedSessions(teardownPage)
  })

  test.describe('bulk archive on Active tab', () => {
    test('archives all selected sessions when Archive is clicked', async ({ page }) => {
      await openSessionManager(page)

      // Active tab starts selected by default. Select the first two rows.
      const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]')
      expect(await checkboxes.count()).toBeGreaterThanOrEqual(2)
      await checkboxes.nth(0).click()
      await checkboxes.nth(1).click()
      await page.waitForTimeout(200)

      const archiveBtn = page
        .locator('//div[@role="dialog"]//button[normalize-space()="Archive"]')
        .first()
      await archiveBtn.click()

      // Expect two of the four pool sessions to flip to archived=true.
      // We do not assert which two — the modal sorts by recency and that
      // ordering depends on seed timing — only that the count is correct.
      await waitForPersistedState(
        page,
        (persisted) =>
          persisted.filter((s) => pool.includes(s.sessionId) && s.archived === true).length === 2,
        5000,
        250,
        'expected exactly two pool sessions to be archived',
      )
    })

    test('moves archived rows off the Active tab and surfaces them under Archived', async ({ page }) => {
      await openSessionManager(page)

      const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]')
      await checkboxes.nth(0).click()
      const archiveBtn = page
        .locator('//div[@role="dialog"]//button[normalize-space()="Archive"]')
        .first()
      await archiveBtn.click()
      await page.waitForTimeout(600)

      const archivedTab = page
        .locator('//div[@role="dialog"]//button[contains(., "Archived (")]')
        .first()
      const archivedLabel = (await archivedTab.textContent()) ?? ''
      // The pool has 4 sessions; one was just archived.
      expect(archivedLabel).toContain('Archived (1)')

      const persisted = (await invokeIPC(page, 'cli:get-persisted-sessions')) as PersistedSession[]
      const archivedCount = persisted.filter((s) => pool.includes(s.sessionId) && s.archived === true).length
      expect(archivedCount).toBe(1)
    })
  })

  test.describe('bulk unarchive on Archived tab', () => {
    test('flips archived sessions back to active when Unarchive is clicked', async ({ page }) => {
      // Pre-archive two of the pool — done via the bulk IPC, not the UI we
      // are testing, so the precondition is independent of the SUT path.
      const toArchive = pool.slice(0, 2)
      await invokeIPC(page, 'cli:archive-sessions', { sessionIds: toArchive, archived: true })
      await page.waitForTimeout(300)

      await openSessionManager(page)

      // Switch to Archived tab — the only place the bulk Unarchive button surfaces.
      const archivedTab = page
        .locator('//div[@role="dialog"]//button[contains(., "Archived (")]')
        .first()
      await archivedTab.click()
      await page.waitForTimeout(300)

      const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]')
      expect(await checkboxes.count()).toBeGreaterThanOrEqual(2)
      await checkboxes.nth(0).click()
      await checkboxes.nth(1).click()
      await page.waitForTimeout(200)

      const unarchiveBtn = page
        .locator('//div[@role="dialog"]//button[normalize-space()="Unarchive"]')
        .first()
      await unarchiveBtn.click()

      await waitForPersistedState(
        page,
        (persisted) =>
          persisted.filter((s) => pool.includes(s.sessionId) && s.archived === true).length === 0,
        5000,
        250,
        'expected all pool sessions to be unarchived',
      )
    })
  })

  test.describe('selection lifecycle', () => {
    test('clears the selection counter after a bulk archive completes', async ({ page }) => {
      await openSessionManager(page)

      const cb = page.locator('[role="dialog"] input[type="checkbox"]').first()
      await cb.click()
      // Allow React state to flush before querying the rendered counter.
      await page.waitForTimeout(200)

      // Use contains(., …) — JSX renders `{selected.size} selected` as two
      // adjacent text nodes ("1" + " selected"), so contains(text(), …) only
      // sees one of them. The dot operator concatenates all descendant text.
      const counter = page.locator('//div[@role="dialog"]//*[contains(., "1 selected")]')
      expect(await counter.count()).toBeGreaterThan(0)

      const archiveBtn = page
        .locator('//div[@role="dialog"]//button[normalize-space()="Archive"]')
        .first()
      await archiveBtn.click()
      await page.waitForTimeout(600)

      // After the bulk action runs, the "N selected" row should be gone.
      // Use a regex against the dialog body rather than another XPath — the
      // span unmounts entirely when selected.size becomes 0.
      const dialog = page.locator('[role="dialog"]')
      const dialogText = (await dialog.textContent()) ?? ''
      expect(/\d+ selected/.test(dialogText)).toBe(false)
    })
  })
})
