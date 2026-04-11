// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PRBuilder from './PRBuilder'

// ── Mock electronAPI ─────────────────────────────────────────────────────────

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
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PRBuilder', () => {
  it('renders title and description', () => {
    render(<PRBuilder cwd="/test/repo" />)
    expect(screen.getByText('PR Builder')).toBeDefined()
    expect(screen.getByText(/Describe what you want built/)).toBeDefined()
  })

  it('renders description textarea and branch name input', () => {
    render(<PRBuilder cwd="/test/repo" />)
    expect(screen.getByPlaceholderText('Describe the feature, bug fix, or change...')).toBeDefined()
    expect(screen.getByPlaceholderText('Auto-generated from description')).toBeDefined()
  })

  it('renders CLI backend selector with Copilot and Claude options', () => {
    render(<PRBuilder cwd="/test/repo" />)
    const select = screen.getByRole('combobox')
    expect(select).toBeDefined()
    expect(screen.getByText('Copilot')).toBeDefined()
    expect(screen.getByText('Claude Code')).toBeDefined()
  })

  it('disables Build button when description is empty', () => {
    render(<PRBuilder cwd="/test/repo" />)
    const button = screen.getByText('Build & Create PR')
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('enables Build button when description has content', () => {
    render(<PRBuilder cwd="/test/repo" />)
    fireEvent.change(screen.getByPlaceholderText('Describe the feature, bug fix, or change...'), {
      target: { value: 'Add login page' },
    })
    const button = screen.getByText('Build & Create PR')
    expect(button.hasAttribute('disabled')).toBe(false)
  })

  it('spawns subagent with correct params on build', async () => {
    mockInvoke.mockResolvedValue(undefined)
    render(<PRBuilder cwd="/test/repo" />)

    fireEvent.change(screen.getByPlaceholderText('Describe the feature, bug fix, or change...'), {
      target: { value: 'Add user authentication' },
    })
    fireEvent.click(screen.getByText('Build & Create PR'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('subagent:spawn', expect.objectContaining({
        name: expect.stringContaining('PR: Add user authentication'),
        cli: 'copilot',
        workingDirectory: '/test/repo',
        permissionMode: 'acceptEdits',
      }))
    })
  })

  it('uses custom branch name when provided', async () => {
    mockInvoke.mockResolvedValue(undefined)
    render(<PRBuilder cwd="/test/repo" />)

    fireEvent.change(screen.getByPlaceholderText('Describe the feature, bug fix, or change...'), {
      target: { value: 'Fix login bug' },
    })
    fireEvent.change(screen.getByPlaceholderText('Auto-generated from description'), {
      target: { value: 'fix/login-bug' },
    })
    fireEvent.click(screen.getByText('Build & Create PR'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('subagent:spawn', expect.objectContaining({
        prompt: expect.stringContaining('fix/login-bug'),
      }))
    })
  })

  it('uses selected CLI backend', async () => {
    mockInvoke.mockResolvedValue(undefined)
    render(<PRBuilder cwd="/test/repo" />)

    fireEvent.change(screen.getByPlaceholderText('Describe the feature, bug fix, or change...'), {
      target: { value: 'Refactor utils' },
    })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'claude' } })
    fireEvent.click(screen.getByText('Build & Create PR'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('subagent:spawn', expect.objectContaining({
        cli: 'claude',
      }))
    })
  })

  it('shows success message after delegation', async () => {
    mockInvoke.mockResolvedValue(undefined)
    render(<PRBuilder cwd="/test/repo" />)

    fireEvent.change(screen.getByPlaceholderText('Describe the feature, bug fix, or change...'), {
      target: { value: 'Build dashboard' },
    })
    fireEvent.click(screen.getByText('Build & Create PR'))

    await waitFor(() => {
      expect(screen.getByText(/Task delegated/)).toBeDefined()
    })
  })

  it('shows error message on failure', async () => {
    mockInvoke.mockRejectedValue(new Error('spawn failed'))
    render(<PRBuilder cwd="/test/repo" />)

    fireEvent.change(screen.getByPlaceholderText('Describe the feature, bug fix, or change...'), {
      target: { value: 'Build dashboard' },
    })
    fireEvent.click(screen.getByText('Build & Create PR'))

    await waitFor(() => {
      expect(screen.getByText(/spawn failed/)).toBeDefined()
    })
  })

  it('shows Delegating... while working', async () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<PRBuilder cwd="/test/repo" />)

    fireEvent.change(screen.getByPlaceholderText('Describe the feature, bug fix, or change...'), {
      target: { value: 'Build dashboard' },
    })
    fireEvent.click(screen.getByText('Build & Create PR'))

    expect(screen.getByText('Delegating...')).toBeDefined()
  })
})
