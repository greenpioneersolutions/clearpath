/**
 * Parse JSON that may contain comments (JSONC).
 *
 * Copilot CLI writes `~/.copilot/config.json` with leading `//` banner comments
 * ("// This file is managed automatically."), which the stock `JSON.parse`
 * rejects with "Unexpected token '/'". Any auth/config check that does a plain
 * `JSON.parse` on that file silently drops into the failure branch even when the
 * user is fully logged in — which made the launchpad green dot (this parser) and
 * the session-start gate (a plain parse) disagree.
 *
 * Strips `//` line comments and block comments before parsing. The scan is
 * string-aware so values containing `//` (e.g. "https://github.com") are never
 * clobbered, and escaped characters inside strings are preserved verbatim.
 */
export function parseJsonc(raw: string): unknown {
  let out = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    const next = raw[i + 1]
    if (inLineComment) {
      if (ch === '\n') { inLineComment = false; out += ch }
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++ }
      continue
    }
    if (inString) {
      out += ch
      if (ch === '\\') { out += next ?? ''; i++ } // keep escaped char verbatim
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; out += ch; continue }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue }
    out += ch
  }
  return JSON.parse(out)
}
