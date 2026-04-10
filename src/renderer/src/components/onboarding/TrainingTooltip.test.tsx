// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import TrainingTooltip from './TrainingTooltip'

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

describe('TrainingTooltip', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <TrainingTooltip actionId="agent-toggle" visible={false} onDismiss={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing for unknown actionId', () => {
    const { container } = render(
      <TrainingTooltip actionId="nonexistent" visible={true} onDismiss={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders tooltip content when visible with valid actionId', () => {
    render(
      <TrainingTooltip actionId="agent-toggle" visible={true} onDismiss={vi.fn()} />,
    )
    expect(screen.getByText('Training Mode')).toBeInTheDocument()
    expect(screen.getByText('Agent Toggle')).toBeInTheDocument()
    expect(screen.getByText('--agent code-reviewer')).toBeInTheDocument()
    expect(screen.getByText(/adds --agent to your session/)).toBeInTheDocument()
  })

  it('calls onDismiss when Dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(
      <TrainingTooltip actionId="yolo-mode" visible={true} onDismiss={onDismiss} />,
    )
    fireEvent.click(screen.getByText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('shows different tooltip for different action IDs', () => {
    render(
      <TrainingTooltip actionId="permission-mode" visible={true} onDismiss={vi.fn()} />,
    )
    expect(screen.getByText('Permission Mode')).toBeInTheDocument()
    expect(screen.getByText('--permission-mode acceptEdits')).toBeInTheDocument()
  })
})
