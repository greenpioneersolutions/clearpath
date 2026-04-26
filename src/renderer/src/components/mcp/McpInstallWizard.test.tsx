// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import McpInstallWizard from './McpInstallWizard'
import type { McpCatalogEntry } from '../../types/mcp'

const mockInvoke = vi.fn()

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
})

const githubEntry: McpCatalogEntry = {
  id: 'github',
  displayName: 'GitHub',
  description: 'Work with GitHub.',
  homepageUrl: 'https://example.com',
  command: 'npx',
  args: ['-y', '@mcp/github'],
  envSchema: [
    {
      name: 'GITHUB_TOKEN',
      description: 'Personal access token',
      secret: true,
      required: true,
      placeholder: 'ghp_...',
    },
  ],
}

function setupMocks(addResponse: { success: boolean; id?: string; error?: string; warning?: string } = { success: true, id: 'new-1' }) {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'workspace:get-active') return Promise.resolve(null)
    if (channel === 'workspace:list') return Promise.resolve([])
    if (channel === 'mcp:registry-add') return Promise.resolve(addResponse)
    return Promise.resolve(null)
  })
}

describe('McpInstallWizard', () => {
  it('pre-fills display name, command, and args from catalog', () => {
    setupMocks()
    render(
      <McpInstallWizard
        catalogEntry={githubEntry}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect((screen.getByDisplayValue('GitHub') as HTMLInputElement).value).toBe('GitHub')
    expect((screen.getByDisplayValue('npx') as HTMLInputElement).value).toBe('npx')
    expect((screen.getByDisplayValue('-y @mcp/github') as HTMLInputElement).value).toBe('-y @mcp/github')
  })

  it('disables Install button when required secret is empty', () => {
    setupMocks()
    render(
      <McpInstallWizard
        catalogEntry={githubEntry}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    const btn = screen.getByText('Install') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('submits with secrets routed to secrets, not env', async () => {
    setupMocks()
    const onSaved = vi.fn()
    render(
      <McpInstallWizard
        catalogEntry={githubEntry}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )

    // Fill the secret
    const secretInput = screen.getByPlaceholderText('ghp_...') as HTMLInputElement
    fireEvent.change(secretInput, { target: { value: 'ghp_secret_value' } })

    fireEvent.click(screen.getByText('Install'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'mcp:registry-add',
        expect.objectContaining({
          entry: expect.objectContaining({
            name: 'GitHub',
            command: 'npx',
            args: ['-y', '@mcp/github'],
            env: {}, // secret did NOT go into env
            targets: { copilot: true, claude: true },
            source: 'catalog',
            catalogId: 'github',
          }),
          secrets: { GITHUB_TOKEN: 'ghp_secret_value' },
        }),
      )
    })
    expect(onSaved).toHaveBeenCalledWith('GitHub', { copilot: true, claude: true })
  })

  it('shows inline error and does not close on failure', async () => {
    setupMocks({ success: false, error: 'Command is blocked for safety.' })
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(
      <McpInstallWizard
        catalogEntry={githubEntry}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )
    const secretInput = screen.getByPlaceholderText('ghp_...') as HTMLInputElement
    fireEvent.change(secretInput, { target: { value: 'abc' } })

    fireEvent.click(screen.getByText('Install'))
    await waitFor(() => {
      expect(screen.getByText('Command is blocked for safety.')).toBeDefined()
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on success even when a warning is returned', async () => {
    setupMocks({ success: true, id: 'id1', warning: 'Stored plaintext.' })
    const onSaved = vi.fn()
    const onWarning = vi.fn()
    render(
      <McpInstallWizard
        catalogEntry={githubEntry}
        onClose={vi.fn()}
        onSaved={onSaved}
        onWarning={onWarning}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), { target: { value: 'tok' } })
    fireEvent.click(screen.getByText('Install'))
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
      expect(onWarning).toHaveBeenCalledWith('Stored plaintext.')
    })
  })

  it('custom mode allows free-form env rows and Save', async () => {
    setupMocks()
    const onSaved = vi.fn()
    render(<McpInstallWizard onClose={vi.fn()} onSaved={onSaved} />)

    // Fill display name + command + args
    fireEvent.change(screen.getByPlaceholderText('e.g. GitHub'), { target: { value: 'My Server' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. npx'), { target: { value: 'node' } })

    // Click Save
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'mcp:registry-add',
        expect.objectContaining({
          entry: expect.objectContaining({
            name: 'My Server',
            command: 'node',
            source: 'custom',
          }),
        }),
      )
    })
  })

  it('requires at least one target', async () => {
    setupMocks()
    render(<McpInstallWizard onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. GitHub'), { target: { value: 'X' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. npx'), { target: { value: 'node' } })

    // Uncheck both targets
    const copilot = screen.getByLabelText('CoPilot CLI') as HTMLInputElement
    const claude = screen.getByLabelText('Claude Code CLI') as HTMLInputElement
    fireEvent.click(copilot)
    fireEvent.click(claude)

    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true)
  })
})
