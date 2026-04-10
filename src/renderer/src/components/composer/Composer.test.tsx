// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import Composer from './Composer'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'templates:list') return Promise.resolve([])
    if (channel === 'templates:record-usage') return Promise.resolve(undefined)
    if (channel === 'workflow:estimate-cost') return Promise.resolve({ totalTokens: 0, estimatedCost: 0 })
    if (channel === 'workflow:save') return Promise.resolve({ success: true })
    return Promise.resolve(undefined)
  })
})

describe('Composer', () => {
  const defaultProps = {
    onSendToSession: vi.fn(),
    onSendToNewSession: vi.fn(),
    cli: 'copilot' as const,
    sessions: [],
    hasActiveSession: false,
    activeSessionName: '',
  }

  beforeEach(() => {
    defaultProps.onSendToSession.mockReset()
    defaultProps.onSendToNewSession.mockReset()
  })

  it('renders the template launcher initially', async () => {
    render(<Composer {...defaultProps} />)
    expect(screen.getByText('Workflow Composer')).toBeInTheDocument()
    expect(screen.getByText('Start from Scratch')).toBeInTheDocument()
  })

  it('shows target mode banner with New Session and Current Session buttons', () => {
    render(<Composer {...defaultProps} />)
    expect(screen.getByText('New Session')).toBeInTheDocument()
    expect(screen.getByText('Current Session')).toBeInTheDocument()
  })

  it('shows "A new session will be created" for new session mode', () => {
    render(<Composer {...defaultProps} />)
    expect(screen.getByText('A new session will be created')).toBeInTheDocument()
  })

  it('disables Current Session button when no active session', () => {
    render(<Composer {...defaultProps} />)
    const currentSessionBtn = screen.getByText('Current Session')
    expect(currentSessionBtn).toBeDisabled()
  })

  it('enables Current Session button when hasActiveSession is true', () => {
    render(<Composer {...defaultProps} hasActiveSession={true} activeSessionName="Test" />)
    const currentSessionBtn = screen.getByText('Current Session')
    expect(currentSessionBtn).not.toBeDisabled()
  })

  it('transitions to canvas when Start from Scratch is clicked', () => {
    render(<Composer {...defaultProps} />)
    fireEvent.click(screen.getByText('Start from Scratch'))

    // Should now show the workflow canvas with step editor
    expect(screen.getByText('+ Add Step')).toBeInTheDocument()
    expect(screen.getByText('Execute Workflow')).toBeInTheDocument()
  })

  it('shows active session name when targeting existing session', () => {
    render(
      <Composer
        {...defaultProps}
        hasActiveSession={true}
        activeSessionName="My Session"
      />,
    )

    fireEvent.click(screen.getByText('Current Session'))

    expect(screen.getByText('My Session')).toBeInTheDocument()
  })
})
