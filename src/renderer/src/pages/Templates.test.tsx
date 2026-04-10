// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

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
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'templates:list') return Promise.resolve([])
    if (channel === 'template:get-stats') return Promise.resolve({ totalUses: 0, topTemplates: [] })
    if (channel === 'cli:list-sessions') return Promise.resolve([])
    return Promise.resolve(null)
  })
})

import Templates from './Templates'

describe('Templates', () => {
  it('renders page heading', () => {
    render(<Templates />)
    expect(screen.getByText('Templates')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<Templates />)
    expect(screen.getByText(/Reusable prompt templates/)).toBeInTheDocument()
  })

  it('shows Stats button', () => {
    render(<Templates />)
    expect(screen.getByText('Stats')).toBeInTheDocument()
  })

  it('shows Create Template button', () => {
    render(<Templates />)
    expect(screen.getByText('+ Create Template')).toBeInTheDocument()
  })

  it('loads template list on mount', () => {
    render(<Templates />)
    expect(mockInvoke).toHaveBeenCalledWith('templates:list', expect.any(Object))
  })

  it('shows empty state when no templates loaded', async () => {
    render(<Templates />)
    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument()
    })
  })
})
