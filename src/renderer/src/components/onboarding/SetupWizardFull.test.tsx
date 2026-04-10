// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import SetupWizardFull from './SetupWizardFull'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

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

const defaultSetupState = {
  cliInstalled: false,
  authenticated: false,
  agentCreated: false,
  skillCreated: false,
  memoryCreated: false,
  triedWizard: false,
  completedAt: null,
}

const defaultAuthState = {
  copilot: { installed: false, authenticated: false },
  claude: { installed: false, authenticated: false },
}

describe('SetupWizardFull', () => {
  it('shows loading state initially', () => {
    // Never resolve to keep loading
    mockInvoke.mockReturnValue(new Promise(() => {}))
    renderWithRouter(<SetupWizardFull />)
    expect(screen.getByText('Loading setup wizard...')).toBeInTheDocument()
  })

  it('renders welcome step after loading', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:get-state') return Promise.resolve(defaultSetupState)
      if (channel === 'auth:get-status') return Promise.resolve(defaultAuthState)
      if (channel === 'starter-pack:get-agent') return Promise.resolve(null)
      if (channel === 'starter-pack:get-skill') return Promise.resolve(null)
      return Promise.resolve(null)
    })

    renderWithRouter(<SetupWizardFull />)
    await waitFor(() => {
      expect(screen.getByText('Welcome to CoPilot Commander')).toBeInTheDocument()
    })
    expect(screen.getByText("Let's Get Started")).toBeInTheDocument()
  })

  it('navigates to CLI step when Get Started is clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:get-state') return Promise.resolve(defaultSetupState)
      if (channel === 'auth:get-status') return Promise.resolve(defaultAuthState)
      if (channel === 'starter-pack:get-agent') return Promise.resolve(null)
      if (channel === 'starter-pack:get-skill') return Promise.resolve(null)
      return Promise.resolve(null)
    })

    renderWithRouter(<SetupWizardFull />)
    await waitFor(() => {
      expect(screen.getByText("Let's Get Started")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Let's Get Started"))
    expect(screen.getByText('Step 1: CLI Tools')).toBeInTheDocument()
  })

  it('shows installation status for CLI tools', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:get-state') return Promise.resolve(defaultSetupState)
      if (channel === 'auth:get-status') return Promise.resolve({
        copilot: { installed: true, authenticated: false, binaryPath: '/usr/local/bin/copilot', version: '1.0.0' },
        claude: { installed: false, authenticated: false },
      })
      if (channel === 'starter-pack:get-agent') return Promise.resolve(null)
      if (channel === 'starter-pack:get-skill') return Promise.resolve(null)
      return Promise.resolve(null)
    })

    renderWithRouter(<SetupWizardFull />)
    await waitFor(() => {
      expect(screen.getByText("Let's Get Started")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Let's Get Started"))
    expect(screen.getByText('Installed')).toBeInTheDocument()
    expect(screen.getByText('Next: Authentication')).toBeInTheDocument()
  })

  it('renders done step when setup is already completed', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:get-state') return Promise.resolve({
        ...defaultSetupState,
        completedAt: Date.now(),
      })
      if (channel === 'auth:get-status') return Promise.resolve(defaultAuthState)
      if (channel === 'starter-pack:get-agent') return Promise.resolve(null)
      if (channel === 'starter-pack:get-skill') return Promise.resolve(null)
      return Promise.resolve(null)
    })

    renderWithRouter(<SetupWizardFull />)
    await waitFor(() => {
      expect(screen.getByText("You're All Set!")).toBeInTheDocument()
    })
  })

  it('renders Setup Wizard heading', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:get-state') return Promise.resolve(defaultSetupState)
      if (channel === 'auth:get-status') return Promise.resolve(defaultAuthState)
      if (channel === 'starter-pack:get-agent') return Promise.resolve(null)
      if (channel === 'starter-pack:get-skill') return Promise.resolve(null)
      return Promise.resolve(null)
    })

    renderWithRouter(<SetupWizardFull />)
    await waitFor(() => {
      expect(screen.getByText('Setup Wizard')).toBeInTheDocument()
    })
  })
})
