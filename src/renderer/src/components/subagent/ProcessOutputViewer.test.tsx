// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// Provide scrollIntoView globally for jsdom (OutputDisplay uses it)
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

import ProcessOutputViewer from './ProcessOutputViewer'

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

describe('ProcessOutputViewer', () => {
  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<ProcessOutputViewer subAgentId="sa-1" />)
    expect(screen.getByText('Loading output...')).toBeInTheDocument()
  })

  it('loads and renders output messages', async () => {
    mockInvoke.mockResolvedValue([
      { type: 'text', content: 'Hello from agent' },
      { type: 'text', content: 'Done!' },
    ])

    render(<ProcessOutputViewer subAgentId="sa-1" />)

    // The real OutputDisplay renders with role="log"
    await waitFor(() => {
      expect(screen.getByRole('log')).toBeInTheDocument()
    })

    // Both text messages should be rendered somewhere in the output
    expect(screen.getByText('Hello from agent')).toBeInTheDocument()
    expect(screen.getByText('Done!')).toBeInTheDocument()
  })

  it('calls subagent:get-output with the correct id', async () => {
    mockInvoke.mockResolvedValue([])

    render(<ProcessOutputViewer subAgentId="sa-42" />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('subagent:get-output', { id: 'sa-42' })
    })
  })

  it('subscribes to subagent:output events', async () => {
    mockInvoke.mockResolvedValue([])

    render(<ProcessOutputViewer subAgentId="sa-1" />)

    await waitFor(() => {
      expect(mockOn).toHaveBeenCalledWith('subagent:output', expect.any(Function))
    })
  })

  it('handles null response from subagent:get-output without crashing', async () => {
    mockInvoke.mockResolvedValue(null)

    render(<ProcessOutputViewer subAgentId="sa-1" />)

    // Should render the output container without throwing
    await waitFor(() => {
      expect(screen.getByRole('log')).toBeInTheDocument()
    })
  })

  it('handles undefined response from subagent:get-output without crashing', async () => {
    mockInvoke.mockResolvedValue(undefined)

    render(<ProcessOutputViewer subAgentId="sa-1" />)

    await waitFor(() => {
      expect(screen.getByRole('log')).toBeInTheDocument()
    })
  })

  it('applies popout height class when isPopout is true', async () => {
    mockInvoke.mockResolvedValue([])

    const { container } = render(<ProcessOutputViewer subAgentId="sa-1" isPopout />)

    await waitFor(() => {
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toHaveClass('h-screen')
    })
  })

  it('applies default height class when isPopout is false', async () => {
    mockInvoke.mockResolvedValue([])

    const { container } = render(<ProcessOutputViewer subAgentId="sa-1" />)

    await waitFor(() => {
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toHaveClass('h-80')
    })
  })
})
