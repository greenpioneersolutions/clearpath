// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { StarterSkillWalkthrough } from './StarterSkillWalkthrough'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

const skill = {
  id: 'sk-1',
  name: 'Test Runner',
  description: 'Runs tests for you',
  inputDescription: 'A test file path',
  outputDescription: 'Test results',
  primaryAgents: ['agent-1'],
  secondaryAgents: [],
  skillPrompt: 'Run the tests...',
}

describe('StarterSkillWalkthrough', () => {
  const baseProps = {
    skill,
    activeCli: 'copilot' as const,
    isOpen: true,
    onClose: vi.fn(),
    onCreated: vi.fn(),
  }

  it('returns null when not open', () => {
    const { container } = render(
      <StarterSkillWalkthrough {...baseProps} isOpen={false} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders skill name', () => {
    render(<StarterSkillWalkthrough {...baseProps} />)
    expect(screen.getByText('Test Runner')).toBeInTheDocument()
  })

  it('renders skill description', () => {
    render(<StarterSkillWalkthrough {...baseProps} />)
    expect(screen.getByText('Runs tests for you')).toBeInTheDocument()
  })

  it('renders skill input and output descriptions', () => {
    render(<StarterSkillWalkthrough {...baseProps} />)
    expect(screen.getByText('A test file path')).toBeInTheDocument()
    expect(screen.getByText('Test results')).toBeInTheDocument()
  })

  it('has cancel/close button', () => {
    render(<StarterSkillWalkthrough {...baseProps} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
