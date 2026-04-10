// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import SessionSummary from './SessionSummary'
import type { SessionInfo } from '../../types/ipc'
import type { OutputMessage } from '../OutputDisplay'

describe('SessionSummary', () => {
  const session: SessionInfo = {
    sessionId: 'test-session-123',
    name: 'Test Session',
    cli: 'copilot',
    status: 'stopped',
    startedAt: Date.now() - 300000, // 5 minutes ago
  }

  const messages: OutputMessage[] = [
    { id: '1', output: { type: 'text', content: 'Hello' }, sender: 'user' },
    { id: '2', output: { type: 'text', content: 'Response' }, sender: 'ai' },
    { id: '3', output: { type: 'tool-use', content: 'Used tool X' }, sender: 'ai' },
    { id: '4', output: { type: 'error', content: 'Something failed' }, sender: 'ai' },
    { id: '5', output: { type: 'text', content: 'Fix it' }, sender: 'user' },
    { id: '6', output: { type: 'tool-use', content: 'Used tool Y' }, sender: 'ai' },
  ]

  const handlers = {
    onContinue: vi.fn(),
    onSaveAsTemplate: vi.fn(),
    onDismiss: vi.fn(),
  }

  beforeEach(() => {
    Object.values(handlers).forEach((fn) => fn.mockReset())
  })

  it('renders Session Complete heading', () => {
    render(<SessionSummary session={session} messages={messages} {...handlers} />)
    expect(screen.getByText('Session Complete')).toBeInTheDocument()
  })

  it('displays session name and CLI', () => {
    render(<SessionSummary session={session} messages={messages} {...handlers} />)
    expect(screen.getByText(/Test Session/)).toBeInTheDocument()
    expect(screen.getByText(/Copilot/)).toBeInTheDocument()
  })

  it('counts prompts (user messages)', () => {
    render(<SessionSummary session={session} messages={messages} {...handlers} />)
    // "Prompts" label should exist, and its sibling value should be "2"
    const promptsLabel = screen.getByText('Prompts')
    const statBox = promptsLabel.closest('.bg-gray-800')
    expect(statBox).not.toBeNull()
    expect(statBox!.textContent).toContain('2')
  })

  it('counts tool uses', () => {
    render(<SessionSummary session={session} messages={messages} {...handlers} />)
    const toolLabel = screen.getByText('Tool Uses')
    const statBox = toolLabel.closest('.bg-gray-800')
    expect(statBox).not.toBeNull()
    expect(statBox!.textContent).toContain('2')
  })

  it('counts errors', () => {
    render(<SessionSummary session={session} messages={messages} {...handlers} />)
    const errorLabel = screen.getByText('Errors')
    const statBox = errorLabel.closest('.bg-gray-800')
    expect(statBox).not.toBeNull()
    expect(statBox!.textContent).toContain('1')
  })

  it('shows warning icon when there are errors', () => {
    render(<SessionSummary session={session} messages={messages} {...handlers} />)
    // Should show warning emoji instead of checkmark
    const icon = screen.getByText(/\u26A0/) // ⚠️
    expect(icon).toBeInTheDocument()
  })

  it('shows checkmark when no errors', () => {
    const noErrorMessages: OutputMessage[] = [
      { id: '1', output: { type: 'text', content: 'Hello' }, sender: 'user' },
      { id: '2', output: { type: 'text', content: 'Response' }, sender: 'ai' },
    ]
    render(<SessionSummary session={session} messages={noErrorMessages} {...handlers} />)
    expect(screen.getByText(/\u2713/)).toBeInTheDocument() // checkmark
  })

  it('calls onContinue when Continue button is clicked', () => {
    render(<SessionSummary session={session} messages={messages} {...handlers} />)
    fireEvent.click(screen.getByText('Continue in New Session'))
    expect(handlers.onContinue).toHaveBeenCalledOnce()
  })

  it('calls onSaveAsTemplate when Save as Template is clicked', () => {
    render(<SessionSummary session={session} messages={messages} {...handlers} />)
    fireEvent.click(screen.getByText('Save as Template'))
    expect(handlers.onSaveAsTemplate).toHaveBeenCalledOnce()
  })

  it('calls onDismiss when Dismiss is clicked', () => {
    render(<SessionSummary session={session} messages={messages} {...handlers} />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(handlers.onDismiss).toHaveBeenCalledOnce()
  })
})
