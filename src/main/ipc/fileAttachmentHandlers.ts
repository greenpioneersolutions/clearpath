import type { IpcMain } from 'electron'
import { dialog, BrowserWindow, shell } from 'electron'
import { randomUUID, createHash } from 'crypto'
import {
  readFileSync, writeFileSync, existsSync, statSync,
  mkdirSync, readdirSync, copyFileSync, rmSync, unlinkSync, renameSync,
} from 'fs'
import { join, basename, extname } from 'path'
import { assertPathWithinRoots, isSensitiveSystemPath } from '../utils/pathSecurity'
import {
  FILE_ATTACHMENT_LIMITS,
  type SessionFileAttachment,
  type PickAndStageResult,
  type FilesBundleResult,
} from '../../shared/files/types'

// ── Storage layout ─────────────────────────────────────────────────────────────
//
// Files attached to a session are COPIED into the workspace so the CLI can reach
// them by path with no extra permissions. Mirrors the knowledge-base layout
// (`.clear-path/knowledge-base/`). `.clear-path/` is already gitignored.
//
//   <workingDirectory>/.clear-path/uploads/<sessionId>/<file>
//   <workingDirectory>/.clear-path/uploads/<sessionId>/manifest.json
//
// The manifest lives *inside* the session's upload dir so it is self-describing
// and travels with the workspace — no separate electron-store index to keep in
// sync. It is the source of truth for what's staged for a session.

const MANIFEST_NAME = 'manifest.json'

export function getUploadsRoot(workingDirectory: string): string {
  return join(workingDirectory, '.clear-path', 'uploads')
}

export function getUploadsDir(workingDirectory: string, sessionId: string): string {
  return join(getUploadsRoot(workingDirectory), sanitizeSegment(sessionId))
}

function manifestPath(workingDirectory: string, sessionId: string): string {
  return join(getUploadsDir(workingDirectory, sessionId), MANIFEST_NAME)
}

function readManifest(workingDirectory: string, sessionId: string): SessionFileAttachment[] {
  const p = manifestPath(workingDirectory, sessionId)
  if (!existsSync(p)) return []
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'))
    return Array.isArray(parsed) ? (parsed as SessionFileAttachment[]) : []
  } catch {
    // Corrupted manifest — treat as empty rather than throwing to the renderer.
    return []
  }
}

