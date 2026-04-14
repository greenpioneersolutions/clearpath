/**
 * Corporate-proxy-safe fetch for the Electron main process.
 *
 * Node.js's built-in `fetch()` uses its own CA bundle and does NOT trust
 * the operating system's certificate store. This means any corporate proxy
 * that does SSL inspection (MITM) will cause "self-signed certificate in
 * the certificate chain" errors — even though the same URLs work fine in
 * a browser or with `curl` (which both use the system store).
 *
 * Electron's `net` module uses Chromium's networking stack, which DOES
 * trust system certificates. This module exports a drop-in replacement
 * for `fetch()` that uses `net.fetch()` when running inside Electron,
 * falling back to Node's `fetch()` otherwise (e.g., during tests).
 */

import { log } from './logger'

let _netFetch: typeof globalThis.fetch | null = null

/**
 * Get a fetch function that respects system certificates.
 * Uses Electron's `net.fetch` (Chromium networking) when available,
 * falls back to Node's global `fetch` for tests and non-Electron contexts.
 */
export function getSystemFetch(): typeof globalThis.fetch {
  if (_netFetch) return _netFetch

  try {
    // Dynamic require so this module can be imported in test environments
    // where 'electron' is mocked and `net` may not exist.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { net } = require('electron')
    if (net && typeof net.fetch === 'function') {
      _netFetch = net.fetch.bind(net) as typeof globalThis.fetch
      log.info('[electronFetch] Using Electron net.fetch (system certificates trusted)')
      return _netFetch
    }
  } catch {
    // Not in Electron or net not available
  }

  log.warn('[electronFetch] Electron net.fetch not available — falling back to Node fetch (system certificates NOT trusted)')
  _netFetch = globalThis.fetch
  return _netFetch
}

/**
 * Drop-in replacement for `fetch()` that trusts system certificates.
 * Use this instead of the global `fetch()` in all integration code.
 */
export async function systemFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const fn = getSystemFetch()
  return fn(input, init)
}
