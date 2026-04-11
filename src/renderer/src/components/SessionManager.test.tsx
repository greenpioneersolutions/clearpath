// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import SessionManager from './SessionManager'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

const makeSessions = (overrides: Partial<{
  sessionId: string
  cli: 'copilot' | 'claude'
  name: string
  firstPrompt: string
  startedAt: number
  endedAt: number
  archived: boolean
  messageLog: unknown[]
}>[] = [{}]) =>
  overrides.map((o, i) => ({
    sessionId: `session-${i + 1}`,
    cli: 'copilot' as const,
    name: `Session ${i + 1}`,
    firstPrompt: `First prompt ${i + 1}`,
    startedAt: Date.now() - (i + 1) * 60000,
    messageLog: [{}, {}],
    ...o,
  }))

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
  mockInvoke.mockResolvedValue([])
})

describe('SessionManager', () => {
  const baseProps = {
    onClose: vi.fn(),
    onSelectSession: vi.fn(),
    currentSessionId: null as string | null,
  }

  beforeEach(() => {
    baseProps.onClose.mockReset()
    baseProps.onSelectSession.mockReset()
  })

  it('renders modal title', async () => {
    render(<SessionManager {...baseProps} />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('renders tabs', async () => {
    render(<SessionManager {...baseProps} />)
    expect(screen.getByText(/Active/)).toBeInTheDocument()
    expect(screen.getByText(/Archived/)).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
  })

  it('loads sessions on mount', async () => {
    render(<SessionManager {...baseProps} />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:get-persisted-sessions')
    })
  })

  it('shows empty state when no sessions', async () => {
    render(<SessionManager {...baseProps} />)
    await waitFor(() => {
      expect(screen.getByText(/No sessions/)).toBeInTheDocument()
    })
  })

  it('has proper dialog role', () => {
    render(<SessionManager {...baseProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders sessions when available', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ name: 'My Session' }]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => {
      expect(screen.getByText('My Session')).toBeInTheDocument()
    })
  })

  it('calls onClose when backdrop is clicked', async () => {
    render(<SessionManager {...baseProps} />)
    // Click the outer backdrop div
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    fireEvent.click(backdrop)
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('does not close when dialog itself is clicked', async () => {
    render(<SessionManager {...baseProps} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(baseProps.onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Close (X) button is clicked', async () => {
    render(<SessionManager {...baseProps} />)
    // Two elements share this aria-label (header X + footer Done button); pick the first (header X)
    const [closeBtn] = screen.getAllByLabelText('Close session manager')
    fireEvent.click(closeBtn)
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('calls onClose when Done button is clicked', async () => {
    render(<SessionManager {...baseProps} />)
    fireEvent.click(screen.getByText('Done'))
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('selects session and closes when session row is clicked', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ sessionId: 'sess-x', name: 'Click Me' }]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Click Me'))
    fireEvent.click(screen.getByText('Click Me'))
    expect(baseProps.onSelectSession).toHaveBeenCalledWith('sess-x')
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('shows "current" badge for the current session', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ sessionId: 'current-sess', name: 'Current' }]))
    render(<SessionManager {...{ ...baseProps, currentSessionId: 'current-sess' }} />)
    await waitFor(() => {
      expect(screen.getByText('current')).toBeInTheDocument()
    })
  })

  it('switches to Archived tab and shows "No archived sessions" message', async () => {
    render(<SessionManager {...baseProps} />)
    fireEvent.click(screen.getByText(/Archived/))
    await waitFor(() => {
      expect(screen.getByText('No archived sessions')).toBeInTheDocument()
    })
  })

  it('shows archived sessions in Archived tab', async () => {
    mockInvoke.mockResolvedValue(makeSessions([
      { name: 'Active One', archived: false },
      { name: 'Archived One', archived: true },
    ]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Active One'))
    fireEvent.click(screen.getByText(/Archived/))
    await waitFor(() => {
      expect(screen.getByText('Archived One')).toBeInTheDocument()
      expect(screen.queryByText('Active One')).not.toBeInTheDocument()
    })
  })

  it('switches to Search tab and shows search input', async () => {
    render(<SessionManager {...baseProps} />)
    fireEvent.click(screen.getByText('Search'))
    await waitFor(() => {
      expect(screen.getByLabelText('Search sessions')).toBeInTheDocument()
    })
  })

  it('shows initial search hint when no query', async () => {
    render(<SessionManager {...baseProps} />)
    fireEvent.click(screen.getByText('Search'))
    await waitFor(() => {
      expect(screen.getByText(/Type to search/)).toBeInTheDocument()
    })
  })

  it('shows "No matches found" when search returns empty results', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve([])
      if (channel === 'cli:search-sessions') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<SessionManager {...baseProps} />)
    fireEvent.click(screen.getByText('Search'))
    await waitFor(() => screen.getByLabelText('Search sessions'))
    fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: 'xyz' } })
    await waitFor(() => {
      expect(screen.getByText('No matches found')).toBeInTheDocument()
    }, { timeout: 1500 })
  })

  it('shows search results when cli:search-sessions returns data', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve([])
      if (channel === 'cli:search-sessions') return Promise.resolve([{
        sessionId: 'sr1',
        name: 'Found Session',
        cli: 'copilot',
        startedAt: Date.now(),
        matches: [{ content: 'hello world', sender: 'user', lineIndex: 1 }],
      }])
      return Promise.resolve(null)
    })
    render(<SessionManager {...baseProps} />)
    fireEvent.click(screen.getByText('Search'))
    await waitFor(() => screen.getByLabelText('Search sessions'))
    fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: 'hello' } })
    await waitFor(() => {
      expect(screen.getByText('Found Session')).toBeInTheDocument()
      expect(screen.getByText('hello world')).toBeInTheDocument()
    }, { timeout: 1500 })
  })

  it('clicking search result selects session and closes', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve([])
      if (channel === 'cli:search-sessions') return Promise.resolve([{
        sessionId: 'found-sess',
        name: 'Match',
        cli: 'copilot',
        startedAt: Date.now(),
        matches: [{ content: 'test content', sender: 'ai', lineIndex: 0 }],
      }])
      return Promise.resolve(null)
    })
    render(<SessionManager {...baseProps} />)
    fireEvent.click(screen.getByText('Search'))
    await waitFor(() => screen.getByLabelText('Search sessions'))
    fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: 'test' } })
    await waitFor(() => screen.getByText('Match'), { timeout: 1500 })
    fireEvent.click(screen.getByText('Match'))
    expect(baseProps.onSelectSession).toHaveBeenCalledWith('found-sess')
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('toggles regex search with the .* button', async () => {
    render(<SessionManager {...baseProps} />)
    fireEvent.click(screen.getByText('Search'))
    await waitFor(() => screen.getByLabelText('Toggle regex search'))
    const regexBtn = screen.getByLabelText('Toggle regex search')
    expect(regexBtn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(regexBtn)
    expect(regexBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows checkbox for each session', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ name: 'A' }, { name: 'B' }]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('A'))
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
  })

  it('selects session via checkbox and shows bulk actions', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ sessionId: 'chk-1', name: 'CheckMe' }]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('CheckMe'))
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(screen.getByText('1 selected')).toBeInTheDocument()
    })
  })

  it('bulk deletes selected sessions when Delete is clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve(
        makeSessions([{ sessionId: 's1', name: 'Delete Me' }])
      )
      if (channel === 'cli:delete-sessions') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Delete Me'))
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => screen.getByText('Delete'))
    fireEvent.click(screen.getByText('Delete'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:delete-sessions', { sessionIds: ['s1'] })
    })
  })

  it('clears selection when "Clear" button is clicked', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ name: 'Test' }]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Test'))
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => screen.getByText('Clear'))
    fireEvent.click(screen.getByText('Clear'))
    await waitFor(() => {
      expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
    })
  })

  it('shows Select all / Deselect all in footer', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ name: 'A' }, { name: 'B' }]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('A'))
    expect(screen.getByText('Select all')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Select all'))
    await waitFor(() => {
      expect(screen.getByText('Deselect all')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Deselect all'))
    await waitFor(() => {
      expect(screen.getByText('Select all')).toBeInTheDocument()
    })
  })

  it('shows delete confirmation when trash button is clicked', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ name: 'My Session' }]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('My Session'))
    const sessionRow = screen.getByText('My Session').closest('[class*="group"]') as HTMLElement
    fireEvent.mouseEnter(sessionRow)
    const deleteBtn = screen.getByTitle('Delete')
    fireEvent.click(deleteBtn)
    await waitFor(() => {
      expect(screen.getByText('Yes')).toBeInTheDocument()
      expect(screen.getByText('No')).toBeInTheDocument()
    })
  })

  it('deletes session when Yes is clicked in confirm', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve(
        makeSessions([{ sessionId: 'del-1', name: 'Delete Me' }])
      )
      if (channel === 'cli:delete-session') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Delete Me'))
    fireEvent.click(screen.getByTitle('Delete'))
    await waitFor(() => screen.getByText('Yes'))
    fireEvent.click(screen.getByText('Yes'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:delete-session', { sessionId: 'del-1' })
    })
  })

  it('cancels delete when No is clicked', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ name: 'Keep Me' }]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Keep Me'))
    fireEvent.click(screen.getByTitle('Delete'))
    await waitFor(() => screen.getByText('Yes'))
    fireEvent.click(screen.getByText('No'))
    await waitFor(() => {
      expect(screen.queryByText('Yes')).not.toBeInTheDocument()
    })
  })

  it('opens rename mode when Rename button is clicked', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ name: 'Rename Me' }]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Rename Me'))
    fireEvent.click(screen.getByTitle('Rename'))
    await waitFor(() => {
      expect(screen.getByLabelText('Rename session')).toBeInTheDocument()
    })
  })

  it('calls cli:rename-session when Enter pressed in rename input', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve(
        makeSessions([{ sessionId: 'ren-1', name: 'Old Name' }])
      )
      if (channel === 'cli:rename-session') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Old Name'))
    fireEvent.click(screen.getByTitle('Rename'))
    await waitFor(() => screen.getByLabelText('Rename session'))
    const renameInput = screen.getByLabelText('Rename session')
    fireEvent.change(renameInput, { target: { value: 'New Name' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:rename-session', { sessionId: 'ren-1', name: 'New Name' })
    })
  })

  it('cancels rename when Escape is pressed', async () => {
    mockInvoke.mockResolvedValue(makeSessions([{ name: 'Escapable' }]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Escapable'))
    fireEvent.click(screen.getByTitle('Rename'))
    await waitFor(() => screen.getByLabelText('Rename session'))
    fireEvent.keyDown(screen.getByLabelText('Rename session'), { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByLabelText('Rename session')).not.toBeInTheDocument()
    })
  })

  it('calls cli:archive-session when Archive button is clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve(
        makeSessions([{ sessionId: 'arc-1', name: 'Archive Me', archived: false }])
      )
      if (channel === 'cli:archive-session') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Archive Me'))
    fireEvent.click(screen.getByTitle('Archive'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:archive-session', { sessionId: 'arc-1', archived: true })
    })
  })

  it('filters sessions by Copilot CLI', async () => {
    mockInvoke.mockResolvedValue(makeSessions([
      { name: 'Copilot Session', cli: 'copilot' },
      { name: 'Claude Session', cli: 'claude' },
    ]))
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Copilot Session'))
    fireEvent.change(screen.getByLabelText('Filter by CLI'), { target: { value: 'copilot' } })
    await waitFor(() => {
      expect(screen.getByText('Copilot Session')).toBeInTheDocument()
      expect(screen.queryByText('Claude Session')).not.toBeInTheDocument()
    })
  })

  it('sorts sessions by oldest first', async () => {
    const now = Date.now()
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', cli: 'copilot', name: 'Recent', startedAt: now - 1000, messageLog: [] },
      { sessionId: 's2', cli: 'copilot', name: 'Old', startedAt: now - 100000, messageLog: [] },
    ])
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Recent'))
    // Default sort is 'recent', so Recent comes first
    const beforeSort = screen.getAllByText(/^(Recent|Old)$/)
    expect(beforeSort[0]).toHaveTextContent('Recent')
    fireEvent.change(screen.getByLabelText('Sort sessions by'), { target: { value: 'oldest' } })
    await waitFor(() => {
      const items = screen.getAllByText(/^(Recent|Old)$/)
      expect(items[0]).toHaveTextContent('Old')
    })
  })

  it('sorts sessions by name', async () => {
    mockInvoke.mockResolvedValue([
      ...makeSessions([{ name: 'Zebra', startedAt: Date.now() - 1000 }]),
      ...makeSessions([{ name: 'Apple', startedAt: Date.now() - 2000 }]),
    ])
    render(<SessionManager {...baseProps} />)
    await waitFor(() => screen.getByText('Zebra'))
    fireEvent.change(screen.getByLabelText('Sort sessions by'), { target: { value: 'name' } })
    await waitFor(() => {
      const items = screen.getAllByText(/Zebra|Apple/)
      expect(items[0]).toHaveTextContent('Apple')
    })
  })

  it('shows tab counts correctly', async () => {
    mockInvoke.mockResolvedValue([
      ...makeSessions([{ name: 'Active', archived: false }]),
      ...makeSessions([{ name: 'Archived', archived: true }]),
    ])
    render(<SessionManager {...baseProps} />)
    await waitFor(() => {
      expect(screen.getByText('Active (1)')).toBeInTheDocument()
      expect(screen.getByText('Archived (1)')).toBeInTheDocument()
    })
  })
})