function writeManifest(workingDirectory: string, sessionId: string, list: SessionFileAttachment[]): void {
  const dir = getUploadsDir(workingDirectory, sessionId)
  mkdirSync(dir, { recursive: true })
  // Atomic write: tmp + rename so a crash mid-write never leaves a half-file.
  const final = manifestPath(workingDirectory, sessionId)
  const tmp = `${final}.tmp`
  writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8')
  renameSync(tmp, final)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Strip anything that could traverse or break a single path segment. */
function sanitizeSegment(value: string): string {
  return value.replace(/[/\\]/g, '').replace(/\.\.+/g, '.').trim() || 'file'
}

/** Sanitize a user-picked filename: drop directories, control chars, leading dots. */
function sanitizeFilename(name: string): string {
  // basename() removes any directory portion. We then strip path separators and
  // control chars but KEEP normal filename chars (spaces, dashes, parens, dots).
  // Finally drop leading dots so we never create a hidden file, and bound length.
  let out = ""
  for (const ch of basename(name)) {
    const code = ch.charCodeAt(0)
    if (code < 32) continue
    if (ch === "/" || ch === "\\") continue
    out += ch
  }
  out = out.replace(/^\.+/, "").trim()
  return (out || "file").slice(0, 200)
}

/** Resolve a non-colliding filename within `dir`, suffixing " (2)", " (3)"… */
function uniqueFilename(dir: string, name: string, taken: Set<string>): string {
  if (!existsSync(join(dir, name)) && !taken.has(name)) return name
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!existsSync(join(dir, candidate)) && !taken.has(candidate)) return candidate
  }
  // Pathological fallback — unique by random suffix.
  return `${stem}-${randomUUID().slice(0, 8)}${ext}`
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`
  return `${(n / (1024 * 1024)).toFixed(1)}MB`
}

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.json': 'application/json',
  '.md': 'text/markdown', '.txt': 'text/plain', '.html': 'text/html', '.xml': 'application/xml',
  '.yaml': 'application/yaml', '.yml': 'application/yaml', '.zip': 'application/zip',
  '.js': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function mimeFromName(name: string): string {
  return MIME_BY_EXT[extname(name).toLowerCase()] ?? 'application/octet-stream'
}

/** Escape for safe inclusion in a double-quoted XML attribute (mirror noteHandlers). */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ── Standalone ops (also used directly by the session-delete hook) ──────────────

/** Remove a single session's entire upload directory. Best-effort, never throws. */
export function cleanupSessionUploads(workingDirectory: string, sessionId: string): void {
  if (!workingDirectory) return
  try {
    const dir = getUploadsDir(workingDirectory, sessionId)
    // Defence in depth: only ever remove paths inside the uploads root.
    assertPathWithinRoots(dir, [getUploadsRoot(workingDirectory)])
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  } catch {
    /* best effort — a failed cleanup is reclaimed by the orphan sweep */
  }
}

/**
 * Remove upload directories whose session id is no longer live. Guards against
 * crashes / manual session-store edits that skipped the delete hook.
 */
export function sweepOrphanUploads(workingDirectory: string, liveSessionIds: string[]): number {
  if (!workingDirectory) return 0
  const root = getUploadsRoot(workingDirectory)
  if (!existsSync(root)) return 0
  const live = new Set(liveSessionIds)
  let removed = 0
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (live.has(entry.name)) continue
      try {
        rmSync(join(root, entry.name), { recursive: true, force: true })
        removed++
      } catch { /* skip */ }
    }
  } catch { /* root unreadable — nothing to do */ }
  return removed
}

/**
 * Copy a set of source files into a session's uploads dir, with validation,
 * dedupe, collision-safe naming, and manifest update. Shared by the launchpad
 * (stage-at-launch into the resolved workspace dir) and mid-session attach.
 * Never throws — per-file failures are returned as `errors`.
 */
export function stagePaths(
  workingDirectory: string,
  sessionId: string,
  sourcePaths: string[],
  limits: { maxFileBytes: number; maxSessionBytes: number } = FILE_ATTACHMENT_LIMITS,
): PickAndStageResult {
  if (!workingDirectory) {
    return { attachments: [], errors: ['Select a workspace folder before attaching files.'] }
  }

  const dir = getUploadsDir(workingDirectory, sessionId)
  mkdirSync(dir, { recursive: true })

  const manifest = readManifest(workingDirectory, sessionId)
  const attachments: SessionFileAttachment[] = []
  const errors: string[] = []
  const takenThisBatch = new Set<string>()
  let sessionBytes = manifest.reduce((sum, a) => sum + a.sizeBytes, 0)

  for (const srcPath of sourcePaths) {
    const display = basename(srcPath)
    try {
      if (isSensitiveSystemPath(srcPath)) {
        errors.push(`${display}: access denied — sensitive system path`)
        continue
      }
      const stat = statSync(srcPath)
      if (!stat.isFile()) { errors.push(`${display}: not a file`); continue }
      if (stat.size > limits.maxFileBytes) {
        errors.push(`${display}: too large (${humanBytes(stat.size)}, max ${humanBytes(limits.maxFileBytes)})`)
        continue
      }
      if (sessionBytes + stat.size > limits.maxSessionBytes) {
        errors.push(`${display}: would exceed the ${humanBytes(limits.maxSessionBytes)} per-session limit`)
        continue
      }

      const bytes = readFileSync(srcPath)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (manifest.some((a) => a.sha256 === sha256)) {
        errors.push(`${display}: already attached (skipped duplicate)`)
        continue
      }

      const safeName = uniqueFilename(dir, sanitizeFilename(display), takenThisBatch)
      takenThisBatch.add(safeName)
      const absPath = join(dir, safeName)
      assertPathWithinRoots(absPath, [dir]) // destination must stay inside uploads dir
      copyFileSync(srcPath, absPath)

      const att: SessionFileAttachment = {
        id: randomUUID(),
        sessionId,
        name: safeName,
        originalName: display,
        relPath: ['.clear-path', 'uploads', sessionId, safeName].join('/'),
        absPath,
        sizeBytes: stat.size,
        mime: mimeFromName(safeName),
        sha256,
        addedAt: Date.now(),
      }
      manifest.push(att)
      attachments.push(att)
      sessionBytes += stat.size
    } catch {
      errors.push(`${display}: could not stage file`)
    }
  }

  if (attachments.length > 0) writeManifest(workingDirectory, sessionId, manifest)
  return { attachments, errors }
}

/**
 * Build the reference-only `<files>` framing block for a set of attached file
 * ids. Reads the session manifest, selects the requested ids, orders them
 * deterministically (by id) for prompt-cache stability, and emits PATHS ONLY —
 * never file content. Returns `{ framedPrompt: '', fileCount: 0 }` for an empty
 * selection so the caller can skip prepending.
 */
export function buildFilesBundle(
  workingDirectory: string,
  sessionId: string,
  ids: string[],
): FilesBundleResult {
  if (!workingDirectory) return { framedPrompt: '', fileCount: 0 }
  const manifest = readManifest(workingDirectory, sessionId)
  const selected = (ids ?? [])
    .map((id) => manifest.find((a) => a.id === id))
    .filter((a): a is SessionFileAttachment => Boolean(a))
    .sort((a, b) => a.id.localeCompare(b.id))

  if (selected.length === 0) return { framedPrompt: '', fileCount: 0 }

  const fileTags = selected.map((f) =>
    `  <file name="${escapeAttr(f.name)}" path="${escapeAttr(f.relPath)}" size="${humanBytes(f.sizeBytes)}" type="${escapeAttr(f.mime)}"/>`,
  )

  const preamble =
    'The user uploaded the following files into this project. They are real ' +
    'files on disk at the paths below. Read them with your file tools when ' +
    'relevant — do not guess their contents. You may edit or run them as the ' +
    'task requires.'

  const framedPrompt =
    `${preamble}\n\n<files count="${selected.length}">\n${fileTags.join('\n')}\n</files>`

  return { framedPrompt, fileCount: selected.length }
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * @param getLiveSessionIds returns the ids of sessions that still exist, so the
 *   orphan sweep can decide what to reclaim. Wired to `CLIManager.getPersistedSessions()`.
 */
export function registerFileAttachmentHandlers(
  ipcMain: IpcMain,
  getLiveSessionIds: () => string[],
): void {

  // Open the native file dialog and return the chosen SOURCE paths only — no
  // copy yet. The launchpad uses this so the user can pick files before the
  // session (and its working directory + id) exist; the actual copy happens at
  // launch via `files:stage-paths` once the workspace dir is resolved.
  ipcMain.handle('files:pick', async (): Promise<{ canceled?: boolean; files: Array<{ sourcePath: string; name: string; sizeBytes: number }> }> => {
    const win = BrowserWindow.getFocusedWindow()
    const dialogOpts = {
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'All Files', extensions: ['*'] }],
    }
    const result = await (win ? dialog.showOpenDialog(win, dialogOpts) : dialog.showOpenDialog(dialogOpts))
    if (result.canceled || result.filePaths.length === 0) return { canceled: true, files: [] }
    const files = result.filePaths.map((sourcePath) => {
      let sizeBytes = 0
      try { sizeBytes = statSync(sourcePath).size } catch { /* ignore */ }
      return { sourcePath, name: basename(sourcePath), sizeBytes }
    })
    return { files }
  })

  // Copy already-picked source paths into a session's uploads dir.
  ipcMain.handle('files:stage-paths', (_e, args: { workingDirectory?: string; sessionId: string; sourcePaths: string[] }): PickAndStageResult => {
    if (!args.workingDirectory) return { attachments: [], errors: ['Select a workspace folder before attaching files.'] }
    return stagePaths(args.workingDirectory, args.sessionId, args.sourcePaths ?? [])
  })

  // Convenience for mid-session attach (existing session → cwd + id are known):
  // pick + copy in one round-trip.
  ipcMain.handle('files:pick-and-stage', async (_e, args: { workingDirectory?: string; sessionId: string }): Promise<PickAndStageResult> => {
    if (!args.workingDirectory) return { attachments: [], errors: ['Select a workspace folder before attaching files.'] }
    const win = BrowserWindow.getFocusedWindow()
    const dialogOpts = {
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'All Files', extensions: ['*'] }],
    }
    const result = await (win ? dialog.showOpenDialog(win, dialogOpts) : dialog.showOpenDialog(dialogOpts))
    if (result.canceled || result.filePaths.length === 0) return { canceled: true, attachments: [], errors: [] }
    return stagePaths(args.workingDirectory, args.sessionId, result.filePaths)
  })

  // List files staged for a session.
  // NB: channel is 'files:list-attachments' (not 'files:list') to avoid colliding
  // with the File Explorer handler in fileExplorerHandlers.ts, which owns 'files:list'.
  ipcMain.handle('files:list-attachments', (_e, args: { workingDirectory?: string; sessionId: string }): SessionFileAttachment[] => {
    if (!args.workingDirectory) return []
    return readManifest(args.workingDirectory, args.sessionId)
  })

  // Remove one staged file (delete bytes + manifest entry).
  ipcMain.handle('files:remove', (_e, args: { workingDirectory?: string; sessionId: string; id: string }): { ok: boolean } => {
    if (!args.workingDirectory) return { ok: false }
    const manifest = readManifest(args.workingDirectory, args.sessionId)
    const target = manifest.find((a) => a.id === args.id)
    if (!target) return { ok: false }
    try {
      // Only ever unlink inside the uploads dir.
      assertPathWithinRoots(target.absPath, [getUploadsDir(args.workingDirectory, args.sessionId)])
      if (existsSync(target.absPath)) unlinkSync(target.absPath)
    } catch { /* file already gone — fall through to drop the manifest row */ }
    writeManifest(args.workingDirectory, args.sessionId, manifest.filter((a) => a.id !== args.id))
    return { ok: true }
  })

  // Build the reference-only framing block for a set of attached files.
  //
  // KEY DIFFERENCE FROM NOTES: notes:get-bundle-for-prompt inlines file *text*.
  // This emits PATHS ONLY — the agent reads/edits/runs the real files with its
  // own tools. No file content ever enters the prompt, so binaries + large files
  // are safe. Deterministic ordering by id keeps the prompt-cache prefix stable.
  ipcMain.handle('files:get-bundle-for-prompt', (_e, args: { workingDirectory?: string; sessionId: string; ids: string[] }): FilesBundleResult => {
    return buildFilesBundle(args.workingDirectory ?? '', args.sessionId, args.ids ?? [])
  })

  // Open the session's uploads folder in the OS file manager.
  ipcMain.handle('files:open-folder', async (_e, args: { workingDirectory?: string; sessionId: string }): Promise<{ ok: boolean }> => {
    if (!args.workingDirectory) return { ok: false }
    const dir = getUploadsDir(args.workingDirectory, args.sessionId)
    if (!existsSync(dir)) return { ok: false }
    await shell.openPath(dir)
    return { ok: true }
  })

  // Remove a single session's uploads (called by the session-delete flow).
  ipcMain.handle('files:cleanup-session', (_e, args: { workingDirectory?: string; sessionId: string }): { ok: boolean } => {
    if (!args.workingDirectory) return { ok: false }
    cleanupSessionUploads(args.workingDirectory, args.sessionId)
    return { ok: true }
  })

  // Reclaim upload dirs with no matching live session (startup / workspace switch).
  ipcMain.handle('files:sweep-orphans', (_e, args: { workingDirectory?: string }): { removed: number } => {
    if (!args.workingDirectory) return { removed: 0 }
    return { removed: sweepOrphanUploads(args.workingDirectory, getLiveSessionIds()) }
  })
}
