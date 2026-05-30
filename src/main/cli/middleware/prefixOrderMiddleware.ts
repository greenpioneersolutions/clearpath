import type { Middleware } from './pipeline'
import type { PromptSlices } from '../../../shared/tokenization/types'

/**
 * Token Coach Phase 3 — stable-prefix discipline middleware.
 *
 * Reassembles `ctx.prompt` from `ctx.slices` in a canonical, deterministic
 * order so the byte sequence of injected slices is identical turn-to-turn for
 * the SAME session. That byte-identical prefix is what makes prompt caching
 * engage — both for the direct-API path we own (LocalModelAdapter +
 * cache_control injection downstream) AND for the CLI passthroughs (Copilot
 * CLI, Claude Code CLI) whose own caches we can't reach but DO get to feed
 * the same bytes into.
 *
 * Canonical order — most-stable to least-stable:
 *
 *     [fleetPrefix] → [agentPrompt] → [notesFramed] → [filesFramed] → [contextSources] → [userText]
 *
 * Rationale:
 *   - userText changes every turn (the user types something new) → goes LAST.
 *   - Notes / file references change less often than the user prompt.
 *   - Agent prompt is constant for the session.
 *   - Fleet prefix is constant when present.
 *
 * After this middleware runs, `ctx.prompt` is the authoritative serialized
 * form. `measureMiddleware` runs LAST in the pipeline so it tokenizes the
 * final shape (not whatever the renderer originally assembled).
 *
 * Crucial invariants — see prefixOrderMiddleware.test.ts:
 *   1. Slice TEXT is never mutated. We only reorder + concatenate.
 *   2. Missing / empty slices are skipped — no blank lines inserted.
 *   3. Output is byte-deterministic given the same slice contents.
 *   4. `ctx.slices` itself is preserved unchanged so downstream middlewares
 *      (measure) can still tokenize each slice independently.
 *
 * Separator: two newlines (`\n\n`). The renderer historically used different
 * separators per injection site (handlers.ts agent prepend uses `\n\n`,
 * Work.tsx note injection uses `\n\n`, fleet prefix is its own line). We
 * normalize on `\n\n` because Anthropic / OpenAI tokenizers compress runs of
 * whitespace efficiently AND it's the most common existing separator — the
 * net token delta on the average prompt is ≤ a single token.
 */

const SLICE_SEPARATOR = '\n\n'

/**
 * Tracks the byte offset (in the assembled prompt) where the volatile
 * `userText` slice begins. That offset is the cache breakpoint candidate —
 * everything before it is stable, everything from it on changes per-turn.
 *
 * We measure it in BYTES, not tokens, because:
 *   - Tokens come from measureMiddleware which runs AFTER this.
 *   - Adapters that decide whether to inject cache_control re-tokenize
 *     the prefix slice anyway; the byte offset is just a structural marker.
 *
 * Set to 0 when there's no stable prefix (slices undefined, or only userText
 * present). Set to the length of the assembled prefix otherwise.
 */
function assembleFromSlices(slices: PromptSlices): { prompt: string; userTextByteOffset: number } {
  const parts: string[] = []

  // ORDER MATTERS — do not reorder these without updating the doc comment + tests.
  // fleetPrefix → agentPrompt → notesFramed → filesFramed → contextSources → userText
  if (slices.fleetPrefix    && slices.fleetPrefix.length    > 0) parts.push(slices.fleetPrefix)
  if (slices.agentPrompt    && slices.agentPrompt.length    > 0) parts.push(slices.agentPrompt)
  if (slices.notesFramed    && slices.notesFramed.length    > 0) parts.push(slices.notesFramed)
  if (slices.filesFramed    && slices.filesFramed.length    > 0) parts.push(slices.filesFramed)
  if (slices.contextSources && slices.contextSources.length > 0) parts.push(slices.contextSources)

  // Everything pushed so far is the STABLE prefix. The byte offset where
  // userText starts is the cache breakpoint candidate. Account for the
  // separator that will be inserted before userText when there IS a prefix.
  const prefix = parts.join(SLICE_SEPARATOR)
  const userText = slices.userText ?? ''

  if (prefix.length === 0) {
    // No stable prefix — entire prompt is userText. No cache breakpoint to track.
    return { prompt: userText, userTextByteOffset: 0 }
  }

  if (userText.length === 0) {
    // No userText — prefix alone. Cache breakpoint is at the end of the prefix
    // (though caller will typically not bother caching when there's no volatile
    // suffix to differentiate).
    return { prompt: prefix, userTextByteOffset: prefix.length }
  }

  const fullPrompt = prefix + SLICE_SEPARATOR + userText
  // userText begins at prefix.length + SLICE_SEPARATOR.length.
  return { prompt: fullPrompt, userTextByteOffset: prefix.length + SLICE_SEPARATOR.length }
}

export const prefixOrderMiddleware: Middleware = (ctx) => {
  // No slices → nothing to reorder. Leave ctx.prompt as the renderer gave us.
  if (!ctx.slices) return ctx

  const { prompt, userTextByteOffset } = assembleFromSlices(ctx.slices)

  // If reassembly produced the same string the renderer already sent, skip
  // the rewrite to avoid noisy diffs in downstream code paths (audit log,
  // session message log) that hash the prompt.
  if (prompt === ctx.prompt) {
    return { ...ctx, cacheBreakpoint: userTextByteOffset }
  }

  return {
    ...ctx,
    prompt,
    cacheBreakpoint: userTextByteOffset,
  }
}

// Exported for unit-testing the pure transform without going through the
// middleware indirection.
export const __test_assembleFromSlices = assembleFromSlices
