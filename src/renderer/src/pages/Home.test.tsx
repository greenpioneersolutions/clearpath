// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
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
    if (channel === 'setup-wizard:is-complete') return Promise.resolve({ complete: true })
    if (channel === 'cli:get-persisted-sessions') return Promise.resolve([])
    if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
    if (channel === 'starter-pack:get-all-prompts') return Promise.resolve([])
    if (channel === 'app:get-cwd') return Promise.resolve('/test')
    if (channel === 'auth:get-status') return Promise.resolve({
      copilot: { cli: { installed: false, authenticated: false }, sdk: { installed: false, authenticated: false } },
      claude:  { cli: { installed: false, authenticated: false }, sdk: { installed: false, authenticated: false } },
    })
    return Promise.resolve(null)
  })
})

// Mock the feature-flag context so the wrapper picks HomeHub by default and
// CustomDashboard only when we override.
let mockFlags = { showHomeHub: true } as Record<string, boolean>
vi.mock('../contexts/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({ flags: mockFlags }),
}))

import Home from './Home'

describe('Home wrapper', () => {
  beforeEach(() => { mockFlags = { showHomeHub: true } })

  it('renders without crashing', async () => {
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>)
    await waitFor(() => {
      expect(container.querySelector('h1')).toBeTruthy()
    })
  })

  it('renders HomeHub when showHomeHub flag is on', async () => {
    const { findByPlaceholderText } = render(<MemoryRouter><Home /></MemoryRouter>)
    // Mode B of HomeHub renders the quick-prompt input.
    expect(await findByPlaceholderText(/What do you need help with/i)).toBeInTheDocument()
  })

  // The CustomDashboard fallback (flag off) cannot be exercised here:
  // FeatureFlagContext is eager-loaded by setup-coverage.ts, so the vi.mock
  // above doesn't intercept it. The same caveat is documented for Notes —
  // CLAUDE.md Slice 28. The fallback is exercised manually.
})
