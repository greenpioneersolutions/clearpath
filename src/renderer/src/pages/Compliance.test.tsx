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

import Compliance from './Compliance'

describe('Compliance', () => {
  beforeEach(() => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'compliance:get-log') return Promise.resolve([])
      if (channel === 'compliance:security-events') return Promise.resolve([])
      if (channel === 'compliance:get-file-patterns') return Promise.resolve(['*.key', '.env*'])
      if (channel === 'compliance:export-snapshot') return Promise.resolve({ path: '/tmp/export.json' })
      if (channel === 'compliance:set-file-patterns') return Promise.resolve(null)
      return Promise.resolve(null)
    })
  })

  it('renders page heading', () => {
    render(<Compliance />)
    expect(screen.getByText('Compliance & Security')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<Compliance />)
    expect(screen.getByText(/Audit log, sensitive data protection/)).toBeInTheDocument()
  })

  it('shows Export Snapshot button', () => {
    render(<Compliance />)
    expect(screen.getByText('Export Snapshot')).toBeInTheDocument()
  })

  it('renders tab buttons', () => {
    render(<Compliance />)
    expect(screen.getByText('Security Feed')).toBeInTheDocument()
    expect(screen.getByText('Audit Log')).toBeInTheDocument()
    expect(screen.getByText('File Protection')).toBeInTheDocument()
  })

  it('shows all-clear message when no security events', async () => {
    render(<Compliance />)
    await waitFor(() => {
      expect(screen.getByText(/All Clear/)).toBeInTheDocument()
    })
  })

  it('shows security events count when events exist', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'compliance:security-events') return Promise.resolve([
        { id: '1', timestamp: Date.now(), actionType: 'security-warning', summary: 'Suspicious access', details: '' },
      ])
      if (channel === 'compliance:get-log') return Promise.resolve([])
      if (channel === 'compliance:get-file-patterns') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<Compliance />)
    await waitFor(() => {
      expect(screen.getByText(/1 recent security event/)).toBeInTheDocument()
    })
  })

  it('defaults to Security Feed tab', async () => {
    render(<Compliance />)
    await waitFor(() => {
      expect(screen.getByText('No security events recorded')).toBeInTheDocument()
    })
  })

  it('switches to Audit Log tab', async () => {
    render(<Compliance />)
    await waitFor(() => {
      expect(screen.getByText('Security Feed')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Audit Log'))
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })

  it('switches to File Protection tab and shows patterns', async () => {
    render(<Compliance />)
    fireEvent.click(screen.getByText('File Protection'))
    await waitFor(() => {
      expect(screen.getByText('Protected File Patterns')).toBeInTheDocument()
      expect(screen.getByText('*.key')).toBeInTheDocument()
      expect(screen.getByText('.env*')).toBeInTheDocument()
    })
  })

  it('calls IPC channels on mount', () => {
    render(<Compliance />)
    expect(mockInvoke).toHaveBeenCalledWith('compliance:get-log', expect.any(Object))
    expect(mockInvoke).toHaveBeenCalledWith('compliance:security-events', expect.any(Object))
    expect(mockInvoke).toHaveBeenCalledWith('compliance:get-file-patterns')
  })

  it('adds a new file pattern', async () => {
    render(<Compliance />)
    fireEvent.click(screen.getByText('File Protection'))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g. \*.key/)).toBeInTheDocument()
    })
    const input = screen.getByPlaceholderText(/e.g. \*.key/)
    fireEvent.change(input, { target: { value: '*.pem' } })
    fireEvent.click(screen.getByText('Add'))
    expect(mockInvoke).toHaveBeenCalledWith('compliance:set-file-patterns', {
      patterns: ['*.key', '.env*', '*.pem'],
    })
  })
})
