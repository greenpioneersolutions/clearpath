/**
 * Unit tests for fileAttachmentHandlers.ts — the session file-attachment service.
 *
 * Covers the standalone, electron-free core: stagePaths (copy + validate +
 * dedupe + collision + caps), buildFilesBundle (reference-only framing, ordering,
 * escaping), and the cleanup / orphan-sweep lifecycle. Uses a real temp workspace
 * on disk so the path-security + fs behaviour is exercised for real; only the
 * `electron` module is mocked (the module imports dialog/BrowserWindow/shell at
 * the top, none of which the core functions touch).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// `electron` resolves to src/test/electron-mock.ts via the vitest alias (see
// vitest.config.ts). We drive `dialog.showOpenDialog` and `app.getPath` directly
// off that shared mock so the handlers-under-test and the test see the SAME stubs
// (a per-file vi.mock would NOT — the alias wins, so test + source would diverge).

// Tiny limits passed directly to stagePaths so caps can be exercised with
// tiny files (the real defaults are 25 MB / 200 MB).
const TINY_LIMITS = { maxFileBytes: 100, maxSessionBytes: 250 }

import type { IpcMain } from 'electron'
import { dialog, app } from 'electron'
import {
  stagePaths,
  buildFilesBundle,
  cleanupSessionUploads,
  sweepOrphanUploads,
  ensureBaseDir,
  registerFileAttachmentHandlers,
  getUploadsDir,
  getUploadsRoot,
} from './fileAttachmentHandlers'

const mockShowOpenDialog = dialog.showOpenDialog as unknown as ReturnType<typeof vi.fn>

/** A minimal ipcMain that records `handle()` registrations so tests can invoke them. */
function makeFakeIpc() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const ipcMain = { handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn) } as unknown as IpcMain
  return {
    ipcMain,
    invoke: <T>(ch: string, args: unknown): Promise<T> =>
      Promise.resolve(handlers.get(ch)!({} as unknown, args) as T),
  }
}

let workspace: string
let srcDir: string
let scratchHome: string
const SID = 'session-aaaa'

function makeSource(name: string, content: string): string {
  const p = join(srcDir, name)
  writeFileSync(p, content)
  return p
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'cp-files-ws-'))
  srcDir = mkdtempSync(join(tmpdir(), 'cp-files-src-'))
  // The shared electron mock returns a non-writable '/mock/path' for getPath;
  // point userData at a real temp dir so ensureBaseDir's scratch fallback can mkdir.
  scratchHome = mkdtempSync(join(tmpdir(), 'cp-files-home-'))
  vi.mocked(app.getPath).mockReturnValue(scratchHome)
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
  rmSync(srcDir, { recursive: true, force: true })
  rmSync(scratchHome, { recursive: true, force: true })
  // Restore the shared mock defaults so other test files aren't affected.
  vi.mocked(app.getPath).mockReturnValue('/mock/path')
  vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
})

describe('stagePaths', () => {
  it('copies a file into .clear-path/uploads/<sessionId>/ and writes a manifest', () => {
    const src = makeSource('report.md', '# hello')
    const res = stagePaths(workspace, SID, [src])

    expect(res.errors).toEqual([])
    expect(res.attachments).toHaveLength(1)
    const att = res.attachments[0]
    expect(att.name).toBe('report.md')
    expect(att.relPath).toBe(`.clear-path/uploads/${SID}/report.md`)

    const dir = getUploadsDir(workspace, SID)
    expect(existsSync(join(dir, 'report.md'))).toBe(true)
    expect(existsSync(join(dir, 'manifest.json'))).toBe(true)
  })

  it('rejects a file over the per-file size cap', () => {
    const src = makeSource('big.txt', 'x'.repeat(150)) // > 100-byte cap
    const res = stagePaths(workspace, SID, [src], TINY_LIMITS)
    expect(res.attachments).toHaveLength(0)
    expect(res.errors[0]).toMatch(/too large/)
  })

  it('rejects files that exceed the per-session budget', () => {
    const a = makeSource('a.txt', 'a'.repeat(90))
    const b = makeSource('b.txt', 'b'.repeat(90))
    const c = makeSource('c.txt', 'c'.repeat(90)) // 270 > 250 budget on the 3rd
    const res = stagePaths(workspace, SID, [a, b, c], TINY_LIMITS)
    expect(res.attachments).toHaveLength(2)
    expect(res.errors.some((e) => /per-session limit/.test(e))).toBe(true)
  })

  it('dedupes identical content by sha256', () => {
    const a = makeSource('one.txt', 'same-bytes')
    const b = makeSource('two.txt', 'same-bytes')
    const res = stagePaths(workspace, SID, [a, b])
    expect(res.attachments).toHaveLength(1)
    expect(res.errors.some((e) => /already attached/.test(e))).toBe(true)
  })

  it('collision-suffixes two different files with the same name', () => {
    const a = makeSource('dup.txt', 'first')
    // second source in a different dir, same basename, different content
    const otherDir = mkdtempSync(join(tmpdir(), 'cp-files-src2-'))
    const b = join(otherDir, 'dup.txt')
    writeFileSync(b, 'second')
    const res = stagePaths(workspace, SID, [a, b])
    expect(res.attachments).toHaveLength(2)
    const names = res.attachments.map((x) => x.name).sort()
    expect(names).toEqual(['dup (2).txt', 'dup.txt'])
    rmSync(otherDir, { recursive: true, force: true })
  })

  it('returns a friendly error when no working directory is set', () => {
    const res = stagePaths('', SID, ['/whatever'])
    expect(res.attachments).toHaveLength(0)
    expect(res.errors[0]).toMatch(/workspace folder/)
  })
})

