// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import SetupWizard from './SetupWizard'

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

describe('SetupWizard (Team)', () => {
  it('shows checking state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<SetupWizard />)
    expect(screen.getByText('Checking setup...')).toBeInTheDocument()
  })

  it('renders wizard steps after loading', async () => {
    mockInvoke.mockResolvedValue({
      copilotInstalled: true,
      claudeInstalled: false,
      copilotPath: '/usr/local/bin/copilot',
      claudePath: null,
    })

    render(<SetupWizard />)

    await waitFor(() => {
      expect(screen.getByText('New Member Setup Wizard')).toBeInTheDocument()
    })
    expect(screen.getByText('CLI Tools Installed')).toBeInTheDocument()
    expect(screen.getByText('Authentication Configured')).toBeInTheDocument()
    expect(screen.getByText('Team Settings Applied')).toBeInTheDocument()
    expect(screen.getByText('Verification Complete')).toBeInTheDocument()
  })

  it('shows no CLI warning when neither is installed', async () => {
    mockInvoke.mockResolvedValue({
      copilotInstalled: false,
      claudeInstalled: false,
      copilotPath: null,
      claudePath: null,
    })

    render(<SetupWizard />)

    await waitFor(() => {
      expect(screen.getByText('No CLI tools detected')).toBeInTheDocument()
    })
  })

  it('auto-advances to auth step when CLI is installed', async () => {
    mockInvoke.mockResolvedValue({
      copilotInstalled: true,
      claudeInstalled: false,
      copilotPath: '/usr/local/bin/copilot',
      claudePath: null,
    })

    render(<SetupWizard />)

    await waitFor(() => {
      // Auth step should be the current step, showing Check Auth button
      expect(screen.getByText('Check Auth')).toBeInTheDocument()
    })
  })

  it('completes auth check step', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'team:check-setup') return Promise.resolve({
        copilotInstalled: true, claudeInstalled: false, copilotPath: '/usr/bin/copilot', claudePath: null,
      })
      if (channel === 'cli:check-auth') return Promise.resolve({ copilot: true, claude: false })
      return Promise.resolve(null)
    })

    render(<SetupWizard />)

    await waitFor(() => {
      expect(screen.getByText('Check Auth')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Check Auth'))

    await waitFor(() => {
      expect(screen.getByText('Apply Settings')).toBeInTheDocument()
    })
  })

  it('shows success message when all steps complete', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'team:check-setup') return Promise.resolve({
        copilotInstalled: true, claudeInstalled: false, copilotPath: '/usr/bin/copilot', claudePath: null,
      })
      if (channel === 'cli:check-auth') return Promise.resolve({ copilot: true, claude: false })
      if (channel === 'team:get-shared-folder') return Promise.resolve(null)
      return Promise.resolve(null)
    })

    render(<SetupWizard />)

    // Step 2: Check Auth
    await waitFor(() => expect(screen.getByText('Check Auth')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Check Auth'))

    // Step 3: Apply Settings
    await waitFor(() => expect(screen.getByText('Apply Settings')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Apply Settings'))

    // Step 4: Verify
    await waitFor(() => expect(screen.getByText('Verify')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Verify'))

    await waitFor(() => {
      expect(screen.getByText(/Setup complete/)).toBeInTheDocument()
    })
  })
})
