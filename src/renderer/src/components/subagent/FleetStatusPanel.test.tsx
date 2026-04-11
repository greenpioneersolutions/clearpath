// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import FleetStatusPanel from './FleetStatusPanel'
import type { SessionInfo } from '../../types/ipc'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

const runningSessions: SessionInfo[] = [
  {
    sessionId: 'session-1',
    name: 'Main Session',
    cli: 'copilot',
    status: 'running',
    startedAt: Date.now(),
  },
]

const stoppedSessions: SessionInfo[] = [
  {
    sessionId: 'session-2',
    name: 'Stopped Session',
    cli: 'copilot',
    status: 'stopped',
    startedAt: Date.now(),
  },
]

describe('FleetStatusPanel', () => {
  it('renders heading', () => {
    render(<FleetStatusPanel copilotSessions={[]} />)
    expect(screen.getByText('Fleet Status')).toBeInTheDocument()
  })

  it('shows no running sessions message when empty', () => {
    render(<FleetStatusPanel copilotSessions={[]} />)
    expect(screen.getByText(/No running Copilot sessions/)).toBeInTheDocument()
  })

  it('shows no running sessions message when only stopped sessions', () => {
    render(<FleetStatusPanel copilotSessions={stoppedSessions} />)
    expect(screen.getByText(/No running Copilot sessions/)).toBeInTheDocument()
  })

  it('renders session selector and Refresh Fleet button for running sessions', () => {
    render(<FleetStatusPanel copilotSessions={runningSessions} />)
    expect(screen.getByText('Refresh Fleet')).toBeInTheDocument()
    expect(screen.getByText('Main Session (Copilot)')).toBeInTheDocument()
  })

  it('calls subagent:fleet-status when Refresh Fleet is clicked', async () => {
    mockInvoke.mockResolvedValue(undefined)
    render(<FleetStatusPanel copilotSessions={runningSessions} />)

    fireEvent.click(screen.getByText('Refresh Fleet'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('subagent:fleet-status', { sessionId: 'session-1' })
    })
  })

  it('shows empty fleet data state when no agents are found', () => {
    render(<FleetStatusPanel copilotSessions={runningSessions} />)
    expect(screen.getByText('No fleet data')).toBeInTheDocument()
  })
})
