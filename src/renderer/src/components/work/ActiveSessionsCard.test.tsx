// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'
import type { SessionInfo } from '../../types/ipc'

import ActiveSessionsCard from './ActiveSessionsCard'

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    sessionId: 'sess-1',
    cli: 'copilot-cli',
    status: 'running',
    startedAt: Date.now() - 5 * 60_000,
    name: 'Test session',
    ...overrides,
  }
}

describe('ActiveSessionsCard', () => {
  it('renders empty state when no running sessions', async () => {
    setupElectronAPI({ 'cli:list-sessions': [] })
    render(<ActiveSessionsCard onOpenSession={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/No active sessions/i)).toBeInTheDocument()
    })
  })

  it('filters out stopped sessions', async () => {
    setupElectronAPI({
      'cli:list-sessions': [
        makeSession({ sessionId: 'a', name: 'Running', status: 'running' }),
        makeSession({ sessionId: 'b', name: 'Stopped', status: 'stopped' }),
      ],
    })
    render(<ActiveSessionsCard onOpenSession={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Running')).toBeInTheDocument()
    })
    expect(screen.queryByText('Stopped')).not.toBeInTheDocument()
  })

  it('renders rows with the configured testid', async () => {
    setupElectronAPI({
      'cli:list-sessions': [
        makeSession({ sessionId: 'a', name: 'One' }),
        makeSession({ sessionId: 'b', name: 'Two' }),
      ],
    })
    render(<ActiveSessionsCard onOpenSession={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getAllByTestId('active-session-row').length).toBe(2)
    })
  })

  it('calls onOpenSession when a row is clicked', async () => {
    const onOpen = vi.fn()
    const session = makeSession({ sessionId: 'click-me', name: 'Clickable' })
    setupElectronAPI({ 'cli:list-sessions': [session] })
    render(<ActiveSessionsCard onOpenSession={onOpen} />)
    await waitFor(() => {
      expect(screen.getByText('Clickable')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('active-session-row'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'click-me' }))
  })
})
