// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import BudgetLimits from './BudgetLimits'

describe('BudgetLimits', () => {
  const defaultProps = {
    maxBudgetUsd: null as number | null,
    maxTurns: null as number | null,
    verbose: false,
    onBudgetChange: vi.fn(),
    onTurnsChange: vi.fn(),
    onVerboseChange: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onBudgetChange.mockReset()
    defaultProps.onTurnsChange.mockReset()
    defaultProps.onVerboseChange.mockReset()
  })

  it('renders heading and info banner', () => {
    render(<BudgetLimits {...defaultProps} />)
    expect(screen.getByText('Budget & Limits')).toBeInTheDocument()
    expect(screen.getByText(/headless\/print mode sessions/)).toBeInTheDocument()
  })

  it('shows "Off" when budget is null', () => {
    render(<BudgetLimits {...defaultProps} />)
    const offLabels = screen.getAllByText('Off')
    expect(offLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('shows formatted budget when set', () => {
    render(<BudgetLimits {...defaultProps} maxBudgetUsd={10.5} />)
    expect(screen.getByText('$10.50')).toBeInTheDocument()
  })

  it('shows Clear button when budget is set', () => {
    render(<BudgetLimits {...defaultProps} maxBudgetUsd={5} />)
    const clearButtons = screen.getAllByText('Clear')
    expect(clearButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('calls onBudgetChange(null) when Clear is clicked', () => {
    render(<BudgetLimits {...defaultProps} maxBudgetUsd={5} />)
    const clearButtons = screen.getAllByText('Clear')
    fireEvent.click(clearButtons[0])
    expect(defaultProps.onBudgetChange).toHaveBeenCalledWith(null)
  })

  it('calls onBudgetChange with value when slider changes', () => {
    render(<BudgetLimits {...defaultProps} />)
    const sliders = screen.getAllByRole('slider')
    // First slider is budget
    fireEvent.change(sliders[0], { target: { value: '10' } })
    expect(defaultProps.onBudgetChange).toHaveBeenCalledWith(10)
  })

  it('calls onBudgetChange(null) when slider goes to 0', () => {
    render(<BudgetLimits {...defaultProps} maxBudgetUsd={5} />)
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '0' } })
    expect(defaultProps.onBudgetChange).toHaveBeenCalledWith(null)
  })

  it('shows max turns value when set', () => {
    render(<BudgetLimits {...defaultProps} maxTurns={25} />)
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('calls onTurnsChange when turns slider changes', () => {
    render(<BudgetLimits {...defaultProps} />)
    const sliders = screen.getAllByRole('slider')
    // Second slider is turns
    fireEvent.change(sliders[1], { target: { value: '42' } })
    expect(defaultProps.onTurnsChange).toHaveBeenCalledWith(42)
  })

  it('calls onTurnsChange(null) when turns slider goes to 0', () => {
    render(<BudgetLimits {...defaultProps} maxTurns={10} />)
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[1], { target: { value: '0' } })
    expect(defaultProps.onTurnsChange).toHaveBeenCalledWith(null)
  })

  it('toggles verbose when clicked', () => {
    const { container } = render(<BudgetLimits {...defaultProps} verbose={false} />)
    // The verbose toggle is the last button in the component (after the two sliders)
    const buttons = container.querySelectorAll('button')
    // There are Clear buttons (conditional) + the verbose toggle.
    // With null budget/turns, only the verbose toggle button exists.
    const verboseToggle = buttons[buttons.length - 1]
    fireEvent.click(verboseToggle)
    expect(defaultProps.onVerboseChange).toHaveBeenCalledWith(true)
  })

  it('toggles verbose off when already on', () => {
    const { container } = render(<BudgetLimits {...defaultProps} verbose={true} />)
    const buttons = container.querySelectorAll('button')
    const verboseToggle = buttons[buttons.length - 1]
    fireEvent.click(verboseToggle)
    expect(defaultProps.onVerboseChange).toHaveBeenCalledWith(false)
  })
})
