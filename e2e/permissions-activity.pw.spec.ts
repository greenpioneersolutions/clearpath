/**
 * e2e/permissions-activity.pw.spec.ts
 *
 * Exercises the per-tool permission broker + session activity IPC surface
 * end-to-end through the REAL preload bridge and main-process handlers (added
 * with the permission broker feature). We assert the channels are reachable and
 * that their security guards hold — without side effects (we never open a real
 * file/URL, only check the validation rejects).
 */

import { test, expect } from './fixtures'
import { invokeIPC } from './helpers/pw'

test.describe('ClearPathAI — Permissions & activity IPC', () => {
  // ── Permission broker ───────────────────────────────────────────────────────

  test('permission:list-pending returns an array (no pending prompts at rest)', async ({ page }) => {
    const pending = await invokeIPC<unknown[]>(page, 'permission:list-pending')
    expect(Array.isArray(pending)).toBe(true)
  })

  test('permission:respond to an unknown request reports ok:false (not accepted)', async ({ page }) => {
    const res = await invokeIPC<{ ok: boolean }>(page, 'permission:respond', {
      requestId: 'no-such-request', decision: 'allow',
    })
    expect(res.ok).toBe(false)
  })

  // ── Session activity log ────────────────────────────────────────────────────

  test('activity:get-session returns [] for an unknown session', async ({ page }) => {
    const list = await invokeIPC<unknown[]>(page, 'activity:get-session', { sessionId: 'unknown-session' })
    expect(list).toEqual([])
  })

  test('activity:clear-session is a safe no-op for an unknown session', async ({ page }) => {
    const res = await invokeIPC<{ ok: boolean }>(page, 'activity:clear-session', { sessionId: 'unknown-session' })
    expect(res.ok).toBe(true)
  })

  // ── Open helpers: validation guards (no real open in CI) ─────────────────────

  test('activity:open-file refuses a non-existent path', async ({ page }) => {
    const res = await invokeIPC<{ ok: boolean }>(page, 'activity:open-file', { path: '/no/such/file-xyz.md' })
    expect(res.ok).toBe(false)
  })

  test('activity:open-url refuses a non-http(s) scheme (no shell side effect)', async ({ page }) => {
    const res = await invokeIPC<{ ok: boolean }>(page, 'activity:open-url', { url: 'file:///etc/passwd' })
    expect(res.ok).toBe(false)
  })

  test('activity:reveal-file refuses a non-existent path', async ({ page }) => {
    const res = await invokeIPC<{ ok: boolean }>(page, 'activity:reveal-file', { path: '/no/such/file-xyz.md' })
    expect(res.ok).toBe(false)
  })
})
