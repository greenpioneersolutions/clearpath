// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAuthStatus } from './useAuthStatus'

function authStatusFixture(
  copilot: { cli?: boolean; sdk?: boolean },
  claude:  { cli?: boolean; sdk?: boolean },
) {
  const status = (ready: boolean) => ({ installed: ready, authenticated: ready, checkedAt: 0 })
  const provider = (cli: boolean, sdk: boolean) => ({
    ...status(cli),
    cli: status(cli),
    sdk: status(sdk),
  })
  return {
    copilot: provider(!!copilot.cli, !!copilot.sdk),
    claude:  provider(!!claude.cli,  !!claude.sdk),
  }
}

const mockInvoke = vi.fn()
const offSpy = vi.fn()
// Typed as `(channel, handler) => off` so .mock.calls is `[string, (...args: unknown[]) => void][]`.
const onSpy = vi.fn((_channel: string, _handler: (...args: unknown[]) => void) => offSpy)

beforeEach(() => {
  mockInvoke.mockReset()
  onSpy.mockClear().mockReturnValue(offSpy)
  offSpy.mockClear()
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: onSpy, off: vi.fn() },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAuthStatus', () => {
  it('starts un-loaded then populates from auth:get-status', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:get-status') return Promise.resolve(authStatusFixture({ cli: true }, { cli: false }))
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useAuthStatus())

    expect(result.current.loaded).toBe(false)
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.copilot.ready).toBe(true)
    expect(result.current.claude.ready).toBe(false)
    expect(result.current.copilot.cli.installed).toBe(true)
    expect(result.current.copilot.cli.authenticated).toBe(true)
  })

  it('treats SDK-only auth as ready (CLI not required if SDK is connected)', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:get-status') return Promise.resolve(authStatusFixture({ sdk: true }, { sdk: true }))
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useAuthStatus())

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.copilot.ready).toBe(true)
    expect(result.current.claude.ready).toBe(true)
    expect(result.current.copilot.cli.installed).toBe(false)
    expect(result.current.copilot.sdk.authenticated).toBe(true)
  })

  it('treats installed-but-not-authed as NOT ready', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:get-status') return Promise.resolve({
        copilot: { installed: true, authenticated: false, checkedAt: 0,
          cli: { installed: true, authenticated: false, checkedAt: 0 },
          sdk: { installed: false, authenticated: false, checkedAt: 0 } },
        claude: { installed: true, authenticated: false, checkedAt: 0,
          cli: { installed: true, authenticated: false, checkedAt: 0 },
          sdk: { installed: false, authenticated: false, checkedAt: 0 } },
      })
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useAuthStatus())

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.copilot.ready).toBe(false)
    expect(result.current.claude.ready).toBe(false)
    // …but the underlying detail is preserved for nuanced messaging.
    expect(result.current.copilot.cli.installed).toBe(true)
    expect(result.current.copilot.cli.authenticated).toBe(false)
  })

  it('falls back to cli:check-installed when auth:get-status returns null (ready stays false until auth confirms)', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:get-status') return Promise.resolve(null)
      if (channel === 'cli:check-installed') return Promise.resolve({ copilot: true, claude: false })
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useAuthStatus())

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.copilot.cli.installed).toBe(true)
    expect(result.current.claude.cli.installed).toBe(false)
    // Fallback CANNOT promise auth. Sidebar stays red until the next auth probe.
    expect(result.current.copilot.ready).toBe(false)
    expect(result.current.claude.ready).toBe(false)
  })

  it('subscribes to auth:status-changed pushes so login/install updates without a route change', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:get-status') return Promise.resolve(authStatusFixture({ cli: false }, { cli: false }))
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useAuthStatus())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    const statusChangedHandler = onSpy.mock.calls.find(([ch]) => ch === 'auth:status-changed')?.[1] as (() => void) | undefined
    expect(typeof statusChangedHandler).toBe('function')

    // Simulate the user signing in: next probe returns ready.
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:get-status') return Promise.resolve(authStatusFixture({ cli: true }, { cli: false }))
      return Promise.resolve(null)
    })
    await act(async () => { statusChangedHandler?.() })

    await waitFor(() => expect(result.current.copilot.ready).toBe(true))
  })

  it('re-fetches on legacy sidebar:refresh window events', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:get-status') return Promise.resolve(authStatusFixture({ cli: false }, { cli: false }))
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useAuthStatus())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    const before = mockInvoke.mock.calls.filter(([ch]) => ch === 'auth:get-status').length
    await act(async () => { window.dispatchEvent(new Event('sidebar:refresh')) })

    await waitFor(() => {
      const after = mockInvoke.mock.calls.filter(([ch]) => ch === 'auth:get-status').length
      expect(after).toBeGreaterThan(before)
    })
  })

  it('marks loaded=true even if both auth probes throw — UI must not hang forever', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:get-status') return Promise.reject(new Error('boom'))
      if (channel === 'cli:check-installed') return Promise.reject(new Error('also boom'))
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useAuthStatus())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.copilot.ready).toBe(false)
    expect(result.current.claude.ready).toBe(false)
  })
})