describe('buildFilesBundle', () => {
  it('emits a reference-only <files> block with paths, never content', () => {
    const src = makeSource('spec.md', 'SECRET-CONTENT-SHOULD-NOT-APPEAR')
    const { attachments } = stagePaths(workspace, SID, [src])
    const bundle = buildFilesBundle(workspace, SID, [attachments[0].id])

    expect(bundle.fileCount).toBe(1)
    expect(bundle.framedPrompt).toContain('<files count="1">')
    expect(bundle.framedPrompt).toContain(`path=".clear-path/uploads/${SID}/spec.md"`)
    // The whole point: file CONTENT is never inlined.
    expect(bundle.framedPrompt).not.toContain('SECRET-CONTENT-SHOULD-NOT-APPEAR')
  })

  it('orders files deterministically by id regardless of input order', () => {
    const a = makeSource('a.txt', 'aaa')
    const b = makeSource('b.txt', 'bbb')
    const { attachments } = stagePaths(workspace, SID, [a, b])
    const ids = attachments.map((x) => x.id)
    const forward = buildFilesBundle(workspace, SID, ids).framedPrompt
    const reversed = buildFilesBundle(workspace, SID, [...ids].reverse()).framedPrompt
    expect(forward).toBe(reversed)
  })

  it('returns an empty framedPrompt for an empty selection', () => {
    expect(buildFilesBundle(workspace, SID, [])).toEqual({ framedPrompt: '', fileCount: 0 })
  })

  it('XML-escapes attribute values', () => {
    const otherDir = mkdtempSync(join(tmpdir(), 'cp-files-esc-'))
    const p = join(otherDir, 'a&b<c>.txt')
    writeFileSync(p, 'x')
    const { attachments } = stagePaths(workspace, SID, [p])
    const bundle = buildFilesBundle(workspace, SID, [attachments[0].id])
    expect(bundle.framedPrompt).toContain('&amp;')
    expect(bundle.framedPrompt).not.toMatch(/name="a&b<c>/)
    rmSync(otherDir, { recursive: true, force: true })
  })
})

describe('ensureBaseDir', () => {
  it('returns the preferred workspace dir when it exists (the common case)', () => {
    expect(ensureBaseDir(workspace)).toBe(workspace)
  })

  it('falls back to a concrete, writable scratch dir when no workspace is given', () => {
    // This is the safety net that lets mid-session attach work without a
    // workspace — it must never return an empty string.
    const dir = ensureBaseDir(undefined)
    expect(dir).toBeTruthy()
    expect(existsSync(dir)).toBe(true)
    expect(dir).not.toBe(workspace)
  })

  it('falls back when the preferred dir does not exist on disk', () => {
    const ghost = join(tmpdir(), 'cp-does-not-exist-xyz')
    expect(ensureBaseDir(ghost)).not.toBe(ghost)
  })
})

describe('cleanupSessionUploads', () => {
  it('removes the session upload directory', () => {
    stagePaths(workspace, SID, [makeSource('f.txt', 'hi')])
    const dir = getUploadsDir(workspace, SID)
    expect(existsSync(dir)).toBe(true)
    cleanupSessionUploads(workspace, SID)
    expect(existsSync(dir)).toBe(false)
  })

  it('is a no-op for an empty working directory', () => {
    expect(() => cleanupSessionUploads('', SID)).not.toThrow()
  })
})

describe('sweepOrphanUploads', () => {
  it('removes upload dirs whose session id is not live, keeps live ones', () => {
    stagePaths(workspace, 'live-1', [makeSource('a.txt', 'a')])
    stagePaths(workspace, 'orphan-1', [makeSource('b.txt', 'b')])

    const removed = sweepOrphanUploads(workspace, ['live-1'])
    expect(removed).toBe(1)
    expect(existsSync(getUploadsDir(workspace, 'live-1'))).toBe(true)
    expect(existsSync(getUploadsDir(workspace, 'orphan-1'))).toBe(false)
  })

  it('returns 0 when the uploads root does not exist', () => {
    expect(sweepOrphanUploads(workspace, [])).toBe(0)
  })
})

// The mid-session attach path used to hard-fail with "Select a workspace folder
// before attaching files." whenever no workspace was selected — even though the
// at-start launchpad path silently fell back via ensureBaseDir. These tests pin
// the fixed, symmetric behaviour: it ALWAYS stages, and reports `usedFallback`
// + the concrete `baseDir` so the renderer can pin the session + nudge the user.
describe('files:pick-and-stage handler', () => {
  beforeEach(() => { mockShowOpenDialog.mockReset() })

  it('stages into the workspace and reports usedFallback:false when a workspace is set', async () => {
    const src = makeSource('notes.md', '# hi')
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [src] })
    const { ipcMain, invoke } = makeFakeIpc()
    registerFileAttachmentHandlers(ipcMain, () => [])

    const res = await invoke<{ attachments: unknown[]; errors: string[]; baseDir?: string; usedFallback?: boolean }>(
      'files:pick-and-stage', { workingDirectory: workspace, sessionId: SID },
    )
    expect(res.attachments).toHaveLength(1)
    expect(res.errors).toHaveLength(0)
    expect(res.usedFallback).toBe(false)
    expect(res.baseDir).toBe(workspace)
    expect(existsSync(getUploadsDir(workspace, SID))).toBe(true)
  })

  it('still stages (no hard error) and reports usedFallback:true when NO workspace is set', async () => {
    const src = makeSource('mid.md', 'x')
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [src] })
    const { ipcMain, invoke } = makeFakeIpc()
    registerFileAttachmentHandlers(ipcMain, () => [])

    const res = await invoke<{ attachments: unknown[]; errors: string[]; baseDir?: string; usedFallback?: boolean }>(
      'files:pick-and-stage', { workingDirectory: undefined, sessionId: SID },
    )
    // The old behaviour returned zero attachments + a "workspace folder" error.
    expect(res.attachments).toHaveLength(1)
    expect(res.errors).toHaveLength(0)
    expect(res.errors.join(' ')).not.toMatch(/workspace folder/)
    expect(res.usedFallback).toBe(true)
    expect(res.baseDir).toBeTruthy()
    // Files landed under the resolved fallback base dir, not nowhere.
    expect(existsSync(getUploadsDir(res.baseDir as string, SID))).toBe(true)
  })

  it('returns canceled with baseDir + usedFallback when the picker is dismissed', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    const { ipcMain, invoke } = makeFakeIpc()
    registerFileAttachmentHandlers(ipcMain, () => [])

    const res = await invoke<{ canceled?: boolean; baseDir?: string; usedFallback?: boolean }>(
      'files:pick-and-stage', { workingDirectory: workspace, sessionId: SID },
    )
    expect(res.canceled).toBe(true)
    expect(res.baseDir).toBe(workspace)
    expect(res.usedFallback).toBe(false)
  })
})

describe('files:stage-paths handler', () => {
  it('returns the resolved baseDir + usedFallback alongside the staged files', async () => {
    const src = makeSource('launch.md', 'y')
    const { ipcMain, invoke } = makeFakeIpc()
    registerFileAttachmentHandlers(ipcMain, () => [])

    const res = await invoke<{ attachments: unknown[]; baseDir?: string; usedFallback?: boolean }>(
      'files:stage-paths', { workingDirectory: workspace, sessionId: SID, sourcePaths: [src] },
    )
    expect(res.attachments).toHaveLength(1)
    expect(res.baseDir).toBe(workspace)
    expect(res.usedFallback).toBe(false)
  })
})
