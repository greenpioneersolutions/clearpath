// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { InstallModal } from './InstallModal'
import type {
  InstallCompleteEvent,
  InstallOutputEvent,
  NodeCheckResult,
} from '../types/install'

// ── Mock electronAPI with capturable push-event handlers ─────────────────────

type PushHandler = (payload: unknown) => void

const mockInvoke = vi.fn()
const pushHandlers: Record<string, PushHandler[]> = {}

const mockOn = vi.fn((channel: string, handler: PushHandler) => {
  if (!pushHandlers[channel]) pushHandlers[channel] = []
  pushHandlers[channel].push(handler)
  return () => {
    pushHandlers[channel] = (pushHandlers[channel] ?? []).filter((h) => h !== handler)
  }
})

/** Helper — fire a push event as if main process emitted it. */
function emit(channel: string, payload: unknown): void {
  act(() => {
    ;(pushHandlers[channel] ?? []).forEach((h) => h(payload))
  })
}

const NODE_OK: NodeCheckResult = {
  installed: true,
  version: '22.5.0',
  satisfies22: true,
  platform: 'darwin',
}

const NODE_MISSING: NodeCheckResult = {
  installed: false,
  satisfies22: false,
  platform: 'darwin',
}

const NODE_TOO_OLD: NodeCheckResult = {
  installed: true,
  version: '18.0.0',
  satisfies22: false,
  platform: 'darwin',
}

const NODE_LINUX: NodeCheckResult = {
  installed: false,
  satisfies22: false,
  platform: 'linux',
}

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockClear()
  for (const k of Object.keys(pushHandlers)) delete pushHandlers[k]
})

