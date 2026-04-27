// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { useActiveSessions } from './useActiveSessions'

type Listener = (data: unknown) => void

const listeners: Map<string, Set<Listener>> = new Map()
const unsubscribed: Map<string, number> = new Map()

const mockInvoke = vi.fn()
const mockOn = vi.fn((channel: string, callback: Listener): (() => void) => {
  if (!listeners.has(channel)) listeners.set(channel, new Set())
  listeners.get(channel)!.add(callback)
  return () => {
    listeners.get(channel)?.delete(callback)
    unsubscribed.set(channel, (unsubscribed.get(channel) ?? 0) + 1)
  }
})

function emit(channel: string, data: unknown) {
  const set = listeners.get(channel)
  if (!set) return
  for (const cb of set) cb(data)
}

/** Flush all pending microtasks (resolved IPC promises feeding setState). */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  listeners.clear()
  unsubscribed.clear()
  mockInvoke.mockReset()
  mockOn.mockClear()
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
})

describe('useActiveSessions', () => {
  it('fetches the running session list on mount and exposes statusById', async () => {
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', cli: 'copilot-cli', status: 'running', startedAt: 1 },
      { sessionId: 's2', cli: 'claude-cli', status: 'stopped', startedAt: 2 },
    ])

    const { result } = renderHook(() => useActiveSessions())
    await flush()

    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].sessionId).toBe('s1')
    expect(result.current.statusById.s1).toBe('idle')
  })

  it('marks status as processing when cli:turn-start fires', async () => {
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', cli: 'copilot-cli', status: 'running', startedAt: 1 },
    ])
    const { result } = renderHook(() => useActiveSessions())
    await flush()

    act(() => emit('cli:turn-start', { sessionId: 's1' }))

    expect(result.current.statusById.s1).toBe('processing')
  })

  it('marks status as awaiting-permission on cli:permission-request', async () => {
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', cli: 'copilot-cli', status: 'running', startedAt: 1 },
    ])
    const { result } = renderHook(() => useActiveSessions())
    await flush()

    act(() => emit('cli:permission-request', { sessionId: 's1' }))

    expect(result.current.statusById.s1).toBe('awaiting-permission')
  })

  it('marks status as error on cli:error', async () => {
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', cli: 'copilot-cli', status: 'running', startedAt: 1 },
    ])
    const { result } = renderHook(() => useActiveSessions())
    await flush()

    act(() => emit('cli:error', { sessionId: 's1', error: 'boom' }))

    expect(result.current.statusById.s1).toBe('error')
  })

  it('removes a session from the list when cli:exit + refetch shows it stopped', async () => {
    mockInvoke.mockResolvedValueOnce([
      { sessionId: 's1', cli: 'copilot-cli', status: 'running', startedAt: 1 },
    ])
    const { result } = renderHook(() => useActiveSessions())
    await flush()
    expect(result.current.sessions).toHaveLength(1)

    mockInvoke.mockResolvedValueOnce([
      { sessionId: 's1', cli: 'copilot-cli', status: 'stopped', startedAt: 1 },
    ])
    act(() => emit('cli:exit', { sessionId: 's1', code: 0 }))
    await flush()

    expect(result.current.sessions).toHaveLength(0)
    expect(result.current.statusById.s1).toBeUndefined()
  })

  it('cleans up listeners on unmount', async () => {
    mockInvoke.mockResolvedValue([])
    const { unmount } = renderHook(() => useActiveSessions())
    await flush()

    unmount()

    expect(unsubscribed.get('cli:turn-start')).toBe(1)
    expect(unsubscribed.get('cli:turn-end')).toBe(1)
    expect(unsubscribed.get('cli:permission-request')).toBe(1)
    expect(unsubscribed.get('cli:error')).toBe(1)
    expect(unsubscribed.get('cli:exit')).toBe(1)
  })

  it('refetches on the 5s poll interval', async () => {
    vi.useFakeTimers()
    mockInvoke.mockResolvedValue([])
    renderHook(() => useActiveSessions())
    await act(async () => { await Promise.resolve() })
    expect(mockInvoke).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })
    expect(mockInvoke).toHaveBeenCalledTimes(2)

    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })
    expect(mockInvoke).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
})
