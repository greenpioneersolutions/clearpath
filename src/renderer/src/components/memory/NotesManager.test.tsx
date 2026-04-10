// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import NotesManager from './NotesManager'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NotesManager', () => {
  const mockNotes = [
    {
      id: 'note-1', title: 'Sprint Planning', content: 'Discussed priorities for Q2',
      tags: ['sprint', 'planning'], category: 'meeting', pinned: true,
      attachments: [], createdAt: Date.now() - 86400000, updatedAt: Date.now() - 3600000,
      source: 'manual',
    },
    {
      id: 'note-2', title: 'API Docs Reference', content: 'REST API endpoints documentation',
      tags: ['api'], category: 'reference', pinned: false,
      attachments: [], createdAt: Date.now() - 172800000, updatedAt: Date.now() - 7200000,
      source: 'manual',
    },
  ]

  beforeEach(() => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'notes:list') return Promise.resolve(mockNotes)
      if (channel === 'notes:tags') return Promise.resolve(['sprint', 'planning', 'api'])
      if (channel === 'notes:create') return Promise.resolve({ id: 'new-1' })
      if (channel === 'notes:update') return Promise.resolve({ success: true })
      if (channel === 'notes:delete') return Promise.resolve({ success: true })
      return Promise.resolve(undefined)
    })
  })

  it('renders heading and new note button', async () => {
    render(<NotesManager />)
    await waitFor(() => {
      expect(screen.getByText('Your Notes')).toBeInTheDocument()
      expect(screen.getByText('New Note')).toBeInTheDocument()
    })
  })

  it('renders note cards after loading', async () => {
    render(<NotesManager />)
    await waitFor(() => {
      expect(screen.getByText('Sprint Planning')).toBeInTheDocument()
      expect(screen.getByText('API Docs Reference')).toBeInTheDocument()
    })
  })

  it('shows tag filter pills', async () => {
    render(<NotesManager />)
    // Wait for notes to load first
    await waitFor(() => {
      expect(screen.getByText('Sprint Planning')).toBeInTheDocument()
    })
    // Tags render with # prefix
    await waitFor(() => {
      // Tags show in both the tag filter area and in the note cards
      const sprintTags = screen.getAllByText('#sprint')
      expect(sprintTags.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('opens create form when New Note is clicked', async () => {
    render(<NotesManager />)
    await waitFor(() => {
      expect(screen.getByText('New Note')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('New Note'))

    expect(screen.getByPlaceholderText(/Note title/)).toBeInTheDocument()
    expect(screen.getByText('Create Note')).toBeInTheDocument()
  })

  it('opens edit form when a note card is clicked', async () => {
    render(<NotesManager />)
    await waitFor(() => {
      expect(screen.getByText('Sprint Planning')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Sprint Planning'))

    expect(screen.getByDisplayValue('Sprint Planning')).toBeInTheDocument()
    expect(screen.getByText('Save Changes')).toBeInTheDocument()
  })

  it('creates a note when form is submitted', async () => {
    render(<NotesManager />)
    await waitFor(() => {
      expect(screen.getByText('New Note')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('New Note'))

    fireEvent.change(screen.getByPlaceholderText(/Note title/), {
      target: { value: 'My New Note' },
    })

    fireEvent.click(screen.getByText('Create Note'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notes:create', expect.objectContaining({
        title: 'My New Note',
        source: 'manual',
      }))
    })
  })

  it('disables Create button when title is empty', async () => {
    render(<NotesManager />)
    await waitFor(() => {
      expect(screen.getByText('New Note')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('New Note'))

    const createBtn = screen.getByText('Create Note')
    expect(createBtn).toBeDisabled()
  })

  it('shows empty state when no notes exist', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'notes:list') return Promise.resolve([])
      if (channel === 'notes:tags') return Promise.resolve([])
      return Promise.resolve(undefined)
    })

    render(<NotesManager />)
    await waitFor(() => {
      expect(screen.getByText('No notes yet')).toBeInTheDocument()
      expect(screen.getByText('Create Your First Note')).toBeInTheDocument()
    })
  })

  it('navigates back from editor to list', async () => {
    render(<NotesManager />)
    await waitFor(() => {
      expect(screen.getByText('New Note')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('New Note'))
    expect(screen.getByText('Create Note')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))

    await waitFor(() => {
      expect(screen.getByText('Your Notes')).toBeInTheDocument()
    })
  })

  it('shows search input', async () => {
    render(<NotesManager />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search notes/)).toBeInTheDocument()
    })
  })

  it('shows category filter dropdown', async () => {
    render(<NotesManager />)
    await waitFor(() => {
      const select = screen.getByDisplayValue('All categories')
      expect(select).toBeInTheDocument()
    })
  })
})
