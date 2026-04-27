// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import type { SessionInfo } from '../../types/ipc'

import ActiveSessionsBanner from './ActiveSessionsBanner'

function PathProbe() {
  const loc = useLocation()
  return <div data-testid="path-probe">{loc.pathname}{loc.search}</div>
}

type Listener = (data: unknown) => void

interface TestEnv {
  invoke: ReturnType<typeof vi.fn>
  listeners: Map<string, Set<Listener>>
}

function setupApi(sessions: SessionInfo[]): TestEnv {
  const listeners = new Map<string, Set<Listener>>()
  const invoke = vi.fn().mockImplementation((channel: string) => {
    if (channel === 'cli:list-sessions') return Promise.resolve(sessions)
    return Promise.resolve(null)
  })
  const on = vi.fn((channel: string, cb: Listener): (() => void) => {
    if (!listeners.has(channel)) listeners.set(channel, new Set())
    listeners.get(channel)!.add(cb)
    return () => listeners.get(channel)?.delete(cb)
  })
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke, on, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  return { invoke, listeners }
}

function renderBanner(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ActiveSessionsBanner />
      <Routes>
        <Route path="*" element={<PathProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('ActiveSessionsBanner', () => {
  it('returns null when there are zero active sessions', async () => {
    setupApi([])
    renderBanner()
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByTestId('active-sessions-banner')).not.toBeInTheDocument()
  })

  it('renders one chip per running session', async () => {
    setupApi([
      { sessionId: 's1', cli: 'copilot-cli', status: 'running', startedAt: 1, name: 'First' },
      { sessionId: 's2', cli: 'claude-cli', status: 'running', startedAt: 2 },
    ])
    renderBanner()
    await waitFor(() => expect(screen.getByTestId('active-sessions-banner')).toBeInTheDocument())
    const chips = screen.getAllByTestId('active-session-chip')
    expect(chips).toHaveLength(2)
    expect(chips[0]).toHaveAttribute('data-session-id', 's1')
    expect(chips[1]).toHaveAttribute('data-session-id', 's2')
  })

  it('navigates to /work?id=<id> when a chip is clicked', async () => {
    setupApi([
      { sessionId: 'abc', cli: 'copilot-cli', status: 'running', startedAt: 1 },
    ])
    renderBanner()
    await waitFor(() => screen.getByTestId('active-session-chip'))
    fireEvent.click(screen.getByTestId('active-session-chip'))
    await waitFor(() => {
      expect(screen.getByTestId('path-probe').textContent).toBe('/work?id=abc')
    })
  })

  it('persists collapsed state to localStorage and re-reads it on mount', async () => {
    setupApi([
      { sessionId: 's1', cli: 'copilot-cli', status: 'running', startedAt: 1 },
    ])

    const { unmount } = renderBanner()
    await waitFor(() => screen.getByTestId('active-session-chip'))
    expect(window.localStorage.getItem('activeSessionsBannerCollapsed')).toBe('0')

    fireEvent.click(screen.getByTestId('active-sessions-banner-toggle'))
    expect(window.localStorage.getItem('activeSessionsBannerCollapsed')).toBe('1')
    expect(screen.queryByTestId('active-session-chip')).not.toBeInTheDocument()

    unmount()
    setupApi([
      { sessionId: 's1', cli: 'copilot-cli', status: 'running', startedAt: 1 },
    ])
    renderBanner()
    await waitFor(() => screen.getByTestId('active-sessions-banner'))
    expect(screen.queryByTestId('active-session-chip')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('active-sessions-banner-toggle'))
    expect(window.localStorage.getItem('activeSessionsBannerCollapsed')).toBe('0')
    expect(screen.getByTestId('active-session-chip')).toBeInTheDocument()
  })

  it('reflects statusById on the status dot class via cli:turn-start event', async () => {
    const env = setupApi([
      { sessionId: 's1', cli: 'copilot-cli', status: 'running', startedAt: 1, name: 'A' },
    ])
    renderBanner()
    await waitFor(() => screen.getByTestId('active-session-chip'))

    const chip = screen.getByTestId('active-session-chip')
    const dot = chip.querySelector('span[aria-hidden="true"]')
    expect(dot?.className).toContain('bg-gray-500')

    act(() => {
      const set = env.listeners.get('cli:turn-start')
      set?.forEach((cb) => cb({ sessionId: 's1' }))
    })

    const dot2 = screen.getByTestId('active-session-chip').querySelector('span[aria-hidden="true"]')
    expect(dot2?.className).toContain('animate-pulse')
    expect(dot2?.className).toContain('bg-[#1D9E75]')
  })

  it('falls back to "Session <slice>" when name is missing', async () => {
    setupApi([
      { sessionId: 'abcdef1234567890', cli: 'copilot-cli', status: 'running', startedAt: 1 },
    ])
    renderBanner()
    await waitFor(() => screen.getByText('Session abcdef12'))
  })
})
