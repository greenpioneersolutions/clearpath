// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NotificationPreferences from './NotificationPreferences'
import { ALL_NOTIFICATION_TYPES, TYPE_LABELS } from '../../types/notification'
import type { NotificationPrefs } from '../../types/notification'

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

function makePrefs(overrides: Partial<NotificationPrefs> = {}): NotificationPrefs {
  const allTrue: Record<string, boolean> = {}
  for (const t of ALL_NOTIFICATION_TYPES) allTrue[t] = true

  return {
    inbox: { ...allTrue } as NotificationPrefs['inbox'],
    desktop: { ...allTrue } as NotificationPrefs['desktop'],
    webhook: { ...allTrue } as NotificationPrefs['webhook'],
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationPreferences', () => {
  it('shows loading state when prefs not yet loaded', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<NotificationPreferences />)
    expect(screen.getByText('Loading preferences...')).toBeDefined()
  })

  it('renders preference controls after loading', async () => {
    mockInvoke.mockResolvedValue(makePrefs())
    render(<NotificationPreferences />)
    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeDefined()
    })
  })

  it('loads prefs from IPC on mount', async () => {
    mockInvoke.mockResolvedValue(makePrefs())
    render(<NotificationPreferences />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:get-prefs')
    })
  })

  it('renders all notification types in the table', async () => {
    mockInvoke.mockResolvedValue(makePrefs())
    render(<NotificationPreferences />)
    await waitFor(() => {
      for (const type of ALL_NOTIFICATION_TYPES) {
        expect(screen.getByText(TYPE_LABELS[type])).toBeDefined()
      }
    })
  })

  it('renders Inbox, Desktop, and Webhook column headers', async () => {
    mockInvoke.mockResolvedValue(makePrefs())
    render(<NotificationPreferences />)
    await waitFor(() => {
      expect(screen.getByText('Inbox')).toBeDefined()
      expect(screen.getByText('Desktop')).toBeDefined()
      expect(screen.getByText('Webhook')).toBeDefined()
    })
  })

  it('renders toggle switches for each type/channel combination', async () => {
    mockInvoke.mockResolvedValue(makePrefs())
    render(<NotificationPreferences />)
    await waitFor(() => {
      const switches = screen.getAllByRole('switch')
      // 9 types x 3 channels + 1 quiet hours toggle = 28
      expect(switches.length).toBe(ALL_NOTIFICATION_TYPES.length * 3 + 1)
    })
  })

  it('saves prefs when a toggle is clicked', async () => {
    const prefs = makePrefs()
    mockInvoke.mockResolvedValue(prefs)
    render(<NotificationPreferences />)

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeDefined()
    })

    // Click the first toggle (a type/channel toggle)
    const firstToggle = screen.getAllByRole('switch')[0]
    fireEvent.click(firstToggle)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:set-prefs', {
        prefs: expect.any(Object),
      })
    })
  })

  it('renders quiet hours section', async () => {
    mockInvoke.mockResolvedValue(makePrefs())
    render(<NotificationPreferences />)
    await waitFor(() => {
      expect(screen.getByText('Quiet Hours')).toBeDefined()
    })
  })

  it('toggles quiet hours', async () => {
    mockInvoke.mockResolvedValue(makePrefs())
    render(<NotificationPreferences />)

    await waitFor(() => {
      expect(screen.getByText('Quiet Hours')).toBeDefined()
    })

    const quietToggle = screen.getByLabelText('Toggle Quiet Hours')
    fireEvent.click(quietToggle)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:set-prefs', {
        prefs: expect.objectContaining({ quietHoursEnabled: true }),
      })
    })
  })

  it('shows time inputs when quiet hours enabled', async () => {
    mockInvoke.mockResolvedValue(makePrefs({ quietHoursEnabled: true }))
    render(<NotificationPreferences />)

    await waitFor(() => {
      expect(screen.getByText('Start')).toBeDefined()
      expect(screen.getByText('End')).toBeDefined()
    })
  })

  it('hides time inputs when quiet hours disabled', async () => {
    mockInvoke.mockResolvedValue(makePrefs({ quietHoursEnabled: false }))
    render(<NotificationPreferences />)

    await waitFor(() => {
      expect(screen.getByText('Quiet Hours')).toBeDefined()
    })

    expect(screen.queryByText('Start')).toBeNull()
    expect(screen.queryByText('End')).toBeNull()
  })

  it('does not crash when prefs is an empty object', async () => {
    mockInvoke.mockResolvedValue({})
    render(<NotificationPreferences />)
    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeDefined()
    })
    // All toggles should render with default (on) state without throwing
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBe(ALL_NOTIFICATION_TYPES.length * 3 + 1)
  })

  it('does not crash when prefs is missing inbox/desktop/webhook keys', async () => {
    mockInvoke.mockResolvedValue({ quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00' })
    render(<NotificationPreferences />)
    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeDefined()
    })
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBe(ALL_NOTIFICATION_TYPES.length * 3 + 1)
  })

  it('does not crash when prefs is null', async () => {
    mockInvoke.mockResolvedValue(null)
    render(<NotificationPreferences />)
    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeDefined()
    })
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBe(ALL_NOTIFICATION_TYPES.length * 3 + 1)
  })

  it('fills in default channel values for missing sub-keys', async () => {
    mockInvoke.mockResolvedValue({ inbox: undefined, desktop: undefined, webhook: undefined })
    render(<NotificationPreferences />)
    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeDefined()
    })
    // All type/channel toggles should be rendered (filled from defaults)
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBe(ALL_NOTIFICATION_TYPES.length * 3 + 1)
  })

  it('updates quiet hours start time', async () => {
    mockInvoke.mockResolvedValue(makePrefs({ quietHoursEnabled: true }))
    render(<NotificationPreferences />)

    await waitFor(() => {
      expect(screen.getByText('Start')).toBeDefined()
    })

    const timeInputs = screen.getAllByDisplayValue('22:00')
    fireEvent.change(timeInputs[0], { target: { value: '23:00' } })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:set-prefs', {
        prefs: expect.objectContaining({ quietHoursStart: '23:00' }),
      })
    })
  })
})
