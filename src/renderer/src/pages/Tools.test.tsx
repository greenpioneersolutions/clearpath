// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

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
  mockInvoke.mockImplementation((channel: string) => {
    // McpManager calls
    if (channel === 'tools:list-mcp-servers') return Promise.resolve([])
    if (channel === 'app:get-cwd') return Promise.resolve('/test')
    // PermissionRequestHandler calls
    if (channel === 'tools:get-pending-permissions') return Promise.resolve([])
    // ToolToggles calls
    if (channel === 'tools:get-config') return Promise.resolve({})
    return Promise.resolve(null)
  })
})

import Tools from './Tools'

describe('Tools', () => {
  it('renders page heading', () => {
    render(<Tools />)
    expect(screen.getByText('Tools & Permissions')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<Tools />)
    expect(screen.getByText(/Configure tool permissions, MCP servers/)).toBeInTheDocument()
  })

  it('renders CLI selector buttons', () => {
    render(<Tools />)
    expect(screen.getByText('Copilot')).toBeInTheDocument()
    expect(screen.getByText('Claude')).toBeInTheDocument()
  })

  it('renders all tab buttons', () => {
    render(<Tools />)
    // "Permission Mode" appears as both tab label and heading in PermissionModeSelector
    expect(screen.getAllByText('Permission Mode').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Tool Toggles')).toBeInTheDocument()
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
    expect(screen.getByText('Requests')).toBeInTheDocument()
  })

  it('shows CLI flag preview section', () => {
    render(<Tools />)
    expect(screen.getByText('CLI Flag Preview')).toBeInTheDocument()
  })

  it('shows default no flags message in preview', () => {
    render(<Tools />)
    expect(screen.getByText('No flags configured')).toBeInTheDocument()
  })

  it('shows Copy button in preview', () => {
    render(<Tools />)
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('switches between tabs', async () => {
    render(<Tools />)
    // Click MCP Servers tab
    fireEvent.click(screen.getByText('MCP Servers'))
    await waitFor(() => {
      // McpManager loads and shows content
      expect(mockInvoke).toHaveBeenCalledWith('tools:list-mcp-servers', expect.any(Object))
    })
  })

  it('toggles CLI selector', () => {
    render(<Tools />)
    // Default is copilot
    fireEvent.click(screen.getByText('Claude'))
    // The CLI selector should now highlight Claude
    const claudeBtn = screen.getByText('Claude')
    expect(claudeBtn.className).toContain('bg-indigo-600')
  })
})
