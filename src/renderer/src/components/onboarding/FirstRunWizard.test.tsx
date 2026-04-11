// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import FirstRunWizard from './FirstRunWizard'

describe('FirstRunWizard', () => {
  const onComplete = vi.fn()

  beforeEach(() => {
    onComplete.mockReset()
  })

  it('renders the first slide with Welcome title', () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    expect(screen.getByText('Welcome to Clear Path')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('does not show Back button on first slide', () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    expect(screen.queryByText('Back')).not.toBeInTheDocument()
  })

  it('navigates to second slide on Next click', () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('How It Works')).toBeInTheDocument()
    expect(screen.getByText('Back')).toBeInTheDocument()
  })

  it('navigates back on Back click', () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Welcome to Clear Path')).toBeInTheDocument()
  })

  it('shows preset selector on last slide with Get Started button', () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Next')) // slide 2
    fireEvent.click(screen.getByText('Next')) // slide 3
    expect(screen.getByText('Choose Your Comfort Level')).toBeInTheDocument()
    expect(screen.getByText('Get Started')).toBeInTheDocument()
    expect(screen.getByText('Conservative')).toBeInTheDocument()
    expect(screen.getByText('Balanced')).toBeInTheDocument()
    expect(screen.getByText('Power User')).toBeInTheDocument()
  })

  it('calls onComplete with default preset (balanced) when Get Started is clicked', () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Get Started'))
    expect(onComplete).toHaveBeenCalledWith('balanced')
  })

  it('allows selecting a different preset before completing', () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Conservative'))
    fireEvent.click(screen.getByText('Get Started'))
    expect(onComplete).toHaveBeenCalledWith('conservative')
  })

  it('renders progress dots matching the number of slides', () => {
    const { container } = render(<FirstRunWizard onComplete={onComplete} />)
    // 3 slides = 3 dots
    const dots = container.querySelectorAll('.rounded-full.w-2\\.5.h-2\\.5')
    expect(dots).toHaveLength(3)
  })
})
