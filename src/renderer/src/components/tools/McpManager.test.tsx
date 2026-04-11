// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import McpManager from './McpManager'

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

const mockServers = [
  {
    id: 'mcp-1',
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/home'],
    env: {},
    enabled: true,
    source: 'project' as const,
    cli: 'claude' as const,
  },
  {
    id: 'mcp-2',
    name: 'github',
    command: 'node',
    args: ['github-mcp.js'],
    env: { GITHUB_TOKEN: 'xxx' },
    enabled: false,
    source: 'user' as const,
    cli: 'claude' as const,
  },
]

function setupMocks(servers = mockServers) {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'tools:list-mcp-servers') return Promise.resolve(servers)
    if (channel === 'tools:toggle-mcp-server') return Promise.resolve()
    if (channel === 'tools:remove-mcp-server') return Promise.resolve()
    if (channel === 'tools:add-mcp-server') return Promise.resolve({ success: true })
    return Promise.resolve(null)
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('McpManager', () => {
  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<McpManager cli="claude" />)
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('renders server list after loading', async () => {
    setupMocks()
    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('filesystem')).toBeDefined()
      expect(screen.getByText('github')).toBeDefined()
    })
  })

  it('shows empty state when no servers', async () => {
    setupMocks([])
    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('No MCP servers configured')).toBeDefined()
    })
  })

  it('shows correct header for Claude', async () => {
    setupMocks()
    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText(/Claude Code/)).toBeDefined()
    })
  })

  it('shows correct header for Copilot', async () => {
    setupMocks()
    render(<McpManager cli="copilot" />)
    await waitFor(() => {
      expect(screen.getByText(/Copilot/)).toBeDefined()
    })
  })

  it('shows server command and args', async () => {
    setupMocks()
    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText(/npx -y @modelcontextprotocol\/server-filesystem \/home/)).toBeDefined()
    })
  })

  it('shows env vars for servers that have them', async () => {
    setupMocks()
    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText(/GITHUB_TOKEN/)).toBeDefined()
    })
  })

  it('shows source badges (project/user)', async () => {
    setupMocks()
    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('project')).toBeDefined()
      expect(screen.getByText('user')).toBeDefined()
    })
  })

  it('toggles server enabled state', async () => {
    setupMocks()
    render(<McpManager cli="claude" />)

    await waitFor(() => {
      expect(screen.getByText('filesystem')).toBeDefined()
    })

    const toggles = screen.getAllByRole('switch')
    fireEvent.click(toggles[0]) // Toggle filesystem server

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('tools:toggle-mcp-server', expect.objectContaining({
        cli: 'claude',
        name: 'filesystem',
        enabled: false,
      }))
    })
  })

  it('removes server after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    setupMocks()
    render(<McpManager cli="claude" />)

    await waitFor(() => {
      expect(screen.getByText('filesystem')).toBeDefined()
    })

    // Click the remove button (trash icon)
    const removeButtons = document.querySelectorAll('[title="Remove"]')
    fireEvent.click(removeButtons[0])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('tools:remove-mcp-server', expect.objectContaining({
        cli: 'claude',
        name: 'filesystem',
      }))
    })
  })

  it('toggles add form', async () => {
    setupMocks()
    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('+ Add Server')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ Add Server'))
    expect(screen.getByPlaceholderText('e.g. my-mcp-server')).toBeDefined()
    expect(screen.getByPlaceholderText('e.g. npx, node, python')).toBeDefined()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('e.g. my-mcp-server')).toBeNull()
  })

  it('adds new server', async () => {
    setupMocks()
    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('+ Add Server')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ Add Server'))

    fireEvent.change(screen.getByPlaceholderText('e.g. my-mcp-server'), {
      target: { value: 'my-server' },
    })
    fireEvent.change(screen.getByPlaceholderText('e.g. npx, node, python'), {
      target: { value: 'npx' },
    })
    fireEvent.change(screen.getByPlaceholderText('e.g. -y @modelcontextprotocol/server-filesystem /path/to/dir'), {
      target: { value: '-y my-pkg' },
    })

    fireEvent.click(screen.getByText('Add Server'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('tools:add-mcp-server', expect.objectContaining({
        cli: 'claude',
        scope: 'project',
        name: 'my-server',
        command: 'npx',
        args: ['-y', 'my-pkg'],
      }))
    })
  })

  it('shows error when add fails', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'tools:list-mcp-servers') return Promise.resolve([])
      if (channel === 'tools:add-mcp-server') return Promise.resolve({ success: false, error: 'Permission denied' })
      return Promise.resolve(null)
    })

    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('+ Add Server')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ Add Server'))
    fireEvent.change(screen.getByPlaceholderText('e.g. my-mcp-server'), { target: { value: 'srv' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. npx, node, python'), { target: { value: 'node' } })
    fireEvent.click(screen.getByText('Add Server'))

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeDefined()
    })
  })

  it('shows validation error when name or command empty', async () => {
    setupMocks()
    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('+ Add Server')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ Add Server'))
    fireEvent.click(screen.getByText('Add Server'))

    await waitFor(() => {
      expect(screen.getByText('Name and command are required')).toBeDefined()
    })
  })

  it('refreshes server list on Refresh click', async () => {
    setupMocks()
    render(<McpManager cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('filesystem')).toBeDefined()
    })

    mockInvoke.mockClear()
    setupMocks()

    fireEvent.click(screen.getByText('Refresh'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('tools:list-mcp-servers', expect.objectContaining({
        cli: 'claude',
      }))
    })
  })

  it('passes workingDirectory to IPC calls', async () => {
    setupMocks()
    render(<McpManager cli="copilot" workingDirectory="/my/project" />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('tools:list-mcp-servers', expect.objectContaining({
        cli: 'copilot',
        workingDirectory: '/my/project',
      }))
    })
  })
})
