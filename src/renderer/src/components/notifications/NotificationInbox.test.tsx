// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationInbox from './NotificationInbox'
import type { AppNotification } from '../../types/notification'

// ── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}))

// ── Mock electronAPI ─────────────────────────────────────────────────────────

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

// ── Test data ────────────────────────────────────────────────────────────────

const mockNotifications: AppNotification[] = [
  {
    id: 'n1',
    timestamp: Date.now() - 60000,
    type: 'session-complete',
    severity: 'info',
    title: 'Session Done',
    message: 'Your coding session has completed.',
    source: 'CLIManager',
    read: false,
  },
  {
    id: 'n2',
    timestamp: Date.now() - 120000,
    type: 'budget-alert',
    severity: 'warning',
    title: 'Budget Warning',
    message: 'Daily budget at 80%.',
    source: 'CostTracker',
    read: true,
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderInbox(props: { isOpen: boolean; onClose: () => void }) {
  return render(
    <MemoryRouter>
      <NotificationInbox {...props} />
    </MemoryRouter>,
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationInbox', () => {
  it('renders nothing when isOpen is false', () => {
    renderInbox({ isOpen: false, onClose: vi.fn() })
    // The component returns empty fragment when not open
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders dialog when isOpen is true', async () => {
    mockInvoke.mockResolvedValue(mockNotifications)
    renderInbox({ isOpen: true, onClose: vi.fn() })
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText('Notifications')).toBeDefined()
  })

  it('loads notifications on open', async () => {
    mockInvoke.mockResolvedValue(mockNotifications)
    renderInbox({ isOpen: true, onClose: vi.fn() })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:list', expect.objectContaining({
        limit: 200,
        unreadOnly: true,
      }))
    })
  })

  it('renders notification items', async () => {
    mockInvoke.mockResolvedValue(mockNotifications)
    renderInbox({ isOpen: true, onClose: vi.fn() })
    await waitFor(() => {
      expect(screen.getByText('Session Done')).toBeDefined()
      expect(screen.getByText('Budget Warning')).toBeDefined()
    })
  })

  it('shows empty state when no notifications', async () => {
    mockInvoke.mockResolvedValue([])
    renderInbox({ isOpen: true, onClose: vi.fn() })
    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeDefined()
    })
  })

  it('renders filter tabs', async () => {
    mockInvoke.mockResolvedValue([])
    renderInbox({ isOpen: true, onClose: vi.fn() })
    expect(screen.getByText('All')).toBeDefined()
    expect(screen.getByText('Sessions')).toBeDefined()
    expect(screen.getByText('Security')).toBeDefined()
    expect(screen.getByText('Budget')).toBeDefined()
    expect(screen.getByText('Agents')).toBeDefined()
    expect(screen.getByText('History')).toBeDefined()
  })

  it('changes filter when tab is clicked', async () => {
    mockInvoke.mockResolvedValue([])
    renderInbox({ isOpen: true, onClose: vi.fn() })

    fireEvent.click(screen.getByText('Security'))

    await waitFor(() => {
      // Should reload with the security filter
      const listCalls = mockInvoke.mock.calls.filter(
        (c: unknown[]) => c[0] === 'notifications:list',
      )
      expect(listCalls.length).toBeGreaterThanOrEqual(2) // initial + filter change
    })
  })

  it('calls mark-all-read when button clicked', async () => {
    mockInvoke.mockResolvedValue(mockNotifications)
    renderInbox({ isOpen: true, onClose: vi.fn() })

    await waitFor(() => {
      expect(screen.getByText('Session Done')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('Mark all notifications as read'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:mark-all-read')
    })
  })

  it('calls clear-all when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockInvoke.mockResolvedValue(mockNotifications)
    renderInbox({ isOpen: true, onClose: vi.fn() })

    await waitFor(() => {
      expect(screen.getByText('Session Done')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('Clear all notifications'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:clear-all')
    })
  })

  it('dismisses individual notification', async () => {
    mockInvoke.mockResolvedValue(mockNotifications)
    renderInbox({ isOpen: true, onClose: vi.fn() })

    await waitFor(() => {
      expect(screen.getByText('Session Done')).toBeDefined()
    })

    // Click the dismiss "x" button
    const dismissButtons = screen.getAllByLabelText('Dismiss notification')
    fireEvent.click(dismissButtons[0])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:dismiss', { id: 'n1' })
    })
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    mockInvoke.mockResolvedValue([])
    const { container } = renderInbox({ isOpen: true, onClose })

    // Click the backdrop (the outermost fixed div)
    const backdrop = container.querySelector('.fixed.inset-0')!
    fireEvent.click(backdrop)

    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onClose when panel content is clicked', async () => {
    const onClose = vi.fn()
    mockInvoke.mockResolvedValue([])
    renderInbox({ isOpen: true, onClose })

    // Click the dialog panel itself
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('subscribes to notification:new push events', async () => {
    mockInvoke.mockResolvedValue([])
    renderInbox({ isOpen: true, onClose: vi.fn() })
    expect(mockOn).toHaveBeenCalledWith('notification:new', expect.any(Function))
  })
})
