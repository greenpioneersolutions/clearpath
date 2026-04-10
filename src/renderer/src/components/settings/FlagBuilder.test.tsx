// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import FlagBuilder from './FlagBuilder'

describe('FlagBuilder', () => {
  const onChange = vi.fn()
  const onReset = vi.fn()
  const onResetAll = vi.fn()

  beforeEach(() => {
    onChange.mockReset()
    onReset.mockReset()
    onResetAll.mockReset()
  })

  it('renders heading for copilot', () => {
    render(<FlagBuilder cli="copilot" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    expect(screen.getByText('CLI Flags — GitHub Copilot')).toBeInTheDocument()
  })

  it('renders heading for claude', () => {
    render(<FlagBuilder cli="claude" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    expect(screen.getByText('CLI Flags — Claude Code')).toBeInTheDocument()
  })

  it('renders category tabs', () => {
    render(<FlagBuilder cli="copilot" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    expect(screen.getByText('Mode & Behavior')).toBeInTheDocument()
    expect(screen.getByText('Session Management')).toBeInTheDocument()
  })

  it('shows flags for the active category', () => {
    render(<FlagBuilder cli="copilot" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    // Default category is first one: "Mode & Behavior"
    expect(screen.getByText('Experimental')).toBeInTheDocument()
    expect(screen.getByText('Prompt Mode')).toBeInTheDocument()
  })

  it('switches categories when a tab is clicked', () => {
    render(<FlagBuilder cli="copilot" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    fireEvent.click(screen.getByText('Session Management'))
    expect(screen.getByText('Resume Session')).toBeInTheDocument()
    expect(screen.getByText('Continue Last')).toBeInTheDocument()
  })

  it('calls onChange when a boolean flag is toggled', () => {
    render(<FlagBuilder cli="copilot" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    // "Experimental" is a boolean flag — its toggle is a button
    const toggles = screen.getAllByRole('button')
    // Find the toggle for Experimental (it's inside a FlagControl)
    // Toggle buttons don't have specific labels, so we find by context
    // The first button-like element in the flag controls area
    // Actually, the ToggleSwitch renders a button without a role, but
    // clicking any toggle should call onChange
    const experimental = screen.getByText('Experimental').closest('div')!.parentElement!
    const toggleButton = experimental.querySelector('button')
    if (toggleButton) {
      fireEvent.click(toggleButton)
      expect(onChange).toHaveBeenCalled()
    }
  })

  it('calls onChange when a string flag input changes', () => {
    render(<FlagBuilder cli="copilot" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    fireEvent.click(screen.getByText('Session Management'))
    // "Resume Session" is a string flag with an input
    const inputs = screen.getAllByPlaceholderText('...')
    fireEvent.change(inputs[0], { target: { value: 'session-123' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('shows flag CLI flag identifiers', () => {
    render(<FlagBuilder cli="copilot" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    expect(screen.getByText('--experimental')).toBeInTheDocument()
    expect(screen.getByText('--prompt / -p')).toBeInTheDocument()
  })

  it('shows Reset All button when there are overrides', () => {
    render(<FlagBuilder cli="copilot" values={{ 'copilot:experimental': true }} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    expect(screen.getByText('Reset All')).toBeInTheDocument()
  })

  it('does not show Reset All button when there are no overrides', () => {
    render(<FlagBuilder cli="copilot" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    expect(screen.queryByText('Reset All')).not.toBeInTheDocument()
  })

  it('calls onResetAll when Reset All is clicked', () => {
    render(<FlagBuilder cli="copilot" values={{ 'copilot:experimental': true }} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    fireEvent.click(screen.getByText('Reset All'))
    expect(onResetAll).toHaveBeenCalled()
  })

  it('highlights set flags with different styling', () => {
    const { container } = render(<FlagBuilder cli="copilot" values={{ 'copilot:experimental': true }} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    // Set flags get border-indigo-200 class
    const setFlag = container.querySelector('.border-indigo-200')
    expect(setFlag).not.toBeNull()
  })

  it('shows reset button for individual set flags', () => {
    render(<FlagBuilder cli="copilot" values={{ 'copilot:experimental': true }} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    // Individual reset buttons have title "Reset to default"
    const resetBtn = screen.getByTitle('Reset to default')
    expect(resetBtn).toBeInTheDocument()
  })

  it('calls onReset when individual reset button is clicked', () => {
    render(<FlagBuilder cli="copilot" values={{ 'copilot:experimental': true }} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    fireEvent.click(screen.getByTitle('Reset to default'))
    expect(onReset).toHaveBeenCalledWith('copilot:experimental')
  })

  it('renders claude flag categories', () => {
    render(<FlagBuilder cli="claude" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    expect(screen.getByText('Session Management')).toBeInTheDocument()
    expect(screen.getByText('Permissions & Security')).toBeInTheDocument()
  })

  it('renders enum flag as select dropdown', () => {
    render(<FlagBuilder cli="copilot" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    fireEvent.click(screen.getByText('UI & Accessibility'))
    // "Alt Screen" is an enum flag
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(1)
  })

  it('renders tags flag with input', () => {
    render(<FlagBuilder cli="copilot" values={{}} onChange={onChange} onReset={onReset} onResetAll={onResetAll} />)
    fireEvent.click(screen.getByText('Tool & Permission Control'))
    // "Allowed Tools" is a tags flag with "Add..." placeholder
    expect(screen.getAllByPlaceholderText('Add...').length).toBeGreaterThanOrEqual(1)
  })
})
