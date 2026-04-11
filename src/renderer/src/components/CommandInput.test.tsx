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
    // /help is SELF_CONTAINED, so Enter submits it directly
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

  it('Shift+Enter does not submit', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(baseProps.onSend).not.toHaveBeenCalled()
  })

  it('ArrowDown selects next suggestion', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/cl' } })
    // Initially no suggestion selected (idx = -1)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // First item should be aria-selected
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowUp navigates up in suggestions', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/cl' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    const options = screen.getAllByRole('option')
    // Back to first item
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('Escape dismisses suggestions', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/cl' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('Tab accepts currently selected suggestion (self-contained submits it)', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    // /clear is SELF_CONTAINED — Tab should submit it immediately
    fireEvent.change(input, { target: { value: '/cl' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(baseProps.onSlashCommand).toHaveBeenCalledWith('/clear')
  })

  it('Tab on non-self-contained suggestion populates the input with the command + space', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    // /add-dir is NOT self-contained — Tab should put "/add-dir " in the input
    fireEvent.change(input, { target: { value: '/add-d' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    // Suggestions should be gone, input should have /add-dir with space
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect((input as HTMLTextAreaElement).value).toBe('/add-dir ')
  })

  it('clicking a self-contained suggestion submits it as slash command', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/cl' } })
    // /clear is SELF_CONTAINED
    const clearOption = screen.getByText('/clear').closest('button')!
    fireEvent.mouseDown(clearOption)
    expect(baseProps.onSlashCommand).toHaveBeenCalledWith('/clear')
  })

  it('clicking a non-self-contained suggestion populates input with command + space', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    // /add-dir is not SELF_CONTAINED — use a prefix that uniquely matches it
    fireEvent.change(input, { target: { value: '/add-d' } })
    const addDirOption = screen.getByText('/add-dir').closest('button')!
    fireEvent.mouseDown(addDirOption)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect((input as HTMLTextAreaElement).value).toBe('/add-dir ')
  })

  it('Enter accepts first suggestion when none selected (idx === -1)', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/cl' } })
    // Don't navigate — Enter accepts first suggestion (/clear — SELF_CONTAINED)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(baseProps.onSlashCommand).toHaveBeenCalledWith('/clear')
  })

  it('clicking Send button calls onSend with current value', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: 'a message via button' } })
    fireEvent.click(screen.getByLabelText('Send message'))
    expect(baseProps.onSend).toHaveBeenCalledWith('a message via button')
  })

  it('clears suggestions when text includes a space (not a bare slash command)', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/cwd /path' } })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows "instant" badge for SELF_CONTAINED commands in suggestions', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/cl' } })
    expect(screen.getByText('instant')).toBeInTheDocument()
  })

  it('shows "+ args" badge for non-SELF_CONTAINED commands in suggestions', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: '/cd' } })
    expect(screen.getByText('+ args')).toBeInTheDocument()
  })

  it('ArrowUp/Down have no effect when no suggestions are shown', () => {
    render(<CommandInput {...baseProps} />)
    const input = screen.getByLabelText('Message input')
    fireEvent.change(input, { target: { value: 'hello' } })
    // Should not throw or cause issues
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(baseProps.onSend).not.toHaveBeenCalled()
  })
})
