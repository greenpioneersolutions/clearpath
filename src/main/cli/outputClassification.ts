/**
 * Pure helpers for classifying a CLI's stderr line so the renderer shows the
 * right surface (a usage badge vs. a red error block vs. a gentle status).
 *
 * These live outside CLIManager so they can be unit-tested directly — the
 * stderr handler in CLIManager just delegates here.
 */

/**
 * True when a stderr line is really an informational usage / session summary,
 * NOT an error. Copilot CLI prints its end-of-turn summary to stderr in a
 * layout like:
 *
 *   Changes   +0 -0
 *   Requests  0 Premium (18s)
 *   Tokens    ↑ 55.4k (30.5k cached) • ↓ 1.8k (1.2k reasoning)
 *
 * The lines can arrive as one multi-line chunk or one at a time, so each
 * distinctive fragment must match on its own. Patterns are anchored to the
 * summary's shape (diff counts, "N Premium", the ↑/↓ token arrows, the
 * cached/reasoning parentheticals) so a genuine error that merely mentions
 * "tokens" or "changes" in prose is NOT swallowed.
 */
export function isUsageSummary(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  // Anchor the shape/keyword patterns to the start of a line (the `m` flag is
  // required — in a multi-line stderr chunk the Tokens/Requests line is rarely
  // line 1) so genuine errors that merely *mention* "premium"/"changes" mid-
  // sentence (e.g. "Error: 5 premium requests failed") aren't misclassified as
  // usage and hidden. The cached/reasoning parenthetical is specific enough to
  // keep unanchored.
  return (
    /total usage est|api time spent|session time|breakdown by ai model/i.test(t) ||
    /^\s*premium requests?\b/im.test(t) ||
    /^\s*code changes\b/im.test(t) ||
    /^\s*changes\s+[+-]\d/im.test(t) ||
    /^\s*requests\s+\d[\d.,]*\s+premium\b/im.test(t) ||
    /^\s*tokens?\b[^\n]*[↑↓⬆⬇]/im.test(t) ||
    /\(\s*[\d.]+\s*k?\s+(?:cached|reasoning)\s*\)/i.test(t)
  )
}
