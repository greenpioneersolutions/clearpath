// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('@uiw/react-codemirror', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      React.createElement('textarea', {
        'data-testid': 'codemirror',
        value: props.value as string,
        onChange: (e: { target: { value: string } }) => (props.onChange as ((v: string) => void) | undefined)?.(e.target.value),
      }),
  }
})
vi.mock('@codemirror/lang-markdown', () => ({ markdown: () => [] }))
vi.mock('@codemirror/lang-json', () => ({ json: () => [] }))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))

import FileEditor from './FileEditor'

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

describe('FileEditor', () => {
  const mockFiles = [
    { path: '/proj/CLAUDE.md', name: 'CLAUDE.md', exists: true, category: 'instructions', cli: 'claude', isGlobal: false },
    { path: '/proj/.claude/agents/test.md', name: 'test.md', exists: true, category: 'agent', cli: 'claude', isGlobal: false },
    { path: '/proj/settings.json', name: 'settings.json', exists: false, category: 'settings', cli: 'claude', isGlobal: true },
  ]

  const defaultProps = {
    cli: 'claude' as const,
    workingDirectory: '/proj',
    onNewFile: vi.fn(),
  }

  beforeEach(() => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'memory:list-files') return Promise.resolve(mockFiles)
      if (channel === 'memory:read-file') return Promise.resolve({ content: '# Hello' })
      if (channel === 'memory:write-file') return Promise.resolve({ success: true })
      return Promise.resolve(undefined)
    })
  })

  it('renders file list in sidebar after loading', async () => {
    render(<FileEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('CLAUDE.md')).toBeInTheDocument()
      expect(screen.getByText('test.md')).toBeInTheDocument()
    })
  })

  it('shows placeholder text when no file is selected', async () => {
    render(<FileEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Select a file from the sidebar to edit')).toBeInTheDocument()
    })
  })

  it('shows "+ New" button that calls onNewFile', async () => {
    render(<FileEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('+ New')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('+ New'))
    expect(defaultProps.onNewFile).toHaveBeenCalled()
  })

  it('loads file content when a file is clicked', async () => {
    render(<FileEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('CLAUDE.md')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('CLAUDE.md'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('memory:read-file', { path: '/proj/CLAUDE.md' })
    })
  })

  it('shows Save button and file path after selection', async () => {
    render(<FileEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('CLAUDE.md')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('CLAUDE.md'))

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument()
      expect(screen.getByText('/proj/CLAUDE.md')).toBeInTheDocument()
    })
  })

  it('shows category headers', async () => {
    render(<FileEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Instructions')).toBeInTheDocument()
      expect(screen.getByText('Agents')).toBeInTheDocument()
    })
  })

  it('shows "does not exist" banner for non-existing files', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'memory:list-files') return Promise.resolve(mockFiles)
      if (channel === 'memory:read-file') return Promise.resolve({ content: '' })
      return Promise.resolve(undefined)
    })

    render(<FileEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('settings.json')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('settings.json'))

    await waitFor(() => {
      expect(screen.getByText(/does not exist yet/)).toBeInTheDocument()
    })
  })

  it('renders the Config Files sidebar header', async () => {
    render(<FileEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Config Files')).toBeInTheDocument()
    })
  })
})
