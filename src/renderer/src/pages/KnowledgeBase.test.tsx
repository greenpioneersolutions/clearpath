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
})

import KnowledgeBase from './KnowledgeBase'

describe('KnowledgeBase', () => {
  const mockFiles = [
    { name: 'architecture.md', path: '/kb/architecture.md', content: '# Architecture\nThis is the architecture.', lastUpdated: Date.now() },
    { name: 'api.md', path: '/kb/api.md', content: '# API\nAPI docs here.', lastUpdated: Date.now() },
  ]
  const mockSections = [
    { id: 'arch', label: 'Architecture', filename: 'architecture.md' },
    { id: 'api', label: 'API', filename: 'api.md' },
  ]

  beforeEach(() => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'app:get-cwd') return Promise.resolve('/test/project')
      if (channel === 'kb:list-files') return Promise.resolve(mockFiles)
      if (channel === 'kb:get-sections') return Promise.resolve(mockSections)
      if (channel === 'kb:search') return Promise.resolve([])
      if (channel === 'kb:generate') return Promise.resolve(null)
      if (channel === 'kb:update') return Promise.resolve(null)
      if (channel === 'kb:ask') return Promise.resolve(null)
      if (channel === 'kb:export-file') return Promise.resolve({ path: '/tmp/kb.md' })
      return Promise.resolve(null)
    })
  })

  it('renders page heading', () => {
    render(<KnowledgeBase />)
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument()
  })

  it('shows file count in subtitle', async () => {
    render(<KnowledgeBase />)
    await waitFor(() => {
      expect(screen.getByText('2 sections generated')).toBeInTheDocument()
    })
  })

  it('renders action buttons', () => {
    render(<KnowledgeBase />)
    expect(screen.getByText('Update')).toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
  })

  it('renders view tabs', () => {
    render(<KnowledgeBase />)
    expect(screen.getByText('Browse')).toBeInTheDocument()
    expect(screen.getByText('Quick Answer')).toBeInTheDocument()
  })

  it('shows file list in browse view', async () => {
    render(<KnowledgeBase />)
    await waitFor(() => {
      expect(screen.getByText('architecture.md')).toBeInTheDocument()
      expect(screen.getByText('api.md')).toBeInTheDocument()
    })
  })

  it('shows selected file content', async () => {
    render(<KnowledgeBase />)
    await waitFor(() => {
      expect(screen.getByText(/This is the architecture/)).toBeInTheDocument()
    })
  })

  it('switches to Quick Answer view', () => {
    render(<KnowledgeBase />)
    fireEvent.click(screen.getByText('Quick Answer'))
    expect(screen.getByPlaceholderText(/How does authentication work/)).toBeInTheDocument()
    expect(screen.getByText('Ask')).toBeInTheDocument()
  })

  it('shows search input in browse view', () => {
    render(<KnowledgeBase />)
    expect(screen.getByPlaceholderText('Search docs...')).toBeInTheDocument()
  })

  it('calls IPC channels on mount', () => {
    render(<KnowledgeBase />)
    expect(mockInvoke).toHaveBeenCalledWith('app:get-cwd')
  })
})
