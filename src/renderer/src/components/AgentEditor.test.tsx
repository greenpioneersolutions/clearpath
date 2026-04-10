// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AgentEditor } from './AgentEditor'
import type { AgentDef } from '../types/ipc'

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

const agent: AgentDef = {
  id: 'a1',
  cli: 'copilot',
  name: 'Test Agent',
  description: 'An agent for testing',
  source: 'user',
  filePath: '/path/to/agent.md',
}

describe('AgentEditor', () => {
  it('returns null when not open', () => {
    const { container } = render(
      <AgentEditor agent={agent} isOpen={false} onClose={vi.fn()} onSaved={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('returns null when agent is null', () => {
    const { container } = render(
      <AgentEditor agent={null} isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders editor when open with agent', async () => {
    mockInvoke.mockResolvedValueOnce('---\nname: Test\ndescription: Desc\n---\nPrompt content')
    render(
      <AgentEditor agent={agent} isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />,
    )
    expect(screen.getByText('Edit Agent')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test')).toBeInTheDocument()
    })
  })

  it('shows file path', async () => {
    mockInvoke.mockResolvedValueOnce('---\nname: Test\n---')
    render(
      <AgentEditor agent={agent} isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />,
    )
    expect(screen.getByText('/path/to/agent.md')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    mockInvoke.mockResolvedValueOnce('---\nname: Test\n---')
    const onClose = vi.fn()
    render(
      <AgentEditor agent={agent} isOpen={true} onClose={onClose} onSaved={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('save button is disabled when not dirty', async () => {
    mockInvoke.mockResolvedValueOnce('---\nname: Test\n---')
    render(
      <AgentEditor agent={agent} isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeDisabled()
    })
  })

  it('can toggle between raw and structured mode', async () => {
    mockInvoke.mockResolvedValueOnce('---\nname: Test\ndescription: Desc\n---\nPrompt')
    render(
      <AgentEditor agent={agent} isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Test')).toBeInTheDocument())
    // Switch to raw
    fireEvent.click(screen.getByText('Raw'))
    expect(screen.getByText(/Editing raw markdown/)).toBeInTheDocument()
    // Switch back
    fireEvent.click(screen.getByText('Structured'))
    expect(screen.getByText(/Structured editor/)).toBeInTheDocument()
  })
})
