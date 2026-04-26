/**
 * Cheap HTTP probes for SDK-style auth. Called from AuthManager to fill
 * `AuthStatus.sdk` for each provider. Both probes are rate-gated by the
 * existing AUTH_CACHE_TTL — the probe itself runs once per cache miss.
 *
 * - Anthropic: `GET /v1/models` is a small, auth-gated endpoint that returns
 *   a JSON list if the key is valid. Any 2xx == authenticated.
 * - GitHub (Copilot SDK path): `GET /user` with the token in the Authorization
 *   header. 200 == authenticated. Used because Copilot SDK (via ACP) still
 *   relies on a GitHub token for billing attribution.
 */

import { request } from 'https'
import type { IncomingMessage } from 'http'

const PROBE_TIMEOUT_MS = 8000

/** Resolve the Anthropic API key from the process env (already merged with user settings). */
export function getAnthropicApiKey(): string | undefined {
  return process.env['ANTHROPIC_API_KEY']?.trim() || undefined
}

/** Resolve a GitHub token suitable for Copilot API calls. */
export function getGitHubToken(): string | undefined {
  return (process.env['GH_TOKEN']?.trim() || process.env['GITHUB_TOKEN']?.trim()) || undefined
}

/** Returns true if the SDK package resolves at runtime. */
export function canResolveClaudeSdk(): boolean {
  try {
    // Use require.resolve to avoid actually loading the module — checking
    // availability only.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require.resolve('@anthropic-ai/claude-agent-sdk')
    return true
  } catch {
    return false
  }
}

function httpProbe(opts: {
  host: string
  path: string
  headers: Record<string, string>
  method?: string
}): Promise<{ ok: boolean; status?: number }> {
  return new Promise((resolve) => {
    const req = request(
      {
        method: opts.method ?? 'GET',
        host: opts.host,
        path: opts.path,
        headers: opts.headers,
        timeout: PROBE_TIMEOUT_MS,
      },
      (res: IncomingMessage) => {
        res.resume()
        const status = res.statusCode ?? 0
        resolve({ ok: status >= 200 && status < 300, status })
      },
    )
    req.on('error', () => resolve({ ok: false }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }) })
    req.end()
  })
}

/**
 * Probe the Anthropic API to confirm the key is valid. Returns `false`
 * (unauthenticated) when no key is set — no network call made in that case.
 */
export async function probeAnthropicKey(apiKey?: string): Promise<boolean> {
  const key = apiKey ?? getAnthropicApiKey()
  if (!key) return false

  const res = await httpProbe({
    host: 'api.anthropic.com',
    path: '/v1/models',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'User-Agent': 'clear-path-app',
    },
  })
  return res.ok
}

/**
 * Probe the GitHub API to confirm a token is valid. Returns `false` when no
 * token is configured.
 */
export async function probeGitHubToken(token?: string): Promise<boolean> {
  const gh = token ?? getGitHubToken()
  if (!gh) return false

  const res = await httpProbe({
    host: 'api.github.com',
    path: '/user',
    headers: {
      'Authorization': `Bearer ${gh}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'clear-path-app',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  return res.ok
}
