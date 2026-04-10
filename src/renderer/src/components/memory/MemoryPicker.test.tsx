// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import MemoryPicker from './MemoryPicker'

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

describe('MemoryPicker', () => {
  const mockNotes = [
    {
      id: 'n1', title: 'Meeting Notes', content: 'Discussion about architecture',
      tags: ['arch', 'q1'], category: 'meeting', pinned: true,
      createdAt: Date.now() - 3600000, updatedAt: Date.now() - 60000,
    },
    {
      id: 'n2', title: 'Reference Doc', content: 'API documentation reference',
      tags: ['api'], category: 'reference', pinned: false,
      createdAt: Date.now() - 86400000, updatedAt: Date.now() - 3600000,
    },
  ]

  const defaultProps = {
    selectedIds: new Set<string>(),
    onToggle: vi.fn(),
    onClear: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onToggle.mockReset()
    defaultProps.onClear.mockReset()
    mockInvoke.mockResolvedValue(mockNotes)
  })

  it('renders the Memories button', () => {
    render(<MemoryPicker {...defaultProps} />)
    expect(screen.getByText('Memories')).toBeInTheDocument()
  })

  it('shows selected count when memories are selected', () => {
    render(<MemoryPicker {...defaultProps} selectedIds={new Set(['n1'])} />)
    expect(screen.getByText('1 memory')).toBeInTheDocument()
  })

  it('shows plural for multiple selections', () => {
    render(<MemoryPicker {...defaultProps} selectedIds={new Set(['n1', 'n2'])} />)
    expect(screen.getByText('2 memories')).toBeInTheDocument()
  })

  it('opens dropdown when button is clicked', async () => {
    render(<MemoryPicker {...defaultProps} />)
    fireEvent.click(screen.getByText('Memories'))

    await waitFor(() => {
      expect(screen.getByText('Attach Memories')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Search notes...')).toBeInTheDocument()
    })
  })

  it('shows notes in dropdown after opening', async () => {
    render(<MemoryPicker {...defaultProps} />)
    fireEvent.click(screen.getByText('Memories'))

    await waitFor(() => {
      expect(screen.getByText('Meeting Notes')).toBeInTheDocument()
      expect(screen.getByText('Reference Doc')).toBeInTheDocument()
    })
  })

  it('calls onToggle when a note is clicked', async () => {
    render(<MemoryPicker {...defaultProps} />)
    fireEvent.click(screen.getByText('Memories'))

    await waitFor(() => {
      expect(screen.getByText('Meeting Notes')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Meeting Notes'))
    expect(defaultProps.onToggle).toHaveBeenCalledWith('n1')
  })

  it('shows "Clear all" button when notes are selected', async () => {
    render(<MemoryPicker {...defaultProps} selectedIds={new Set(['n1'])} />)
    fireEvent.click(screen.getByText('1 memory'))

    await waitFor(() => {
      expect(screen.getByText('Clear all')).toBeInTheDocument()
    })
  })

  it('calls onClear when "Clear all" is clicked', async () => {
    render(<MemoryPicker {...defaultProps} selectedIds={new Set(['n1'])} />)
    fireEvent.click(screen.getByText('1 memory'))

    await waitFor(() => {
      expect(screen.getByText('Clear all')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Clear all'))
    expect(defaultProps.onClear).toHaveBeenCalled()
  })

  it('shows empty state when no notes exist', async () => {
    mockInvoke.mockResolvedValue([])
    render(<MemoryPicker {...defaultProps} />)
    fireEvent.click(screen.getByText('Memories'))

    await waitFor(() => {
      expect(screen.getByText('No memories yet')).toBeInTheDocument()
    })
  })

  it('shows footer context message when notes are selected', async () => {
    render(<MemoryPicker {...defaultProps} selectedIds={new Set(['n1'])} />)
    fireEvent.click(screen.getByText('1 memory'))

    await waitFor(() => {
      expect(screen.getByText(/will be included as context/)).toBeInTheDocument()
    })
  })
})
