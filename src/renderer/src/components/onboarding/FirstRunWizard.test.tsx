// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import FirstRunWizard from './FirstRunWizard'

describe('FirstRunWizard', () => {
  const onComplete = vi.fn()
  const mockInvoke = vi.fn()

  beforeEach(() => {
    onComplete.mockReset()
    mockInvoke.mockReset().mockResolvedValue(null)
    Object.defineProperty(window, 'electronAPI', {
      value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  /** Advance from the first slide to the last (preset) slide. */
  const goToLastSlide = () => {
    fireEvent.click(screen.getByText('Next')) // → How It Works
    fireEvent.click(screen.getByText('Next')) // → Which assistant
    fireEvent.click(screen.getByText('Next')) // → Where do you keep your code?
    fireEvent.click(screen.getByText('Next')) // → Choose Your Comfort Level
  }

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

  it('shows the primary-CLI picker on the third slide', () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Next')) // How It Works
    fireEvent.click(screen.getByText('Next')) // Which assistant
    expect(screen.getByText('Which assistant will you use?')).toBeInTheDocument()
    expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('shows preset selector on last slide with Get Started button', () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    goToLastSlide()
    expect(screen.getByText('Choose Your Comfort Level')).toBeInTheDocument()
    expect(screen.getByText('Get Started')).toBeInTheDocument()
    expect(screen.getByText('Conservative')).toBeInTheDocument()
    expect(screen.getByText('Balanced')).toBeInTheDocument()
    expect(screen.getByText('Power User')).toBeInTheDocument()
  })

  it('calls onComplete with default preset (balanced) when Get Started is clicked', async () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    goToLastSlide()
    fireEvent.click(screen.getByText('Get Started'))
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('balanced'))
  })

  it('allows selecting a different preset before completing', async () => {
    render(<FirstRunWizard onComplete={onComplete} />)
    goToLastSlide()
    fireEvent.click(screen.getByText('Conservative'))
    fireEvent.click(screen.getByText('Get Started'))
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('conservative'))
  })

  it('persists the chosen primary CLI as preferredBackend on completion', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve({ existing: true })
      return Promise.resolve(null)
    })
    render(<FirstRunWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Next')) // How It Works
    fireEvent.click(screen.getByText('Next')) // Which assistant
    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.click(screen.getByText('Next')) // Where do you keep your code?
    fireEvent.click(screen.getByText('Next')) // Comfort Level
    fireEvent.click(screen.getByText('Get Started'))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('settings:set', {
        settings: { existing: true, preferredBackend: 'claude-cli' },
      }),
    )
  })

  it('renders progress dots matching the number of slides', () => {
    const { container } = render(<FirstRunWizard onComplete={onComplete} />)
    // 5 slides = 5 dots
    const dots = container.querySelectorAll('.rounded-full.w-2\\.5.h-2\\.5')
    expect(dots).toHaveLength(5)
  })
})
