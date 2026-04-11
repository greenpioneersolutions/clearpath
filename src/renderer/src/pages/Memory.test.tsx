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
    if (channel === 'app:get-cwd') return Promise.resolve('/test/dir')
    if (channel === 'cli:list-sessions') return Promise.resolve([])
    if (channel === 'notes:list') return Promise.resolve([])
    if (channel === 'notes:tags') return Promise.resolve([])
    if (channel === 'notes:get-tags') return Promise.resolve([])
    if (channel === 'notes:get-categories') return Promise.resolve([])
    if (channel === 'memory:list-config-files') return Promise.resolve([])
    if (channel === 'memory:list-entries') return Promise.resolve([])
    if (channel === 'starter-pack:get-memories') return Promise.resolve([])
    if (channel === 'starter-pack:get-installed-memories') return Promise.resolve([])
    return Promise.resolve(null)
  })
})

import Memory from './Memory'

describe('Memory', () => {
  it('renders page heading', () => {
    render(<Memory />)
    expect(screen.getByText('Memory & Context')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<Memory />)
    expect(screen.getByText(/Manage config files, instructions/)).toBeInTheDocument()
  })

  it('renders CLI selector', () => {
    render(<Memory />)
    expect(screen.getByText('Copilot')).toBeInTheDocument()
    expect(screen.getByText('Claude')).toBeInTheDocument()
  })

  it('renders all tab buttons', () => {
    render(<Memory />)
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Starter Memories')).toBeInTheDocument()
    expect(screen.getByText('Config Files')).toBeInTheDocument()
    expect(screen.getByText('Instructions')).toBeInTheDocument()
    expect(screen.getByText('CLI Memory')).toBeInTheDocument()
    expect(screen.getByText('Context Usage')).toBeInTheDocument()
  })

  it('shows Notes tab content by default', async () => {
    render(<Memory />)
    // NotesManager calls notes:list (may include undefined second arg)
    await waitFor(() => {
      const notesCalls = mockInvoke.mock.calls.filter((c: unknown[]) => c[0] === 'notes:list')
      expect(notesCalls.length).toBeGreaterThan(0)
    })
  })

  it('calls app:get-cwd on mount', () => {
    render(<Memory />)
    expect(mockInvoke).toHaveBeenCalledWith('app:get-cwd')
  })

  it('calls cli:list-sessions on mount', () => {
    render(<Memory />)
    expect(mockInvoke).toHaveBeenCalledWith('cli:list-sessions')
  })

  it('switches tabs', () => {
    render(<Memory />)
    fireEvent.click(screen.getByText('Starter Memories'))
    // Tab should be active
    const tab = screen.getByText('Starter Memories')
    expect(tab.className).toContain('border-indigo-600')
  })
})
