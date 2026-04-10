// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import CommandInput from './CommandInput'

describe('CommandInput', () => {
  const baseProps = {
    cli: 'copilot' as const,
    onSend: vi.fn(),
    onSlashCommand: vi.fn(),
  }

  beforeEach(() => {
    baseProps.onSend.mockReset()
    baseProps.onSlashCommand.mockReset()
  })

  it('renders the textarea', () => {
    render(<CommandInput {...baseProps} />)
    expect(screen.getByLabelText('Message input')).toBeInTheDocument()
  })

  it('renders the send button', () => {
    render(<CommandInput {...baseProps} />)
    expect(screen.getByLabelText('Send message')).toBeInTheDocument()
  })

  it('renders helper text', () => {
    render(<CommandInput {...baseProps} />)
    expect(screen.getByText(/Press Enter to send/)).toBeInTheDocument()
  })

  it('shows placeholder text', () => {
    render(<CommandInput {...baseProps} />)
    expect(screen.getByPlaceholderText(/Type a message/)).toBeInTheDocument()
  })

  it('shows processing placeholder when processing', () => {
    render(<CommandInput {...baseProps} processing={true} />)
    expect(screen.getByPlaceholderText(/Waiting for response/)).toBeInTheDocument()
  })

  it('shows stopped placeholder when disabled', () => {
    render(<CommandInput {...baseProps} disabled={true} />)
    expect(screen.getByPlaceholderText('Session stopped')).toBeInTheDocument()
  })

  it('calls onSend when Enter is pressed with text', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: 'hello world' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(baseProps.onSend).toHaveBeenCalledWith('hello world')
  })

  it('does not send empty input', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(baseProps.onSend).not.toHaveBeenCalled()
  })

  it('calls onSlashCommand for slash commands', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/help' } })
    // The input starts with / so suggestions may show. Enter should accept/submit.
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(baseProps.onSlashCommand).toHaveBeenCalledWith('/help')
  })

  it('shows slash command suggestions when typing /', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/cl' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('/clear')).toBeInTheDocument()
  })

  it('uses claude commands when cli is claude', () => {
    render(<CommandInput {...baseProps} cli="claude" />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/co' } })
    expect(screen.getByText('/compact')).toBeInTheDocument()
    expect(screen.getByText('/config')).toBeInTheDocument()
    expect(screen.getByText('/cost')).toBeInTheDocument()
  })

  it('send button is disabled when input is empty', () => {
    render(<CommandInput {...baseProps} />)
    const btn = screen.getByLabelText('Send message')
    expect(btn).toBeDisabled()
  })

  it('send button is enabled when input has text', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: 'test' } })
    const btn = screen.getByLabelText('Send message')
    expect(btn).not.toBeDisabled()
  })
})
