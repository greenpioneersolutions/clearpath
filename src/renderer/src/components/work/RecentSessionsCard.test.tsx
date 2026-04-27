// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

import RecentSessionsCard from './RecentSessionsCard'

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'r1',
    cli: 'copilot-cli' as const,
    name: 'A session',
    startedAt: Date.now() - 60_000,
    endedAt: Date.now() - 30_000,
    archived: false,
    messageLog: [{}, {}],
    status: 'stopped' as const,
    ...overrides,
  }
}

describe('RecentSessionsCard', () => {
  it('renders empty state when no persisted sessions', async () => {
    setupElectronAPI({ 'cli:get-persisted-sessions': [] })
    render(<RecentSessionsCard onResumeSession={vi.fn()} onSeeMore={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/No previous sessions yet/i)).toBeInTheDocument()
    })
  })

  it('shows up to 5 sessions sorted by endedAt desc', async () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      makeRow({ sessionId: `r-${i}`, name: `Session ${i}`, endedAt: 1_000_000 + i }),
    )
    setupElectronAPI({ 'cli:get-persisted-sessions': rows })
    render(<RecentSessionsCard onResumeSession={vi.fn()} onSeeMore={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getAllByTestId('recent-session-row').length).toBe(5)
    })
    expect(screen.getAllByTestId('recent-session-row')[0].textContent).toContain('Session 7')
  })

  it('filters out running and archived sessions', async () => {
    setupElectronAPI({
      'cli:get-persisted-sessions': [
        makeRow({ sessionId: 'ok', name: 'Visible' }),
        makeRow({ sessionId: 'arch', name: 'Archived', archived: true }),
        makeRow({ sessionId: 'run', name: 'Running', status: 'running' }),
      ],
    })
    render(<RecentSessionsCard onResumeSession={vi.fn()} onSeeMore={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Visible')).toBeInTheDocument()
    })
    expect(screen.queryByText('Archived')).not.toBeInTheDocument()
    expect(screen.queryByText('Running')).not.toBeInTheDocument()
  })

  it('clicking "See more →" calls onSeeMore', async () => {
    setupElectronAPI({ 'cli:get-persisted-sessions': [] })
    const onSeeMore = vi.fn()
    render(<RecentSessionsCard onResumeSession={vi.fn()} onSeeMore={onSeeMore} />)
    await waitFor(() => screen.getByTestId('recent-sessions-see-more'))
    fireEvent.click(screen.getByTestId('recent-sessions-see-more'))
    expect(onSeeMore).toHaveBeenCalledTimes(1)
  })

  it('clicking a row calls onResumeSession with id, cli, name', async () => {
    setupElectronAPI({
      'cli:get-persisted-sessions': [makeRow({ sessionId: 'res-1', cli: 'claude-cli', name: 'Resumable' })],
    })
    const onResume = vi.fn()
    render(<RecentSessionsCard onResumeSession={onResume} onSeeMore={vi.fn()} />)
    await waitFor(() => screen.getByText('Resumable'))
    fireEvent.click(screen.getByTestId('recent-session-row'))
    expect(onResume).toHaveBeenCalledWith('res-1', 'claude-cli', 'Resumable')
  })
})
