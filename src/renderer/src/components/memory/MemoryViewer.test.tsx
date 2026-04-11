// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import MemoryViewer from './MemoryViewer'

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

describe('MemoryViewer', () => {
  const mockEntries = [
    {
      id: 'e1', path: '/proj/.claude/memory/user.md', name: 'User Prefs',
      content: '---\nname: User Prefs\ntype: user\n---\nPrefers concise answers',
      type: 'user', description: 'User preferences', projectPath: '/proj',
      modifiedAt: Date.now() - 120000,
    },
    {
      id: 'e2', path: '/proj/.claude/memory/feedback.md', name: 'Code Review Feedback',
      content: '---\nname: Code Review Feedback\ntype: feedback\n---\nNo mocks in DB tests',
      type: 'feedback', description: 'Feedback on test approach', projectPath: '/proj',
      modifiedAt: Date.now() - 7200000,
    },
  ]

  beforeEach(() => {
    mockInvoke.mockResolvedValue(mockEntries)
  })

  it('renders loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {})) // never resolves
    render(<MemoryViewer cli="claude" />)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('renders entry names after loading', async () => {
    render(<MemoryViewer cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('User Prefs')).toBeInTheDocument()
      expect(screen.getByText('Code Review Feedback')).toBeInTheDocument()
    })
  })

  it('shows entry count', async () => {
    render(<MemoryViewer cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('2 entries')).toBeInTheDocument()
    })
  })

  it('shows type badges', async () => {
    render(<MemoryViewer cli="claude" />)
    await waitFor(() => {
      // 'user' appears both as a badge and a select option
      const userElements = screen.getAllByText('user')
      expect(userElements.length).toBeGreaterThanOrEqual(2) // badge + select option
      // 'feedback' appears in badge and select
      const feedbackElements = screen.getAllByText('feedback')
      expect(feedbackElements.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('expands entry content on click', async () => {
    render(<MemoryViewer cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('User Prefs')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('User Prefs'))

    await waitFor(() => {
      expect(screen.getByText('Prefers concise answers')).toBeInTheDocument()
    })
  })

  it('collapses entry on second click', async () => {
    render(<MemoryViewer cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('User Prefs')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('User Prefs'))
    await waitFor(() => {
      expect(screen.getByText('Prefers concise answers')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('User Prefs'))
    await waitFor(() => {
      expect(screen.queryByText('Prefers concise answers')).not.toBeInTheDocument()
    })
  })

  it('filters entries by search', async () => {
    render(<MemoryViewer cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('User Prefs')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/Search memories/), { target: { value: 'feedback' } })

    expect(screen.queryByText('User Prefs')).not.toBeInTheDocument()
    expect(screen.getByText('Code Review Feedback')).toBeInTheDocument()
  })

  it('filters entries by type', async () => {
    render(<MemoryViewer cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('User Prefs')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'feedback' } })

    expect(screen.queryByText('User Prefs')).not.toBeInTheDocument()
    expect(screen.getByText('Code Review Feedback')).toBeInTheDocument()
  })

  it('shows empty state for claude when no entries', async () => {
    mockInvoke.mockResolvedValue([])
    render(<MemoryViewer cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText(/No Claude memory entries found/)).toBeInTheDocument()
    })
  })

  it('shows empty state for copilot when no entries', async () => {
    mockInvoke.mockResolvedValue([])
    render(<MemoryViewer cli="copilot" />)
    await waitFor(() => {
      expect(screen.getByText(/No Copilot memory files found/)).toBeInTheDocument()
    })
  })

  it('shows filtered count when search narrows results', async () => {
    render(<MemoryViewer cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('2 entries')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/Search memories/), { target: { value: 'User' } })

    // The count text "1 entry (of 2)" is split across React nodes
    await waitFor(() => {
      expect(screen.getByText(/1.*entr/)).toBeInTheDocument()
    })
  })

  it('calls refresh on Refresh button click', async () => {
    render(<MemoryViewer cli="claude" />)
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument()
    })

    mockInvoke.mockResolvedValue([])
    fireEvent.click(screen.getByText('Refresh'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('memory:list-memory-entries', { cli: 'claude' })
    })
  })
})
