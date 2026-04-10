// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WebhookManager from './WebhookManager'
import type { WebhookEndpoint } from '../../types/notification'

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

const mockWebhooks: WebhookEndpoint[] = [
  {
    id: 'wh-1',
    name: 'Slack Alerts',
    url: 'https://hooks.slack.com/services/xxx',
    type: 'slack-webhook',
    enabledTypes: ['session-complete', 'budget-alert'],
    enabled: true,
  },
  {
    id: 'wh-2',
    name: 'Custom API',
    url: 'https://api.example.com/webhook',
    type: 'generic-json',
    enabledTypes: ['error'],
    enabled: true,
  },
]

function setupMocks(webhooks = mockWebhooks) {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'notifications:list-webhooks') return Promise.resolve(webhooks)
    if (channel === 'notifications:save-webhook') return Promise.resolve()
    if (channel === 'notifications:delete-webhook') return Promise.resolve()
    if (channel === 'notifications:test-webhook') return Promise.resolve({ success: true })
    return Promise.resolve(null)
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WebhookManager', () => {
  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<WebhookManager />)
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders webhook list after loading', async () => {
    setupMocks()
    render(<WebhookManager />)
    await waitFor(() => {
      expect(screen.getByText('Slack Alerts')).toBeDefined()
      expect(screen.getByText('Custom API')).toBeDefined()
    })
  })

  it('shows empty state when no webhooks', async () => {
    setupMocks([])
    render(<WebhookManager />)
    await waitFor(() => {
      expect(screen.getByText('No webhooks configured')).toBeDefined()
    })
  })

  it('shows webhook URLs', async () => {
    setupMocks()
    render(<WebhookManager />)
    await waitFor(() => {
      expect(screen.getByText('https://hooks.slack.com/services/xxx')).toBeDefined()
      expect(screen.getByText('https://api.example.com/webhook')).toBeDefined()
    })
  })

  it('shows webhook types', async () => {
    setupMocks()
    render(<WebhookManager />)
    await waitFor(() => {
      expect(screen.getByText('slack-webhook')).toBeDefined()
      expect(screen.getByText('generic-json')).toBeDefined()
    })
  })

  it('toggles add form when button clicked', async () => {
    setupMocks()
    render(<WebhookManager />)
    await waitFor(() => {
      expect(screen.getByText('+ Add Webhook')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ Add Webhook'))
    expect(screen.getByPlaceholderText('e.g. Slack alerts')).toBeDefined()
    expect(screen.getByPlaceholderText('https://hooks.slack.com/...')).toBeDefined()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('e.g. Slack alerts')).toBeNull()
  })

  it('saves new webhook', async () => {
    setupMocks()
    render(<WebhookManager />)
    await waitFor(() => {
      expect(screen.getByText('+ Add Webhook')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ Add Webhook'))

    fireEvent.change(screen.getByPlaceholderText('e.g. Slack alerts'), {
      target: { value: 'My Webhook' },
    })
    fireEvent.change(screen.getByPlaceholderText('https://hooks.slack.com/...'), {
      target: { value: 'https://example.com/hook' },
    })
    fireEvent.click(screen.getByText('Add Webhook'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:save-webhook', expect.objectContaining({
        name: 'My Webhook',
        url: 'https://example.com/hook',
        type: 'generic-json',
        enabled: true,
      }))
    })
  })

  it('disables save button when name or URL is empty', async () => {
    setupMocks()
    render(<WebhookManager />)
    await waitFor(() => {
      expect(screen.getByText('+ Add Webhook')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ Add Webhook'))
    const addButton = screen.getByText('Add Webhook')
    expect(addButton.hasAttribute('disabled')).toBe(true)
  })

  it('deletes webhook after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    setupMocks()
    render(<WebhookManager />)

    await waitFor(() => {
      expect(screen.getByText('Slack Alerts')).toBeDefined()
    })

    const deleteButtons = screen.getAllByText('Delete')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:delete-webhook', { id: 'wh-1' })
    })
  })

  it('tests webhook', async () => {
    setupMocks()
    render(<WebhookManager />)

    await waitFor(() => {
      expect(screen.getByText('Slack Alerts')).toBeDefined()
    })

    const testButtons = screen.getAllByText('Test')
    fireEvent.click(testButtons[0])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:test-webhook', { id: 'wh-1' })
    })

    await waitFor(() => {
      expect(screen.getByText('Success!')).toBeDefined()
    })
  })

  it('shows failure message on test failure', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'notifications:list-webhooks') return Promise.resolve(mockWebhooks)
      if (channel === 'notifications:test-webhook') return Promise.resolve({ success: false, error: 'Connection refused' })
      return Promise.resolve(null)
    })

    render(<WebhookManager />)
    await waitFor(() => {
      expect(screen.getByText('Slack Alerts')).toBeDefined()
    })

    const testButtons = screen.getAllByText('Test')
    fireEvent.click(testButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Failed: Connection refused')).toBeDefined()
    })
  })

  it('opens edit mode for existing webhook', async () => {
    setupMocks()
    render(<WebhookManager />)

    await waitFor(() => {
      expect(screen.getByText('Slack Alerts')).toBeDefined()
    })

    const editButtons = screen.getAllByText('Edit')
    fireEvent.click(editButtons[0])

    // Form should be pre-filled
    expect(screen.getByDisplayValue('Slack Alerts')).toBeDefined()
    expect(screen.getByDisplayValue('https://hooks.slack.com/services/xxx')).toBeDefined()
    // Should show "Update" instead of "Add"
    expect(screen.getByText('Update Webhook')).toBeDefined()
  })

  it('shows enabled notification types for each webhook', async () => {
    setupMocks()
    render(<WebhookManager />)

    await waitFor(() => {
      expect(screen.getByText('Slack Alerts')).toBeDefined()
    })

    // Check that the type labels are shown
    expect(screen.getByText('Sessions')).toBeDefined()
  })

  it('loads webhook list on mount', async () => {
    setupMocks()
    render(<WebhookManager />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:list-webhooks')
    })
  })
})
