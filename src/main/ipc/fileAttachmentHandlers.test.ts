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

// Electron is imported at module top — stub it so import doesn't blow up.
vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => null },
  shell: { openPath: vi.fn() },
}))

// Tiny limits passed directly to stagePaths so caps can be exercised with
// tiny files (the real defaults are 25 MB / 200 MB).
const TINY_LIMITS = { maxFileBytes: 100, maxSessionBytes: 250 }

import {
  stagePaths,
  buildFilesBundle,
  cleanupSessionUploads,
  sweepOrphanUploads,
  getUploadsDir,
  getUploadsRoot,
} from './fileAttachmentHandlers'

let workspace: string
let srcDir: string
const SID = 'session-aaaa'

function makeSource(name: string, content: string): string {
  const p = join(srcDir, name)
  writeFileSync(p, content)
  return p
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'cp-files-ws-'))
  srcDir = mkdtempSync(join(tmpdir(), 'cp-files-src-'))
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
  rmSync(srcDir, { recursive: true, force: true })
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
