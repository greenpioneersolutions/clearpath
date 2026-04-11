// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ModeIndicator from './ModeIndicator'

describe('ModeIndicator', () => {
  it('renders the current mode label', () => {
    render(<ModeIndicator mode="normal" onToggle={vi.fn()} />)
    expect(screen.getByText('Normal')).toBeInTheDocument()
  })

  it('renders plan mode', () => {
    render(<ModeIndicator mode="plan" onToggle={vi.fn()} />)
    expect(screen.getByText('Plan')).toBeInTheDocument()
  })

  it('renders autopilot mode', () => {
    render(<ModeIndicator mode="autopilot" onToggle={vi.fn()} />)
    expect(screen.getByText('Autopilot')).toBeInTheDocument()
  })

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn()
    render(<ModeIndicator mode="normal" onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('has a title describing the cycle', () => {
    render(<ModeIndicator mode="normal" onToggle={vi.fn()} />)
    expect(screen.getByTitle(/Cycle mode/)).toBeInTheDocument()
  })
})
