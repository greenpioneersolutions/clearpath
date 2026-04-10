// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationBell from './NotificationBell'

// ── Mock useFocusTrap (used by NotificationInbox) ────────────────────────────

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
  mockInvoke.mockResolvedValue(0) // default unread count
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationBell', () => {
  it('renders bell button with aria-label', async () => {
    renderBell()
    await waitFor(() => {
      expect(screen.getByTitle('Notifications')).toBeDefined()
    })
  })

  it('loads unread count on mount', async () => {
    mockInvoke.mockResolvedValue(5)
    renderBell()
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:unread-count')
    })
  })

  it('shows unread badge when count > 0', async () => {
    mockInvoke.mockResolvedValue(3)
    renderBell()
    await waitFor(() => {
      expect(screen.getByText('3')).toBeDefined()
    })
  })

  it('does not show badge when count is 0', async () => {
    mockInvoke.mockResolvedValue(0)
    renderBell()
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:unread-count')
    })
    // No badge number should be visible
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows 99+ when count exceeds 99', async () => {
    mockInvoke.mockResolvedValue(150)
    renderBell()
    await waitFor(() => {
      expect(screen.getByText('99+')).toBeDefined()
    })
  })

  it('opens inbox on click', async () => {
    // When inbox opens, it will call notifications:list
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'notifications:unread-count') return Promise.resolve(0)
      if (channel === 'notifications:list') return Promise.resolve([])
      return Promise.resolve(null)
    })

    renderBell()
    fireEvent.click(screen.getByTitle('Notifications'))
    // The inbox dialog should appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })
  })

  it('subscribes to notification:new events', () => {
    renderBell()
    expect(mockOn).toHaveBeenCalledWith('notification:new', expect.any(Function))
  })

  it('increments count when new notification arrives', async () => {
    mockInvoke.mockResolvedValue(2)

    // Capture the callback passed to on('notification:new')
    let notifCallback: ((notif: unknown) => void) | undefined
    mockOn.mockImplementation((channel: string, cb: (notif: unknown) => void) => {
      if (channel === 'notification:new') notifCallback = cb
      return vi.fn()
    })

    renderBell()

    await waitFor(() => {
      expect(screen.getByText('2')).toBeDefined()
    })

    // Simulate a new notification arriving
    notifCallback!({ id: 'n1', type: 'session-complete', title: 'Done' })

    await waitFor(() => {
      expect(screen.getByText('3')).toBeDefined()
    })
  })

  it('has correct aria-label with unread count', async () => {
    mockInvoke.mockResolvedValue(5)
    renderBell()
    await waitFor(() => {
      const button = screen.getByTitle('Notifications')
      expect(button.getAttribute('aria-label')).toBe('Notifications, 5 unread')
    })
  })
})
