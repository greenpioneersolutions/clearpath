// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

import WorkLaunchpad from './WorkLaunchpad'

describe('WorkLaunchpad', () => {
  it('renders the quick-start, pick-up, workflows, and notes-discovery cards', async () => {
    // Provide at least one active session so the merged "no work yet" empty state
    // doesn't fire — that way the embedded ActiveSessionsCard and RecentSessionsCard
    // both render and we can assert on their testids.
    setupElectronAPI({
      'cli:check-installed': { copilot: true, claude: true },
      'workflow:list': [],
      'cli:list-sessions': [
        {
          sessionId: 'sess-active-1',
          cli: 'copilot-cli',
          name: 'Active demo',
          status: 'running',
          startedAt: Date.now(),
        },
      ],
      'cli:get-persisted-sessions': [],
    })

    render(
      <MemoryRouter>
        <WorkLaunchpad
          onQuickStart={vi.fn()}
          onOpenWorkflow={vi.fn()}
          onOpenActiveSession={vi.fn()}
          onResumeSession={vi.fn()}
          onSeeMoreSessions={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('work-launchpad')).toBeInTheDocument()
    expect(screen.getByTestId('quick-start-card')).toBeInTheDocument()
    expect(screen.getByTestId('pick-up-where-you-left-off-card')).toBeInTheDocument()
    expect(screen.getByTestId('workflows-card')).toBeInTheDocument()

    await waitFor(() => {
      // After IPC settles, the embedded sub-cards should render inside the wrapper.
      expect(screen.getByTestId('active-sessions-card')).toBeInTheDocument()
      expect(screen.getByTestId('recent-sessions-card')).toBeInTheDocument()
      expect(screen.getByText(/No saved workflows yet/i)).toBeInTheDocument()
    })
  })

  it('renders the merged empty state when both active and recent are empty', async () => {
    setupElectronAPI({
      'cli:check-installed': { copilot: true, claude: true },
      'workflow:list': [],
      'cli:list-sessions': [],
      'cli:get-persisted-sessions': [],
    })

    render(
      <MemoryRouter>
        <WorkLaunchpad
          onQuickStart={vi.fn()}
          onOpenWorkflow={vi.fn()}
          onOpenActiveSession={vi.fn()}
          onResumeSession={vi.fn()}
          onSeeMoreSessions={vi.fn()}
        />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('pick-up-merged-empty')).toBeInTheDocument()
    })
    expect(screen.getByText(/No work yet\. Start something on the left\./i)).toBeInTheDocument()
  })
})
