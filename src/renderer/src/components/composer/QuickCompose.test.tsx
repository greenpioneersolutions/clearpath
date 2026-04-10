// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import QuickCompose, { type QuickComposeConfig } from './QuickCompose'

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

describe('QuickCompose', () => {
  const defaultConfig: QuickComposeConfig = {}

  const defaultProps = {
    config: defaultConfig,
    onConfigChange: vi.fn(),
    cli: 'copilot' as const,
    onTemplateSelect: vi.fn(),
    selectedNoteIds: new Set<string>(),
    onToggleNote: vi.fn(),
    onClearNotes: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onConfigChange.mockReset()
    defaultProps.onTemplateSelect.mockReset()
    defaultProps.onToggleNote.mockReset()
    defaultProps.onClearNotes.mockReset()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'templates:list') return Promise.resolve([])
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'notes:list') return Promise.resolve([])
      return Promise.resolve(undefined)
    })
  })

  it('renders toolbar buttons', () => {
    render(<QuickCompose {...defaultProps} />)
    expect(screen.getByTitle('Templates')).toBeInTheDocument()
    expect(screen.getByTitle('Agent')).toBeInTheDocument()
    expect(screen.getByTitle('Memories')).toBeInTheDocument()
    expect(screen.getByTitle('Delegate')).toBeInTheDocument()
  })

  it('shows Fleet button for copilot CLI', () => {
    render(<QuickCompose {...defaultProps} cli="copilot" />)
    expect(screen.getByTitle('Fleet')).toBeInTheDocument()
  })

  it('hides Fleet button for claude CLI', () => {
    render(<QuickCompose {...defaultProps} cli="claude" />)
    expect(screen.queryByTitle('Fleet')).not.toBeInTheDocument()
  })

  it('toggles delegate on click', () => {
    render(<QuickCompose {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Delegate'))
    expect(defaultProps.onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ delegate: 'sub-agent' }))
  })

  it('removes delegate when already set', () => {
    render(<QuickCompose {...defaultProps} config={{ delegate: 'sub-agent' }} />)
    fireEvent.click(screen.getByTitle('Delegate'))
    expect(defaultProps.onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ delegate: undefined }))
  })

  it('toggles fleet on click', () => {
    render(<QuickCompose {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Fleet'))
    expect(defaultProps.onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ fleet: true }))
  })

  it('shows agent badge when agent is set', () => {
    render(<QuickCompose {...defaultProps} config={{ agent: 'review-agent' }} />)
    expect(screen.getByText('review-agent')).toBeInTheDocument()
  })

  it('shows memory badge when notes are selected', () => {
    render(<QuickCompose {...defaultProps} selectedNoteIds={new Set(['n1', 'n2'])} />)
    expect(screen.getByText('2 memories')).toBeInTheDocument()
  })

  it('shows delegate badge when delegate is set', () => {
    render(<QuickCompose {...defaultProps} config={{ delegate: 'sub-agent' }} />)
    expect(screen.getByText('sub-agent')).toBeInTheDocument()
  })

  it('shows fleet badge when fleet is active', () => {
    render(<QuickCompose {...defaultProps} config={{ fleet: true }} />)
    // Fleet appears in both badge and toolbar button
    const fleetElements = screen.getAllByText(/Fleet/)
    expect(fleetElements.length).toBeGreaterThanOrEqual(2)
  })

  it('removes agent badge on x click', () => {
    render(<QuickCompose {...defaultProps} config={{ agent: 'my-agent' }} />)
    // Find the remove button (x) in the badge
    const badge = screen.getByText('my-agent').closest('span')!
    const removeBtn = badge.querySelector('button')!
    fireEvent.click(removeBtn)
    expect(defaultProps.onConfigChange).toHaveBeenCalledWith(expect.not.objectContaining({ agent: 'my-agent' }))
  })

  it('calls onClearNotes when memory badge x is clicked', () => {
    render(<QuickCompose {...defaultProps} selectedNoteIds={new Set(['n1'])} />)
    const badge = screen.getByText('1 memory').closest('span')!
    const removeBtn = badge.querySelector('button')!
    fireEvent.click(removeBtn)
    expect(defaultProps.onClearNotes).toHaveBeenCalled()
  })
})
