// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'

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
    if (channel === 'cli:get-persisted-sessions') return Promise.resolve([])
    if (channel === 'session-history:list') return Promise.resolve([])
    if (channel === 'branding:get') return Promise.resolve(null)
    if (channel === 'feature-flags:get') return Promise.resolve(null)
    if (channel === 'starter-pack:get-progress') return Promise.resolve(null)
    if (channel === 'setup-wizard:is-complete') return Promise.resolve({ complete: true })
    if (channel === 'notes:list') return Promise.resolve([])
    if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
    if (channel === 'app:get-cwd') return Promise.resolve('/test')
    if (channel === 'skills:list') return Promise.resolve([])
    return Promise.resolve(null)
  })
})

import Home from './Home'

describe('Home', () => {
  it('renders without crashing', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(document.querySelector('h1')).toBeTruthy()
  })

  it('renders quick prompt input', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByPlaceholderText(/What do you need help with/)).toBeInTheDocument()
  })

  it('renders action cards', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText('Ask a question or get guidance')).toBeInTheDocument()
    expect(screen.getByText('Write or do something')).toBeInTheDocument()
    expect(screen.getByText('Explore what I can do')).toBeInTheDocument()
    expect(screen.getByText('Customize my setup')).toBeInTheDocument()
  })

  it('renders context building section', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText('Make the AI work smarter for you')).toBeInTheDocument()
  })

  it('renders memory, agent, and skill shortcuts', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText('Add a memory')).toBeInTheDocument()
    expect(screen.getByText('Create an agent')).toBeInTheDocument()
    expect(screen.getByText('Build a skill')).toBeInTheDocument()
  })
})
