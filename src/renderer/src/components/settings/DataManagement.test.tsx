// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import DataManagement from './DataManagement'

const mockInvoke = vi.fn()

const mockStats = {
  stores: [
    { id: 'sessions', label: 'Sessions', description: 'CLI sessions', sizeBytes: 1024, sizeFormatted: '1 KB', entryCount: 5 },
    { id: 'settings', label: 'Settings', description: 'App settings', sizeBytes: 512, sizeFormatted: '512 B', entryCount: 1 },
    { id: 'costs', label: 'Costs', description: 'Cost records', sizeBytes: 0, sizeFormatted: '0 B', entryCount: 0 },
  ],
  totalSizeBytes: 1536,
  totalSizeFormatted: '1.5 KB',
  knowledgeBase: { files: 3, sizeBytes: 2048, sizeFormatted: '2 KB' },
}

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'data:get-storage-stats') return Promise.resolve(mockStats)
    if (channel === 'data:clear-store') return Promise.resolve()
    if (channel === 'data:clear-all') return Promise.resolve()
    if (channel === 'data:get-notes-for-compact') return Promise.resolve([])
    return Promise.resolve()
  })

  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DataManagement', () => {
  it('shows loading text initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {})) // Never resolves
    render(<DataManagement />)
    expect(screen.getByText('Loading storage data...')).toBeInTheDocument()
  })

  it('displays storage stats after loading', async () => {
    render(<DataManagement />)
    await waitFor(() => expect(screen.getByText('1.5 KB')).toBeInTheDocument())
    expect(screen.getByText('Total App Data')).toBeInTheDocument()
  })

  it('shows active store count', async () => {
    render(<DataManagement />)
    // 2 stores have non-zero size
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
    expect(screen.getByText('Active Stores')).toBeInTheDocument()
  })

  it('shows knowledge base file count', async () => {
    render(<DataManagement />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
  })

  it('renders storage breakdown bars for non-empty stores', async () => {
    render(<DataManagement />)
    await waitFor(() => expect(screen.getByText('Storage Breakdown')).toBeInTheDocument())
    // Sessions and Settings labels appear in breakdown and clear sections
    const sessionsLabels = screen.getAllByText('Sessions')
    expect(sessionsLabels.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('1 KB')).toBeInTheDocument()
  })

  it('shows Clear buttons for stores with data', async () => {
    render(<DataManagement />)
    await waitFor(() => expect(screen.getByText('Clear Individual Data')).toBeInTheDocument())
    const clearButtons = screen.getAllByText('Clear')
    // 2 stores have non-zero size
    expect(clearButtons).toHaveLength(2)
  })

  it('calls data:clear-store when Clear is clicked', async () => {
    render(<DataManagement />)
    await waitFor(() => expect(screen.getByText('Clear Individual Data')).toBeInTheDocument())
    const clearButtons = screen.getAllByText('Clear')
    fireEvent.click(clearButtons[0])
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled()
      expect(mockInvoke).toHaveBeenCalledWith('data:clear-store', { storeId: 'sessions' })
    })
  })

  it('renders Factory Reset section', async () => {
    render(<DataManagement />)
    await waitFor(() => expect(screen.getByText('Factory Reset')).toBeInTheDocument())
    expect(screen.getByText('Reset Everything')).toBeInTheDocument()
  })

  it('calls data:clear-all on factory reset with double confirm', async () => {
    render(<DataManagement />)
    await waitFor(() => expect(screen.getByText('Reset Everything')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Reset Everything'))
    await waitFor(() => {
      // confirm is called twice for factory reset
      expect(window.confirm).toHaveBeenCalledTimes(2)
      expect(mockInvoke).toHaveBeenCalledWith('data:clear-all')
    })
  })

  it('has a Compact Memories tab', async () => {
    render(<DataManagement />)
    await waitFor(() => expect(screen.getByText('Compact Memories')).toBeInTheDocument())
  })

  it('shows empty message when no compact notes exist', async () => {
    render(<DataManagement />)
    await waitFor(() => expect(screen.getByText('Compact Memories')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Compact Memories'))
    await waitFor(() => expect(screen.getByText(/No memories to compact/)).toBeInTheDocument())
  })

  it('shows compact notes when available', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'data:get-storage-stats') return Promise.resolve(mockStats)
      if (channel === 'data:get-notes-for-compact') {
        return Promise.resolve([
          { id: 'n1', title: 'Note A', contentLength: 512, tags: ['test'], category: 'general', updatedAt: Date.now() },
          { id: 'n2', title: 'Note B', contentLength: 1024, tags: [], category: 'work', updatedAt: Date.now() },
        ])
      }
      return Promise.resolve()
    })

    render(<DataManagement />)
    await waitFor(() => expect(screen.getByText('Compact Memories')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Compact Memories'))
    await waitFor(() => {
      expect(screen.getByText('Note A')).toBeInTheDocument()
      expect(screen.getByText('Note B')).toBeInTheDocument()
    })
  })
})
