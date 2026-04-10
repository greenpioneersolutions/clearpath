// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import AgentMarketplace from './AgentMarketplace'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

const sampleAgents = [
  {
    id: 'a1', name: 'Code Reviewer', description: 'Reviews code', author: 'Alice',
    cli: 'copilot' as const, category: 'Development', prompt: 'Review this code',
    tools: ['shell'], downloads: 150, installed: false,
  },
  {
    id: 'a2', name: 'Doc Writer', description: 'Writes docs', author: 'Bob',
    cli: 'claude' as const, category: 'Documentation', prompt: 'Write docs',
    downloads: 80, installed: true,
  },
]

describe('AgentMarketplace', () => {
  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<AgentMarketplace />)
    expect(screen.getByText('Agent Marketplace')).toBeInTheDocument()
  })

  it('renders agents after loading', async () => {
    mockInvoke.mockResolvedValue(sampleAgents)
    render(<AgentMarketplace />)

    await waitFor(() => {
      expect(screen.getByText('Code Reviewer')).toBeInTheDocument()
    })
    expect(screen.getByText('Doc Writer')).toBeInTheDocument()
  })

  it('shows Install button for non-installed agents', async () => {
    mockInvoke.mockResolvedValue(sampleAgents)
    render(<AgentMarketplace />)

    await waitFor(() => {
      expect(screen.getByText('Install')).toBeInTheDocument()
    })
  })

  it('shows Remove button for installed agents', async () => {
    mockInvoke.mockResolvedValue(sampleAgents)
    render(<AgentMarketplace />)

    await waitFor(() => {
      expect(screen.getByText('Remove')).toBeInTheDocument()
    })
  })

  it('calls install on Install click', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'team:list-marketplace') return Promise.resolve(sampleAgents)
      return Promise.resolve(undefined)
    })

    render(<AgentMarketplace />)

    await waitFor(() => {
      expect(screen.getByText('Install')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Install'))
    expect(mockInvoke).toHaveBeenCalledWith('team:install-marketplace-agent', { id: 'a1' })
  })

  it('calls uninstall on Remove click', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'team:list-marketplace') return Promise.resolve(sampleAgents)
      return Promise.resolve(undefined)
    })

    render(<AgentMarketplace />)

    await waitFor(() => {
      expect(screen.getByText('Remove')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Remove'))
    expect(mockInvoke).toHaveBeenCalledWith('team:uninstall-marketplace-agent', { id: 'a2' })
  })

  it('filters agents by search text', async () => {
    mockInvoke.mockResolvedValue(sampleAgents)
    render(<AgentMarketplace />)

    await waitFor(() => {
      expect(screen.getByText('Code Reviewer')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search agents...')
    fireEvent.change(searchInput, { target: { value: 'doc' } })

    expect(screen.queryByText('Code Reviewer')).not.toBeInTheDocument()
    expect(screen.getByText('Doc Writer')).toBeInTheDocument()
  })

  it('toggles prompt visibility when View prompt is clicked', async () => {
    mockInvoke.mockResolvedValue(sampleAgents)
    render(<AgentMarketplace />)

    await waitFor(() => {
      expect(screen.getAllByText('View prompt')[0]).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByText('View prompt')[0])
    expect(screen.getByText('Review this code')).toBeInTheDocument()
    expect(screen.getByText('Hide prompt')).toBeInTheDocument()
  })
})
