// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ExplainButton from './ExplainButton'

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

describe('ExplainButton', () => {
  it('renders the button with label', () => {
    render(<ExplainButton lastExchange="Some exchange text" sessionId="s1" />)
    expect(screen.getByText('What just happened?')).toBeInTheDocument()
  })

  it('is disabled when lastExchange is empty', () => {
    render(<ExplainButton lastExchange="   " sessionId="s1" />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
  })

  it('calls cli:send-input with explanation prompt on click', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    render(<ExplainButton lastExchange="AI created a file" sessionId="s1" />)
    fireEvent.click(screen.getByText('What just happened?'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:send-input', expect.objectContaining({
        sessionId: 's1',
        input: expect.stringContaining('Explain in plain English'),
      }))
    })
  })

  it('shows explanation popup after invoke resolves', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    render(<ExplainButton lastExchange="AI wrote code" sessionId="s1" />)
    fireEvent.click(screen.getByText('What just happened?'))

    await waitFor(() => {
      expect(screen.getByText('Explanation')).toBeInTheDocument()
      expect(screen.getByText(/Explanation sent as follow-up/)).toBeInTheDocument()
    })
  })

  it('closes explanation popup when Close is clicked', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    render(<ExplainButton lastExchange="AI wrote code" sessionId="s1" />)
    fireEvent.click(screen.getByText('What just happened?'))

    await waitFor(() => {
      expect(screen.getByText('Explanation')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Close'))
    expect(screen.queryByText('Explanation')).not.toBeInTheDocument()
  })
})
