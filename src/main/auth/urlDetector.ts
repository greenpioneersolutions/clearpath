/**
 * Browser URL detection for CLI login output.
 *
 * CLIs like `copilot /login` and `claude auth login` emit a device-code URL
 * that the user must visit in a browser. This module parses those URLs
 * out of the streamed CLI output so the main process can call
 * `shell.openExternal(url)` and pop the user straight to the sign-in page
 * — no copy-paste-from-terminal required.
 *
 * Security: callers MUST validate the returned URL starts with `https://`
 * before passing it to `shell.openExternal` (see AuthManager).
 */

// Primary: GitHub's device-flow URL (both bare and `?user_code=` form)
const GITHUB_DEVICE_RE = /https:\/\/github\.com\/login\/device[^\s)]*\/?/i

// Primary: Anthropic / claude.ai sign-in URLs
const CLAUDE_URL_RE = /https:\/\/(?:console\.anthropic\.com|claude\.ai)\/[^\s)]+/i

// Fallback: any https:// URL — only used when the CLI-specific patterns miss
const GENERIC_HTTPS_RE = /https:\/\/[^\s)]+/i

export type BrowserUrlCli = 'copilot' | 'claude'

/**
 * Parse the first browser URL out of a single line of CLI output.
 *
 * Returns the FIRST match if multiple URLs appear on the same line — the
 * login CLIs always emit the canonical URL first, with any follow-on
 * documentation/help URLs coming after.
 *
 * @param line A single line of CLI output (ANSI already stripped is fine).
 * @param cli  Which CLI emitted the line — controls which primary regex runs first.
 */
export function parseBrowserUrl(line: string, cli: BrowserUrlCli): string | null {
  if (!line) return null

  // Try CLI-specific primary regex first
  const primary = cli === 'copilot' ? GITHUB_DEVICE_RE : CLAUDE_URL_RE
  const primaryMatch = line.match(primary)
  if (primaryMatch) return cleanUrl(primaryMatch[0])

  // For copilot, also accept claude.ai URLs (unlikely but defensive); same vice versa.
  const other = cli === 'copilot' ? CLAUDE_URL_RE : GITHUB_DEVICE_RE
  const otherMatch = line.match(other)
  if (otherMatch) return cleanUrl(otherMatch[0])

  // Generic https:// fallback — picks up whatever URL the CLI printed.
  const generic = line.match(GENERIC_HTTPS_RE)
  if (generic) return cleanUrl(generic[0])

  return null
}

/**
 * Strip trailing punctuation that's almost certainly not part of the URL.
 * Common CLI output: `"Visit https://github.com/login/device."` — we don't
 * want the trailing period in the URL we hand to `shell.openExternal`.
 */
function cleanUrl(url: string): string {
  // Keep stripping any trailing punctuation characters one at a time.
  let cleaned = url
  while (cleaned.length > 0 && /[.,;:!?)\]}'"`]/.test(cleaned[cleaned.length - 1])) {
    cleaned = cleaned.slice(0, -1)
  }
  return cleaned
}
