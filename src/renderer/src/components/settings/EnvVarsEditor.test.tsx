// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import EnvVarsEditor from './EnvVarsEditor'

const mockInvoke = vi.fn()

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'settings:get-env-vars') {
      return Promise.resolve({
        GH_TOKEN: { value: 'gh_****1234', isSet: true, isSensitive: true },
        GITHUB_TOKEN: { value: '', isSet: false, isSensitive: true },
        GITHUB_ASKPASS: { value: '/usr/bin/askpass', isSet: true, isSensitive: false },
        COPILOT_CUSTOM_INSTRUCTIONS_DIRS: { value: '', isSet: false, isSensitive: false },
      })
    }
    if (channel === 'settings:set-env-var') return Promise.resolve()
    return Promise.resolve()
  })
})

describe('EnvVarsEditor', () => {
  it('shows loading text initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<EnvVarsEditor cli="copilot" />)
    expect(screen.getByText('Loading environment variables...')).toBeInTheDocument()
  })

  it('renders relevant env vars for copilot', async () => {
    render(<EnvVarsEditor cli="copilot" />)
    await waitFor(() => expect(screen.getByText('GH_TOKEN')).toBeInTheDocument())
    expect(screen.getByText('GITHUB_TOKEN')).toBeInTheDocument()
    expect(screen.getByText('GITHUB_ASKPASS')).toBeInTheDocument()
  })

  it('renders relevant env vars for claude', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get-env-vars') {
        return Promise.resolve({
          ANTHROPIC_API_KEY: { value: '', isSet: false, isSensitive: true },
          CLAUDE_CODE_MODEL: { value: 'opus', isSet: true, isSensitive: false },
          ENABLE_TOOL_SEARCH: { value: '', isSet: false, isSensitive: false },
        })
      }
      return Promise.resolve()
    })
    render(<EnvVarsEditor cli="claude" />)
    await waitFor(() => expect(screen.getByText('ANTHROPIC_API_KEY')).toBeInTheDocument())
    expect(screen.getByText('CLAUDE_CODE_MODEL')).toBeInTheDocument()
  })

  it('shows green dot for set variables', async () => {
    render(<EnvVarsEditor cli="copilot" />)
    await waitFor(() => expect(screen.getByText('GH_TOKEN')).toBeInTheDocument())
    // The green dot has title="Set"
    const setDots = document.querySelectorAll('[title="Set"]')
    expect(setDots.length).toBeGreaterThanOrEqual(1)
  })

  it('shows Encrypted badge for sensitive variables', async () => {
    render(<EnvVarsEditor cli="copilot" />)
    await waitFor(() => expect(screen.getByText('GH_TOKEN')).toBeInTheDocument())
    const encryptedBadges = screen.getAllByText('Encrypted')
    expect(encryptedBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('shows masked preview for set sensitive variables', async () => {
    render(<EnvVarsEditor cli="copilot" />)
    await waitFor(() => expect(screen.getByText(/gh_\*\*\*\*1234/)).toBeInTheDocument())
  })

  it('uses password input type for sensitive variables', async () => {
    render(<EnvVarsEditor cli="copilot" />)
    await waitFor(() => expect(screen.getByText('GH_TOKEN')).toBeInTheDocument())
    const passwordInputs = document.querySelectorAll('input[type="password"]')
    expect(passwordInputs.length).toBeGreaterThanOrEqual(1)
  })

  it('uses text input type for non-sensitive variables', async () => {
    render(<EnvVarsEditor cli="copilot" />)
    await waitFor(() => expect(screen.getByText('GITHUB_ASKPASS')).toBeInTheDocument())
    // GITHUB_ASKPASS should have a text input with value
    const textInputs = document.querySelectorAll('input[type="text"]')
    expect(textInputs.length).toBeGreaterThanOrEqual(1)
  })

  it('calls settings:set-env-var when Save is clicked for non-sensitive var', async () => {
    render(<EnvVarsEditor cli="copilot" />)
    await waitFor(() => expect(screen.getByText('GITHUB_ASKPASS')).toBeInTheDocument())

    // GITHUB_ASKPASS is the 3rd copilot env var — its Save button is not disabled
    // because it's non-sensitive. Find all save buttons and click the one for GITHUB_ASKPASS.
    const saveButtons = screen.getAllByText('Save')
    // The save button for GITHUB_ASKPASS (3rd var: GH_TOKEN, GITHUB_TOKEN, GITHUB_ASKPASS)
    // But sensitive vars have disabled Save buttons when empty, so we need to find the enabled one.
    const enabledSaveButton = saveButtons.find((btn) => !btn.hasAttribute('disabled'))
    expect(enabledSaveButton).toBeDefined()
    fireEvent.click(enabledSaveButton!)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:set-env-var', expect.objectContaining({ key: expect.any(String), value: expect.any(String) }))
    })
  })

  it('shows Clear button for set variables', async () => {
    render(<EnvVarsEditor cli="copilot" />)
    await waitFor(() => expect(screen.getByText('GH_TOKEN')).toBeInTheDocument())
    const clearButtons = screen.getAllByText('Clear')
    // GH_TOKEN and GITHUB_ASKPASS are set
    expect(clearButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('renders heading and description', async () => {
    render(<EnvVarsEditor cli="copilot" />)
    await waitFor(() => expect(screen.getByText('Environment Variables')).toBeInTheDocument())
    expect(screen.getByText(/Set variables injected into CLI child processes/)).toBeInTheDocument()
  })
})
