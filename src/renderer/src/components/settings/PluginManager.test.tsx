// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import PluginManager from './PluginManager'

const mockInvoke = vi.fn()

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()

  // Mock navigator.clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  })
})

describe('PluginManager', () => {
  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<PluginManager cli="copilot" />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows empty state when no plugins installed', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="copilot" />)
    await waitFor(() => expect(screen.getByText('No plugins installed')).toBeInTheDocument())
  })

  it('shows copilot plugin directory path', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="copilot" />)
    await waitFor(() => expect(screen.getByText(/~\/.copilot\/plugins\//)).toBeInTheDocument())
  })

  it('shows claude plugin directory path', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="claude" />)
    await waitFor(() => expect(screen.getByText(/~\/.claude\/plugins\//)).toBeInTheDocument())
  })

  it('renders plugin list', async () => {
    mockInvoke.mockResolvedValue([
      { name: 'my-plugin', source: '/path/to/plugin', version: '1.0.0', description: 'A test plugin', enabled: true, cli: 'copilot' },
      { name: 'another-plugin', source: 'github/repo', version: '2.0.0', description: 'Another plugin', enabled: false, cli: 'copilot' },
    ])
    render(<PluginManager cli="copilot" />)
    await waitFor(() => expect(screen.getByText('my-plugin')).toBeInTheDocument())
    expect(screen.getByText('another-plugin')).toBeInTheDocument()
    expect(screen.getByText('v1.0.0')).toBeInTheDocument()
    expect(screen.getByText('A test plugin')).toBeInTheDocument()
  })

  it('shows toggle switches for each plugin', async () => {
    mockInvoke.mockResolvedValue([
      { name: 'my-plugin', source: '/path', enabled: true, cli: 'copilot' },
    ])
    render(<PluginManager cli="copilot" />)
    await waitFor(() => expect(screen.getByText('my-plugin')).toBeInTheDocument())
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('renders heading for copilot', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="copilot" />)
    await waitFor(() => expect(screen.getByText('Plugins')).toBeInTheDocument())
    expect(screen.getByText(/Installed plugins for Copilot/)).toBeInTheDocument()
  })

  it('renders heading for claude', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="claude" />)
    await waitFor(() => expect(screen.getByText(/Installed plugins for Claude Code/)).toBeInTheDocument())
  })

  it('shows install form when Install Plugin is clicked', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="copilot" />)
    await waitFor(() => expect(screen.getByText('+ Install Plugin')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Install Plugin'))
    expect(screen.getByPlaceholderText(/e.g. owner\/repo/)).toBeInTheDocument()
  })

  it('hides install form when Cancel is clicked', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="copilot" />)
    await waitFor(() => expect(screen.getByText('+ Install Plugin')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Install Plugin'))
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText(/e.g. owner\/repo/)).not.toBeInTheDocument()
  })

  it('shows install command when plugin path is entered for copilot', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="copilot" />)
    await waitFor(() => expect(screen.getByText('+ Install Plugin')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Install Plugin'))
    fireEvent.change(screen.getByPlaceholderText(/e.g. owner\/repo/), { target: { value: 'test/plugin' } })
    expect(screen.getByText('copilot /plugin install test/plugin')).toBeInTheDocument()
  })

  it('shows install command for claude', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="claude" />)
    await waitFor(() => expect(screen.getByText('+ Install Plugin')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Install Plugin'))
    fireEvent.change(screen.getByPlaceholderText(/e.g. \/path\/to\/plugin/), { target: { value: '/my/plugin' } })
    expect(screen.getByText('claude mcp add /my/plugin')).toBeInTheDocument()
  })

  it('has Copy button for install command', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="copilot" />)
    await waitFor(() => expect(screen.getByText('+ Install Plugin')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Install Plugin'))
    fireEvent.change(screen.getByPlaceholderText(/e.g. owner\/repo/), { target: { value: 'x/y' } })
    fireEvent.click(screen.getByText('Copy'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copilot /plugin install x/y')
  })

  it('calls settings:list-plugins when Refresh is clicked', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="copilot" />)
    await waitFor(() => expect(screen.getByText('Refresh')).toBeInTheDocument())
    mockInvoke.mockClear()
    fireEvent.click(screen.getByText('Refresh'))
    expect(mockInvoke).toHaveBeenCalledWith('settings:list-plugins', { cli: 'copilot' })
  })

  it('calls settings:list-plugins with correct cli', async () => {
    mockInvoke.mockResolvedValue([])
    render(<PluginManager cli="claude" />)
    await waitFor(() => expect(screen.getByText('Refresh')).toBeInTheDocument())
    expect(mockInvoke).toHaveBeenCalledWith('settings:list-plugins', { cli: 'claude' })
  })
})
