// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

import PickUpWhereYouLeftOffCard from './PickUpWhereYouLeftOffCard'
import { LAUNCHPAD_COPY } from '../../copy/launchpad'

const noopProps = {
  onOpenActiveSession: vi.fn(),
  onResumeSession: vi.fn(),
  onSeeMore: vi.fn(),
}

describe('PickUpWhereYouLeftOffCard', () => {
  it('renders ActiveSessionsCard and RecentSessionsCard inside one card shell when data exists', async () => {
    setupElectronAPI({
      'cli:list-sessions': [
        {
          sessionId: 'sess-active-1',
          cli: 'copilot-cli',
          name: 'Active demo',
          status: 'running',
          startedAt: Date.now(),
        },
      ],
      'cli:get-persisted-sessions': [
        {
          sessionId: 'sess-recent-1',
          cli: 'copilot-cli',
          name: 'Recent demo',
          status: 'stopped',
          messageLog: [],
          startedAt: Date.now() - 60_000,
          endedAt: Date.now() - 30_000,
        },
      ],
    })

    render(<PickUpWhereYouLeftOffCard {...noopProps} />)

    const shell = await screen.findByTestId('pick-up-where-you-left-off-card')
    expect(shell).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('active-sessions-card')).toBeInTheDocument()
      expect(screen.getByTestId('recent-sessions-card')).toBeInTheDocument()
    })

    // Both sub-cards must live inside the wrapper shell.
    expect(shell.querySelector('[data-testid="active-sessions-card"]')).toBeTruthy()
    expect(shell.querySelector('[data-testid="recent-sessions-card"]')).toBeTruthy()
  })

  it('shows the merged "No work yet" empty state when both sub-lists are empty', async () => {
    setupElectronAPI({
      'cli:list-sessions': [],
      'cli:get-persisted-sessions': [],
    })

    render(<PickUpWhereYouLeftOffCard {...noopProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('pick-up-merged-empty')).toBeInTheDocument()
    })
    // Empty-state copy lives in LAUNCHPAD_COPY so a future tweak only needs
    // to touch the constant, not both the component and this assertion.
    expect(screen.getByText(LAUNCHPAD_COPY.pickUp.emptyAll)).toBeInTheDocument()
    // Neither sub-card should render in the merged-empty branch.
    expect(screen.queryByTestId('active-sessions-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('recent-sessions-card')).not.toBeInTheDocument()
  })

  it('renders only RecentSessionsCard when active list is empty but recent has data', async () => {
    setupElectronAPI({
      'cli:list-sessions': [],
      'cli:get-persisted-sessions': [
        {
          sessionId: 'sess-recent-1',
          cli: 'copilot-cli',
          name: 'Recent demo',
          status: 'stopped',
          messageLog: [],
          startedAt: Date.now() - 60_000,
          endedAt: Date.now() - 30_000,
        },
      ],
    })

    render(<PickUpWhereYouLeftOffCard {...noopProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('recent-sessions-card')).toBeInTheDocument()
    })

    // ActiveSessionsCard itself renders (with its own empty state) — we
    // intentionally DO NOT hide it when only Active is empty, so the user
    // still sees the "Active Sessions" header. The merged empty state
    // only fires when BOTH lists are empty.
    expect(screen.getByTestId('active-sessions-card')).toBeInTheDocument()
    // No merged empty state in this branch.
    expect(screen.queryByTestId('pick-up-merged-empty')).not.toBeInTheDocument()
  })

  it('renders ActiveSessionsCard when only active has data (RecentSessionsCard still renders)', async () => {
    setupElectronAPI({
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

    render(<PickUpWhereYouLeftOffCard {...noopProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-sessions-card')).toBeInTheDocument()
    })

    // RecentSessionsCard still renders (with its own "No previous sessions yet" empty state),
    // because the merged empty state only fires when both lists are empty.
    expect(screen.getByTestId('recent-sessions-card')).toBeInTheDocument()
    expect(screen.queryByTestId('pick-up-merged-empty')).not.toBeInTheDocument()
  })

  it('passes limit={3} and onSeeMore through to the embedded RecentSessionsCard', async () => {
    // Provide 5 recent sessions — RecentSessionsCard should only render 3 of them
    // because the wrapper passes limit={3}.
    const baseTs = Date.now()
    setupElectronAPI({
      'cli:list-sessions': [],
      'cli:get-persisted-sessions': Array.from({ length: 5 }, (_, i) => ({
        sessionId: `sess-${i}`,
        cli: 'copilot-cli',
        name: `Session ${i}`,
        status: 'stopped',
        messageLog: [],
        startedAt: baseTs - (i + 1) * 60_000,
        endedAt: baseTs - i * 30_000,
      })),
    })

    const onSeeMore = vi.fn()
    render(<PickUpWhereYouLeftOffCard {...noopProps} onSeeMore={onSeeMore} />)

    await waitFor(() => {
      expect(screen.getByTestId('recent-sessions-card')).toBeInTheDocument()
    })

    // limit={3} → at most 3 recent rows rendered (out of 5 in the data set).
    await waitFor(() => {
      const rows = screen.getAllByTestId('recent-session-row')
      expect(rows).toHaveLength(3)
    })

    // The See-all link is the same one RecentSessionsCard already exposes;
    // it should wire to the wrapper's onSeeMore prop.
    const seeMore = screen.getByTestId('recent-sessions-see-more')
    seeMore.click()
    expect(onSeeMore).toHaveBeenCalledTimes(1)
  })
})