describe('InstallModal', () => {
  // ── Visibility / mounting ───────────────────────────────────────────────────

  it('returns null when isOpen=false', () => {
    mockInvoke.mockResolvedValue(NODE_OK)
    const { container } = render(
      <InstallModal cli="copilot" isOpen={false} onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders dialog with Copilot title when open', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Install GitHub Copilot')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders dialog with Claude title when open', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="claude" isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Install Claude Code')).toBeInTheDocument()
  })

  // ── Initial Node check ──────────────────────────────────────────────────────

  it('shows "Checking your computer for Node.js" prerequisite text initially', () => {
    // Never resolve the invoke so we stay in the checking-node stage
    mockInvoke.mockImplementation(() => new Promise(() => {}))
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText(/Checking your computer for Node\.js/i)).toBeInTheDocument()
  })

  it('calls auth:check-node on mount', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('auth:check-node')
    })
  })

  // ── Push-event subscriptions ────────────────────────────────────────────────

  it('subscribes to auth:install-output and auth:install-complete push events', () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}))
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(mockOn).toHaveBeenCalledWith('auth:install-output', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('auth:install-complete', expect.any(Function))
  })

  // ── Node-needed branches ────────────────────────────────────────────────────

  it('when Node is missing, renders Install Node.js primary button and nodejs.org fallback', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_MISSING)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Install Node.js for me')).toBeInTheDocument()
    })
    // macOS => managed install available AND nodejs.org fallback
    expect(screen.getByText('Or open nodejs.org')).toBeInTheDocument()
    // Informational reason
    expect(screen.getByText(/Your computer needs Node\.js/i)).toBeInTheDocument()
    // Badge
    expect(screen.getByText('Needs Node.js')).toBeInTheDocument()
  })

  it('when Node version is too old (<22), renders node-needed with "too old" reason', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_TOO_OLD)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Install Node.js for me')).toBeInTheDocument()
    })
    expect(screen.getByText(/too old/i)).toBeInTheDocument()
  })

  it('on Linux (unsupported managed install), shows only the nodejs.org fallback', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_LINUX)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Open nodejs.org')).toBeInTheDocument()
    })
    // No managed-install primary button
    expect(screen.queryByText('Install Node.js for me')).not.toBeInTheDocument()
    expect(screen.getByText(/Automatic install is not available/i)).toBeInTheDocument()
  })

  it('clicking "Install Node.js for me" fires auth:install-node-managed', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_MISSING)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

    const btn = await screen.findByText('Install Node.js for me')
    fireEvent.click(btn)
    expect(mockInvoke).toHaveBeenCalledWith('auth:install-node-managed')
  })

  it('clicking "Or open nodejs.org" fires auth:open-external with the official URL', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_MISSING)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

    const btn = await screen.findByText('Or open nodejs.org')
    fireEvent.click(btn)
    expect(mockInvoke).toHaveBeenCalledWith('auth:open-external', {
      url: 'https://nodejs.org/',
    })
  })

  // ── Happy path: Node OK → CLI install ───────────────────────────────────────

  it('when Node is OK, starts auth:install-start with the selected cli target', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('auth:install-start', { cli: 'copilot' })
    })
  })

  it('starts install for claude when cli="claude"', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="claude" isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('auth:install-start', { cli: 'claude' })
    })
  })

  it('renders Cancel button while installing CLI', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })
    expect(screen.getByText(/Installing GitHub Copilot/i)).toBeInTheDocument()
  })

  // ── Cancel ──────────────────────────────────────────────────────────────────

  it('Cancel during CLI install fires auth:install-cancel for the cli target and closes', async () => {
    const onClose = vi.fn()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={onClose} />)

    const cancelBtn = await screen.findByText('Cancel')
    fireEvent.click(cancelBtn)

    expect(mockInvoke).toHaveBeenCalledWith('auth:install-cancel', { target: 'copilot' })
    expect(onClose).toHaveBeenCalled()
  })

  // ── Streaming output ────────────────────────────────────────────────────────

  it('Show details disclosure reveals streamed output lines', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

    // Wait for installing-cli stage
    await waitFor(() => expect(screen.getByText('Show details')).toBeInTheDocument())

    // Push a streamed line for our cli target
    emit('auth:install-output', {
      target: 'copilot',
      line: 'added 123 packages in 12s',
    } satisfies InstallOutputEvent)

    // Toggle details open
    fireEvent.click(screen.getByText('Show details'))

    // The streamed line should now be visible (inside the aria-live log)
    expect(screen.getByText('added 123 packages in 12s')).toBeInTheDocument()
    expect(screen.getByText('Hide details')).toBeInTheDocument()
  })

  it('ignores output for an unrelated target', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Show details')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Show details'))

    // Claude-scoped output should NOT appear in a Copilot modal
    emit('auth:install-output', {
      target: 'claude',
      line: 'should-not-show',
    } satisfies InstallOutputEvent)

    expect(screen.queryByText('should-not-show')).not.toBeInTheDocument()
  })

  // ── Success stage ───────────────────────────────────────────────────────────

  it('after install-complete success, shows success UI with "Connect your account" and fires onInstalled', async () => {
    vi.useFakeTimers()
    try {
      const onInstalled = vi.fn()
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
        return Promise.resolve(undefined)
      })
      render(
        <InstallModal
          cli="copilot"
          isOpen={true}
          onClose={vi.fn()}
          onInstalled={onInstalled}
        />,
      )

      // Wait until we're past the checking-node stage
      await vi.waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('auth:install-start', { cli: 'copilot' })
      })

      emit('auth:install-complete', {
        target: 'copilot',
        success: true,
      } satisfies InstallCompleteEvent)

      // Verifying → delayed 500ms → success
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      expect(screen.getByText('GitHub Copilot is installed')).toBeInTheDocument()
      const connectBtn = screen.getByText('Connect your account')
      expect(connectBtn).toBeInTheDocument()

      fireEvent.click(connectBtn)
      expect(onInstalled).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // ── Error classification ────────────────────────────────────────────────────

  const errorCases = [
    {
      code: 'EACCES' as const,
      message: 'Install was blocked by a permissions error.',
      hint: 'Your Node.js install may require administrator rights. Try using Homebrew or nvm to manage Node, then try again.',
    },
    {
      code: 'NETWORK' as const,
      message: 'Could not reach the npm registry.',
      hint: 'Check your internet connection and try again. If you are behind a proxy, configure it in your system settings.',
    },
    {
      code: 'NODE_MISSING' as const,
      message: 'Node.js 22 or newer is required.',
      hint: 'Install Node.js 22 (LTS) and try again.',
    },
    {
      code: 'UNKNOWN' as const,
      message: 'The install did not complete.',
      hint: 'See the install details for more information. You can try again, or install manually from a terminal.',
    },
  ]

  for (const errCase of errorCases) {
    it(`renders error UI + hint text for ${errCase.code}`, async () => {
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
        return Promise.resolve(undefined)
      })
      render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('auth:install-start', { cli: 'copilot' })
      })

      emit('auth:install-complete', {
        target: 'copilot',
        success: false,
        error: errCase,
      } satisfies InstallCompleteEvent)

      await waitFor(() => {
        expect(screen.getByText(errCase.message)).toBeInTheDocument()
      })
      expect(screen.getByText(errCase.hint)).toBeInTheDocument()
      expect(screen.getByText('Needs attention')).toBeInTheDocument()
      // Both action buttons available on error
      expect(screen.getByText('Try again')).toBeInTheDocument()
      expect(screen.getByText('Close')).toBeInTheDocument()
    })
  }

  it('Try again from error state restarts the flow with a fresh check-node call', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:check-node') return Promise.resolve(NODE_OK)
      return Promise.resolve(undefined)
    })
    render(<InstallModal cli="copilot" isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('auth:install-start', { cli: 'copilot' })
    })

    emit('auth:install-complete', {
      target: 'copilot',
      success: false,
      error: errorCases[0],
    } satisfies InstallCompleteEvent)

    const tryAgain = await screen.findByText('Try again')
    mockInvoke.mockClear()

    fireEvent.click(tryAgain)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('auth:check-node')
    })
  })
})
