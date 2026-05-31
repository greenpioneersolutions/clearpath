/**
 * e2e/file-attachments.pw.spec.ts
 *
 * End-to-end coverage for session file attachments (Slice 29), driven through
 * the REAL preload bridge + main-process `fileAttachmentHandlers`.
 *
 * The focus is the mid-session-attach regression: attaching files used to work
 * at session start (the launchpad resolves a base dir via `ensureBaseDir`) but
 * hard-failed mid-session with "Select a workspace folder before attaching
 * files." whenever no workspace was selected. The fix makes both paths
 * symmetric — staging ALWAYS resolves a concrete base dir (a scratch fallback
 * when no workspace is set) and reports `usedFallback` so the UI can nudge the
 * user toward picking a real workspace.
 *
 * `files:stage-paths` is used here because — unlike `files:pick-and-stage` — it
 * takes explicit source paths and opens NO native dialog (which Playwright
 * can't drive). The IPC handlers are always registered regardless of the
 * `showFileAttachments` UI flag, so this runs in the default build.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './fixtures'
import { invokeIPC } from './helpers/pw'

type StageResult = {
  attachments: Array<{ id: string; name: string; relPath: string }>
  errors: string[]
  baseDir?: string
  usedFallback?: boolean
}

test.describe('ClearPathAI — Session file attachments (IPC)', () => {
  // A real source file + a real workspace dir. The Playwright runner and the
  // Electron main process share this machine's filesystem, so files created
  // here are the same ones the handler copies off disk by path.
  let sourcePath = ''
  let workspaceDir = ''

  test.beforeAll(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-e2e-ws-'))
    sourcePath = path.join(os.tmpdir(), `cp-e2e-src-${process.pid}.md`)
    fs.writeFileSync(sourcePath, '# attachment fixture\n')
  })

  test.afterAll(() => {
    for (const p of [sourcePath, workspaceDir]) {
      try { fs.rmSync(p, { recursive: true, force: true }) } catch { /* best effort */ }
    }
  })

  test('stages into a real workspace and reports usedFallback:false', async ({ page }) => {
    const res = await invokeIPC<StageResult>(page, 'files:stage-paths', {
      workingDirectory: workspaceDir,
      sessionId: 'e2e-files-with-ws',
      sourcePaths: [sourcePath],
    })

    expect(res.attachments).toHaveLength(1)
    expect(res.errors).toHaveLength(0)
    expect(res.usedFallback).toBe(false)
    expect(res.baseDir).toBe(workspaceDir)
    // Reference-by-path — the relPath the agent sees is workspace-relative.
    expect(res.attachments[0].relPath).toContain('.clear-path/uploads/e2e-files-with-ws/')
  })

  test('still stages WITHOUT a workspace (scratch fallback, no hard error)', async ({ page }) => {
    const res = await invokeIPC<StageResult>(page, 'files:stage-paths', {
      // The exact pre-fix failure case: no workspace selected.
      workingDirectory: undefined,
      sessionId: 'e2e-files-no-ws',
      sourcePaths: [sourcePath],
    })

    // Regression guard: the old behaviour returned 0 attachments + the
    // "workspace folder" error. The fix stages into the fallback dir instead.
    expect(res.attachments).toHaveLength(1)
    expect(res.errors).toHaveLength(0)
    expect(res.errors.join(' ')).not.toContain('workspace folder')
    expect(res.usedFallback).toBe(true)
    expect(res.baseDir).toBeTruthy()
  })

  test('cleans up its staged uploads', async ({ page }) => {
    // Remove what the two tests above staged so the workspace dir is pristine
    // for the afterAll rm (and so reruns in the same worker stay deterministic).
    await invokeIPC(page, 'files:cleanup-session', {
      workingDirectory: workspaceDir,
      sessionId: 'e2e-files-with-ws',
    })
    const list = await invokeIPC<unknown[]>(page, 'files:list-attachments', {
      workingDirectory: workspaceDir,
      sessionId: 'e2e-files-with-ws',
    })
    expect(list).toHaveLength(0)
  })
})
