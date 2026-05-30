import type { Middleware } from './pipeline'

/**
 * Whitespace cleanup that preserves code-fence content byte-for-byte. The
 * scanner tracks whether the current line is inside a ``` fenced block — when
 * inside, we emit the line untouched. Outside, we:
 *
 *   - rtrim trailing whitespace
 *   - collapse runs of 3+ blank lines down to 2
 *   - drop a line if it's a non-empty duplicate of the immediately prior line
 *
 * The dedup rule targets the common case of copy-pasted log lines like
 * `at Object.<anonymous>` repeating verbatim. It intentionally only looks at
 * the IMMEDIATELY previous line — anything more aggressive risks eating real
 * content (e.g. repeated table cells).
 */
function lintText(text: string): { out: string; trimmedChars: number; touchedLines: number } {
  const lines = text.split('\n')
  const result: string[] = []
  let inFence = false
  let blankRun = 0
  let trimmedChars = 0
  let touchedLines = 0
  let lastEmitted: string | null = null

  for (const rawLine of lines) {
    // Toggle fence state on lines that start with ```
    // (Match the start, not anywhere in the line, so a fence inside prose
    //  doesn't accidentally flip the state.)
    const isFenceMarker = /^```/.test(rawLine.trim())
    if (isFenceMarker) {
      inFence = !inFence
      // Fence markers themselves are emitted untouched.
      result.push(rawLine)
      lastEmitted = rawLine
      blankRun = 0
      continue
    }

    if (inFence) {
      result.push(rawLine)
      lastEmitted = rawLine
      blankRun = 0
      continue
    }

    // Outside fence: trim trailing whitespace.
    const trimmed = rawLine.replace(/[ \t]+$/, '')
    if (trimmed.length !== rawLine.length) {
      trimmedChars += rawLine.length - trimmed.length
      touchedLines++
    }

    if (trimmed.length === 0) {
      blankRun++
      // Collapse 3+ blank lines to 2.
      if (blankRun > 2) {
        touchedLines++
        continue
      }
      result.push(trimmed)
      lastEmitted = trimmed
      continue
    }

    // Dedupe immediately-consecutive identical non-empty lines.
    if (lastEmitted !== null && trimmed === lastEmitted && trimmed.length > 0) {
      touchedLines++
      continue
    }

    blankRun = 0
    result.push(trimmed)
    lastEmitted = trimmed
  }

  return { out: result.join('\n'), trimmedChars, touchedLines }
}

export const lintMiddleware: Middleware = (ctx) => {
  const before = ctx.prompt
  const promptResult = lintText(before)
  const totalSavings = before.length - promptResult.out.length

  let nextSlices = ctx.slices
  if (ctx.slices) {
    // Apply the same lint pass to each non-fleet slice so the per-slice
    // tokenization done by measureMiddleware sees the post-lint text. The
    // fleet-prefix slice is short and frozen — skip to keep it byte-identical.
    const lintedUser   = ctx.slices.userText        !== undefined ? lintText(ctx.slices.userText).out        : ctx.slices.userText
    const lintedAgent  = ctx.slices.agentPrompt     !== undefined ? lintText(ctx.slices.agentPrompt).out     : ctx.slices.agentPrompt
    const lintedNotes  = ctx.slices.notesFramed     !== undefined ? lintText(ctx.slices.notesFramed).out     : ctx.slices.notesFramed
    const lintedCtxSrc = ctx.slices.contextSources  !== undefined ? lintText(ctx.slices.contextSources).out  : ctx.slices.contextSources
    nextSlices = {
      ...ctx.slices,
      userText: lintedUser as string,
      ...(lintedAgent  !== undefined ? { agentPrompt:    lintedAgent  } : {}),
      ...(lintedNotes  !== undefined ? { notesFramed:    lintedNotes  } : {}),
      ...(lintedCtxSrc !== undefined ? { contextSources: lintedCtxSrc } : {}),
    }
  }

  const nextNotes = totalSavings > 0
    ? [...ctx.notes, `lint: trimmed ${totalSavings} chars across ${promptResult.touchedLines} lines`]
    : ctx.notes

  return {
    ...ctx,
    prompt: promptResult.out,
    slices: nextSlices,
    notes: nextNotes,
  }
}

// Exported for unit-testing the pure transform without going through the
// middleware indirection.
export const __test_lintText = lintText
