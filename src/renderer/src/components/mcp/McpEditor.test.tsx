// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import McpEditor from './McpEditor'
import type { McpRegistryEntry } from '../../types/mcp'

const mockInvoke = vi.fn()

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
})

const entry: McpRegistryEntry = {
  id: 'id-1',
  name: 'GitHub',
  command: 'npx',
  args: ['-y', '@mcp/github'],
  env: { NODE_ENV: 'production' },
  secretRefs: { GITHUB_TOKEN: 'key-1', OTHER_SECRET: 'key-2' },
  scope: 'global',
  targets: { copilot: true, claude: true },
  enabled: true,
  source: 'catalog',
  catalogId: 'github',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function setupMocks(updateResp = { success: true }) {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'mcp:registry-update') return Promise.resolve(updateResp)
    return Promise.resolve(null)
  })
}

describe('McpEditor', () => {
  it('prefills fields from entry', () => {
    setupMocks()
    render(<McpEditor entry={entry} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect((screen.getByDisplayValue('GitHub') as HTMLInputElement).value).toBe('GitHub')
    expect((screen.getByDisplayValue('npx') as HTMLInputElement).value).toBe('npx')
    expect((screen.getByDisplayValue('-y @mcp/github') as HTMLInputElement).value).toBe('-y @mcp/github')
    expect((screen.getByDisplayValue('NODE_ENV') as HTMLInputElement).value).toBe('NODE_ENV')
  })

  it('renders secret rows as unchanged with Replace toggle', () => {
    setupMocks()
    render(<McpEditor entry={entry} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByText('GITHUB_TOKEN')).toBeDefined()
    expect(screen.getByText('OTHER_SECRET')).toBeDefined()
    // Both should show unchanged placeholder
    expect(screen.getAllByText(/unchanged/).length).toBe(2)
  })

  it('omits secrets from request body when none are replaced', async () => {
    setupMocks()
    const onSaved = vi.fn()
    render(<McpEditor entry={entry} onClose={vi.fn()} onSaved={onSaved} />)

    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => {
      const call = mockInvoke.mock.calls.find((c) => c[0] === 'mcp:registry-update')
      expect(call).toBeDefined()
      // secrets should NOT be present in the request
      const payload = call![1] as { id: string; partial: unknown; secrets?: unknown }
      expect(payload.secrets).toBeUndefined()
      expect(payload.id).toBe('id-1')
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('sends only touched secrets when one is replaced', async () => {
    setupMocks()
    render(<McpEditor entry={entry} onClose={vi.fn()} onSaved={vi.fn()} />)

    // Replace only the first secret
    const replaceButtons = screen.getAllByText('Replace secret')
    fireEvent.click(replaceButtons[0])

    const newInput = screen.getByPlaceholderText('Enter new value') as HTMLInputElement
    fireEvent.change(newInput, { target: { value: 'new_github_token' } })

    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => {
      const call = mockInvoke.mock.calls.find((c) => c[0] === 'mcp:registry-update')
      expect(call).toBeDefined()
      const payload = call![1] as { secrets?: Record<string, string> }
      expect(payload.secrets).toEqual({ GITHUB_TOKEN: 'new_github_token' })
      // OTHER_SECRET was not touched, so must not be sent
      expect(payload.secrets!.OTHER_SECRET).toBeUndefined()
    })
  })

  it('does not send a replaced-but-empty secret', async () => {
    setupMocks()
    render(<McpEditor entry={entry} onClose={vi.fn()} onSaved={vi.fn()} />)

    const replaceButtons = screen.getAllByText('Replace secret')
    fireEvent.click(replaceButtons[0])

    // Leave value blank, then save
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => {
      const call = mockInvoke.mock.calls.find((c) => c[0] === 'mcp:registry-update')
      expect(call).toBeDefined()
      const payload = call![1] as { secrets?: unknown }
      expect(payload.secrets).toBeUndefined()
    })
  })

  it('shows error banner on update failure', async () => {
    setupMocks({ success: false, error: 'Blocked.' })
    render(<McpEditor entry={entry} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => {
      expect(screen.getByText('Blocked.')).toBeDefined()
    })
  })
})
