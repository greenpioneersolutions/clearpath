// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

import WorkLaunchpad from './WorkLaunchpad'

beforeEach(() => {
  setupElectronAPI({
    'cli:check-installed': { copilot: true, claude: true },
    'workflow:list': [],
    'cli:list-sessions': [],
    'cli:get-persisted-sessions': [],
  })
})

describe('WorkLaunchpad', () => {
  it('renders all four sub-cards', async () => {
    render(
      <WorkLaunchpad
        onQuickStart={vi.fn()}
        onOpenWorkflow={vi.fn()}
        onOpenActiveSession={vi.fn()}
        onResumeSession={vi.fn()}
        onSeeMoreSessions={vi.fn()}
      />,
    )

    expect(screen.getByTestId('work-launchpad')).toBeInTheDocument()
    expect(screen.getByTestId('quick-start-card')).toBeInTheDocument()
    expect(screen.getByTestId('workflows-card')).toBeInTheDocument()
    expect(screen.getByTestId('active-sessions-card')).toBeInTheDocument()
    expect(screen.getByTestId('recent-sessions-card')).toBeInTheDocument()

    await waitFor(() => {
      // After IPC settles, empty states should appear in workflows + active + recent
      expect(screen.getByText(/No saved workflows yet/i)).toBeInTheDocument()
    })
  })
})
