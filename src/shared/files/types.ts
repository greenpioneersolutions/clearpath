// ── Session File Attachments — shared types ───────────────────────────────────
// Shared between main and renderer via the `rootDirs` virtual merge configured
// in tsconfig.main.json / tsconfig.renderer.json (same mechanism as
// src/shared/clearmemory/types.ts and src/shared/tokenization/types.ts).
// Must remain dependency-free (no Node, no Electron, no React imports).

/**
 * A file the user attached to a session. Unlike note attachments — which point
 * at the user's original file on disk and inline its *text* into the prompt —
 * a session file attachment is **copied into the workspace** at
 * `.clear-path/uploads/<sessionId>/` and handed to the CLI **by path**. The
 * agent reads/edits/runs it with its own file tools; we never read its bytes
 * into the prompt. That's why binaries and large files are safe here.
 */
export interface SessionFileAttachment {
  id: string
  sessionId: string
  /** Sanitized filename as stored on disk (collision-suffixed if needed). */
  name: string
  /** The filename the user originally picked, before sanitization. */
  originalName: string
  /**
   * POSIX path relative to the session's working directory — exactly what the
   * AI sees, e.g. ".clear-path/uploads/<sid>/report.pdf". Stable + portable.
   */
  relPath: string
  /** Absolute on-disk path. Main-process only; never sent to the renderer chip. */
  absPath: string
  sizeBytes: number
  /** Best-effort MIME type from the extension (e.g. "application/pdf"). */
  mime: string
  /** SHA-256 of the file bytes — used to dedupe identical re-uploads. */
  sha256: string
  addedAt: number
}

/**
 * The frozen, renderer-safe subset of a file attachment that travels on a
 * message's metadata (the in-chat audit chip + persisted messageLog). Mirrors
 * the shape used for `attachedNotes`. Names/paths only — never content, never
 * the absolute path.
 */
export interface AttachedFileRef {
  id: string
  name: string
  relPath: string
}

/** Per-file + per-session limits. Enforced server-side; mirrored read-only in UI. */
export const FILE_ATTACHMENT_LIMITS = {
  /** Max bytes for a single uploaded file (~25 MB). */
  maxFileBytes: 25 * 1024 * 1024,
  /** Max total bytes of all files staged for one session (~200 MB). */
  maxSessionBytes: 200 * 1024 * 1024,
} as const

// ── IPC payload / result shapes ───────────────────────────────────────────────

export interface PickAndStageResult {
  canceled?: boolean
  attachments: SessionFileAttachment[]
  /** Human-readable per-file rejection reasons (too large, over budget, etc.). */
  errors: string[]
  /**
   * The directory files were actually staged under (`<baseDir>/.clear-path/uploads/…`).
   * Resolved server-side via `ensureBaseDir`, so it's always concrete even when the
   * caller passed no workspace. The renderer reuses it for the matching
   * `files:get-bundle-for-prompt` call so staging and framing never disagree.
   */
  baseDir?: string
  /**
   * `true` when no usable workspace dir was supplied and staging fell back to the
   * app-managed scratch dir. Drives the non-blocking "Select a workspace →" nudge
   * so files ideally land in the user's real repo on the next session.
   */
  usedFallback?: boolean
}

export interface FilesBundleResult {
  /** Reference-only `<files>` block, or "" when fileCount === 0. */
  framedPrompt: string
  fileCount: number
}
