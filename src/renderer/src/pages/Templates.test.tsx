// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

const TEMPLATE = {
  id: 'tpl-1', name: 'Code Review', category: 'Code Review',
  description: 'Review a PR', body: 'Review {{target}} for issues',
  complexity: 'low' as const, variables: ['target'], source: 'user' as const,
  usageCount: 3, totalCost: 0.02, createdAt: Date.now(),
}

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'templates:list') return Promise.resolve([TEMPLATE])
    if (channel === 'template:get-stats') return Promise.resolve({ totalUses: 5, topTemplates: [] })
    if (channel === 'cli:list-sessions') return Promise.resolve([])
    if (channel === 'templates:usage-stats') return Promise.resolve([])
    if (channel === 'templates:save') return Promise.resolve({ ...TEMPLATE, id: 'saved-1' })
    if (channel === 'templates:delete') return Promise.resolve(null)
    return Promise.resolve(null)
  })
})

import Templates from './Templates'

describe('Templates', () => {
  it('renders page heading', () => {
    render(<Templates />)
    expect(screen.getByText('Templates')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<Templates />)
    expect(screen.getByText(/Reusable prompt templates/)).toBeInTheDocument()
  })

  it('shows Stats button', () => {
    render(<Templates />)
    expect(screen.getByText('Stats')).toBeInTheDocument()
  })

  it('shows Create Template button', () => {
    render(<Templates />)
    expect(screen.getByText('+ Create Template')).toBeInTheDocument()
  })

  it('loads template list on mount', () => {
    render(<Templates />)
    expect(mockInvoke).toHaveBeenCalledWith('templates:list', expect.any(Object))
  })

  it('shows empty state when no templates loaded', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'templates:list') return Promise.resolve([])
      if (channel === 'template:get-stats') return Promise.resolve({ totalUses: 0, topTemplates: [] })
      if (channel === 'cli:list-sessions') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<Templates />)
    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument()
    })
  })

  it('renders template card after loading', async () => {
    render(<Templates />)
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument()
    })
    expect(screen.getByText('Review a PR')).toBeInTheDocument()
  })

  it('navigates to Stats view on Stats button click', async () => {
    render(<Templates />)
    await waitFor(() => expect(screen.getByText('Code Review')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Stats'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('templates:usage-stats')
    })
  })

  it('navigates to Create view on + Create Template click', async () => {
    render(<Templates />)
    await waitFor(() => expect(screen.getByText('Code Review')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Create Template'))
    // TemplateEditor shows template name field label
    await waitFor(() => {
      expect(screen.getByText('Description')).toBeInTheDocument()
    })
  })

  it('navigates to Use view on template Use button click', async () => {
    render(<Templates />)
    await waitFor(() => expect(screen.getByText('Code Review')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Use'))
    await waitFor(() => {
      expect(screen.getByText('Send to Active Session')).toBeInTheDocument()
    })
  })

  it('navigates to Edit view on template Edit button click', async () => {
    render(<Templates />)
    await waitFor(() => expect(screen.getByText('Code Review')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Edit'))
    await waitFor(() => {
      // TemplateEditor shows Save/Cancel buttons in edit mode
      expect(screen.getByText(/Save|Cancel/)).toBeInTheDocument()
    })
  })

  it('shows no-active-session message when sending with no running sessions', async () => {
    render(<Templates />)
    await waitFor(() => expect(screen.getByText('Code Review')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Use'))
    await waitFor(() => expect(screen.getByText('Send to Active Session')).toBeInTheDocument())
    // Fill in the variable field
    const input = screen.queryByRole('textbox')
    if (input) fireEvent.change(input, { target: { value: 'main' } })
    fireEvent.click(screen.getByText('Send to Active Session'))
    await waitFor(() => {
      expect(screen.getByText(/No active session/)).toBeInTheDocument()
    })
  })

  it('sends prompt to active session when a running session exists', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'templates:list') return Promise.resolve([TEMPLATE])
      if (channel === 'cli:list-sessions') return Promise.resolve([{ sessionId: 'sess-1', status: 'running' }])
      if (channel === 'cli:send-input') return Promise.resolve(null)
      if (channel === 'templates:usage-stats') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<Templates />)
    await waitFor(() => expect(screen.getByText('Code Review')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Use'))
    await waitFor(() => expect(screen.getByText('Send to Active Session')).toBeInTheDocument())
    // Fill variable value
    const input = screen.queryByRole('textbox')
    if (input) fireEvent.change(input, { target: { value: 'main' } })
    fireEvent.click(screen.getByText('Send to Active Session'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:send-input', expect.objectContaining({ sessionId: 'sess-1' }))
    })
  })

  it('returns to library when Cancel is clicked in create view', async () => {
    render(<Templates />)
    await waitFor(() => expect(screen.getByText('Code Review')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Create Template'))
    await waitFor(() => expect(screen.getByText('Description')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: /cancel/i })[0])
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument()
    })
  })
})
