// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { StarterAgentWalkthrough } from './StarterAgentWalkthrough'

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

const starterAgent = {
  id: 'sa-1',
  name: 'Code Reviewer',
  tagline: 'Reviews your code',
  description: 'An agent that reviews code for quality',
  category: 'spotlight' as const,
  handles: ['review', 'code-quality'],
  systemPrompt: 'You are a code reviewer...',
  associatedSkills: [],
}

describe('StarterAgentWalkthrough', () => {
  const baseProps = {
    agent: starterAgent,
    activeCli: 'copilot' as const,
    isOpen: true,
    onClose: vi.fn(),
    onCreated: vi.fn(),
  }

  it('returns null when not open', () => {
    const { container } = render(
      <StarterAgentWalkthrough {...baseProps} isOpen={false} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders agent name in preview', () => {
    render(<StarterAgentWalkthrough {...baseProps} />)
    expect(screen.getByText('Code Reviewer')).toBeInTheDocument()
  })

  it('renders agent description', () => {
    render(<StarterAgentWalkthrough {...baseProps} />)
    expect(screen.getByText('An agent that reviews code for quality')).toBeInTheDocument()
  })

  it('renders agent tagline', () => {
    render(<StarterAgentWalkthrough {...baseProps} />)
    expect(screen.getByText('Reviews your code')).toBeInTheDocument()
  })

  it('renders action buttons', () => {
    render(<StarterAgentWalkthrough {...baseProps} />)
    // Should have Install or a continue button on the preview step
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
