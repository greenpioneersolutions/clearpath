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

// AuthState is now nested per transport (.cli / .sdk) in addition to the
// deprecated top-level projection. Tests mock the full shape so the
// SetupWizard's new CLI+SDK install checks don't read through undefined.
const EMPTY_STATUS = { installed: false, authenticated: false, checkedAt: 0 }
const defaultAuthState = {
  copilot: { ...EMPTY_STATUS, cli: EMPTY_STATUS, sdk: EMPTY_STATUS },
  claude:  { ...EMPTY_STATUS, cli: EMPTY_STATUS, sdk: EMPTY_STATUS },
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
    expect(screen.getByText('Step 1: Choose how to connect')).toBeInTheDocument()
  })

  it('shows installation status for CLI tools', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:get-state') return Promise.resolve(defaultSetupState)
      if (channel === 'auth:get-status') {
        const copilotCli = { ...EMPTY_STATUS, installed: true, binaryPath: '/usr/local/bin/copilot', version: '1.0.0' }
        return Promise.resolve({
          copilot: { ...copilotCli, cli: copilotCli, sdk: EMPTY_STATUS },
          claude:  { ...EMPTY_STATUS, cli: EMPTY_STATUS, sdk: EMPTY_STATUS },
        })
      }
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

  // ── Install Now flow (new) ────────────────────────────────────────────────

  it('CLI step renders Install Now buttons when neither CLI is installed', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:get-state') return Promise.resolve(defaultSetupState)
      if (channel === 'auth:get-status') return Promise.resolve(defaultAuthState)
      return Promise.resolve(null)
    })

    renderWithRouter(<SetupWizardFull />)
    await waitFor(() => expect(screen.getByText("Let's Get Started")).toBeInTheDocument())
    fireEvent.click(screen.getByText("Let's Get Started"))

    // One per card (Copilot + Claude) when neither is installed
    const buttons = screen.getAllByText('Install CLI')
    expect(buttons.length).toBe(2)
  })

  it('CLI step does NOT show legacy manual `npm install -g` command strings', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:get-state') return Promise.resolve(defaultSetupState)
      if (channel === 'auth:get-status') return Promise.resolve(defaultAuthState)
      return Promise.resolve(null)
    })

    renderWithRouter(<SetupWizardFull />)
    await waitFor(() => expect(screen.getByText("Let's Get Started")).toBeInTheDocument())
    fireEvent.click(screen.getByText("Let's Get Started"))

    // Regression check — the old copy-paste npm hints must not be present
    expect(screen.queryByText('npm install -g @github/copilot')).not.toBeInTheDocument()
    expect(screen.queryByText('npm install -g @anthropic-ai/claude-code')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/paste this into a terminal/i),
    ).not.toBeInTheDocument()
  })

  it('clicking Install Now opens the InstallModal (renders install dialog with correct title)', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:get-state') return Promise.resolve(defaultSetupState)
      if (channel === 'auth:get-status') return Promise.resolve(defaultAuthState)
      // The InstallModal will call auth:check-node — keep it pending so we stay on the
      // "checking" stage and don't chase further IPC side-effects.
      if (channel === 'auth:check-node') return new Promise(() => {})
      return Promise.resolve(null)
    })

    renderWithRouter(<SetupWizardFull />)
    await waitFor(() => expect(screen.getByText("Let's Get Started")).toBeInTheDocument())
    fireEvent.click(screen.getByText("Let's Get Started"))

    // Click the FIRST Install Now button (Copilot card)
    const buttons = screen.getAllByText('Install CLI')
    fireEvent.click(buttons[0])

    // InstallModal renders with its header
    await waitFor(() => {
      expect(screen.getByText('Install GitHub Copilot')).toBeInTheDocument()
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders an "Install Now" button for Claude and opens the InstallModal with Claude title', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:get-state') return Promise.resolve(defaultSetupState)
      if (channel === 'auth:get-status') return Promise.resolve(defaultAuthState)
      if (channel === 'auth:check-node') return new Promise(() => {})
      return Promise.resolve(null)
    })

    renderWithRouter(<SetupWizardFull />)
    await waitFor(() => expect(screen.getByText("Let's Get Started")).toBeInTheDocument())
    fireEvent.click(screen.getByText("Let's Get Started"))

    // The second Install Now belongs to the Claude card (buttons render in DOM order).
    const buttons = screen.getAllByText('Install CLI')
    fireEvent.click(buttons[1])

    await waitFor(() => {
      expect(screen.getByText('Install Claude Code')).toBeInTheDocument()
    })
  })
})
