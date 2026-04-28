// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

import QuickStartCard from './QuickStartCard'

/**
 * Build an `auth:get-status` shape that the new readiness logic understands.
 * Pass per-provider readiness booleans for each transport.
 */
function authStatusFixture(
  copilot: { cli?: boolean; sdk?: boolean },
  claude: { cli?: boolean; sdk?: boolean },
) {
  const status = (ready: boolean) => ({
    installed: ready,
    authenticated: ready,
    checkedAt: 0,
  })
  const provider = (
    cli: boolean,
    sdk: boolean,
  ) => ({
    ...status(cli),
    cli: status(cli),
    sdk: status(sdk),
  })
  return {
    copilot: provider(!!copilot.cli, !!copilot.sdk),
    claude:  provider(!!claude.cli,  !!claude.sdk),
  }
}

beforeEach(() => {
  window.localStorage.clear()
  setupElectronAPI({
    'cli:check-installed': { copilot: true, claude: true },
    'auth:get-status': authStatusFixture(
      { cli: true, sdk: false },
      { cli: true, sdk: false },
    ),
    'agent:list': {
      copilot: [
        { id: 'reviewer', name: 'Reviewer', description: 'reviews code', source: 'builtin', cli: 'copilot-cli' },
      ],
      claude: [],
    },
    'app:get-cwd': '/tmp/test-project',
    'templates:list': [
      {
        id: 't-review',
        name: 'PR review',
        category: 'Code Review',
        description: 'review a PR',
        body: 'Review this PR end to end.',
        complexity: 'low',
        variables: [],
        source: 'builtin',
        usageCount: 0,
        totalCost: 0,
        createdAt: 0,
        recommendedModel: 'gpt-4.1',
        recommendedPermissionMode: 'plan',
      },
    ],
    'memory:list-files': [
      { path: '/tmp/test-project/CLAUDE.md', name: 'CLAUDE.md', exists: true, category: 'instructions', cli: 'claude', isGlobal: false },
      { path: '/tmp/test-project/AGENTS.md', name: 'AGENTS.md', exists: true, category: 'instructions', cli: 'copilot', isGlobal: false },
      { path: '/tmp/test-project/missing.md', name: 'missing.md', exists: false, category: 'instructions', cli: 'copilot', isGlobal: false },
    ],
    'skills:list': [
      { id: 'lint', name: 'Lint', description: 'lints code', enabled: false, scope: 'project' },
      { id: 'doc',  name: 'Doc',  description: 'docs',       enabled: true,  scope: 'project' },
    ],
    'skills:toggle': null,
  })
})

describe('QuickStartCard', () => {
  it('renders the textarea, Provider selector, and submit button', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(screen.getByTestId('quick-start-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('quick-start-provider')).toBeInTheDocument()
    expect(screen.getByTestId('quick-start-submit')).toBeInTheDocument()
  })

  it('disables the submit button when prompt is empty', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    const btn = screen.getByTestId('quick-start-submit') as HTMLButtonElement
    expect(btn).toBeDisabled()
  })

  it('enables the submit button when the prompt is non-empty', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    const ta = screen.getByTestId('quick-start-textarea') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'Refactor the auth module' } })
    expect(screen.getByTestId('quick-start-submit') as HTMLButtonElement).not.toBeDisabled()
  })

  it('calls onSubmit with the prompt and computed CLI id', () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} defaultCli="copilot-cli" />)
    const ta = screen.getByTestId('quick-start-textarea') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith({
      prompt: 'Hello world',
      displayPrompt: undefined,
      cli: 'copilot-cli',
      model: undefined,
      agent: undefined,
      permissionMode: undefined,
      additionalDirs: undefined,
      contextSummary: undefined,
    })
  })

  it('switches Provider dropdown selection and forwards the new backend id', () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    const select = screen.getByTestId('quick-start-provider') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'claude' } })
    expect(select.value).toBe('claude')

    const ta = screen.getByTestId('quick-start-textarea') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'Test' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cli: 'claude-cli' }))
  })

  it('disables providers with no ready transport', async () => {
    setupElectronAPI({
      'auth:get-status': authStatusFixture(
        { cli: true,  sdk: false },
        { cli: false, sdk: false },
      ),
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    await waitFor(() => {
      const select = screen.getByTestId('quick-start-provider') as HTMLSelectElement
      const claudeOpt = Array.from(select.options).find((o) => o.value === 'claude')
      expect(claudeOpt?.disabled).toBe(true)
    })
  })

  it('falls back to cli:check-installed when auth:get-status has no provider shape', async () => {
    setupElectronAPI({
      'auth:get-status': null,
      'cli:check-installed': { copilot: true, claude: false },
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    await waitFor(() => {
      const select = screen.getByTestId('quick-start-provider') as HTMLSelectElement
      const claudeOpt = Array.from(select.options).find((o) => o.value === 'claude')
      expect(claudeOpt?.disabled).toBe(true)
    })
  })

  it('hides the Connection picker when only one transport is ready', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    // Default fixture: only CLI is ready for both providers — no picker.
    await waitFor(() => {
      expect(screen.queryByTestId('quick-start-connection')).not.toBeInTheDocument()
    })
  })

  it('shows the Connection picker when both CLI and SDK are ready, and submits the SDK backend id', async () => {
    setupElectronAPI({
      'auth:get-status': authStatusFixture(
        { cli: true, sdk: true },
        { cli: true, sdk: false },
      ),
    })
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)

    const conn = await screen.findByTestId('quick-start-connection') as HTMLSelectElement
    fireEvent.change(conn, { target: { value: 'sdk' } })

    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cli: 'copilot-sdk' }))
  })

  it('passes optional model when provided', async () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'Hi' } })
    // The model dropdown is provider-filtered: copilot tiers are populated.
    fireEvent.change(screen.getByTestId('quick-start-model'), { target: { value: 'gpt-4.1' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Hi', cli: 'copilot-cli', model: 'gpt-4.1' }))
  })

  it('shows provider-filtered model options', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    const model = screen.getByTestId('quick-start-model') as HTMLSelectElement
    // Copilot tier — gpt-5-mini exists, claude haiku/sonnet/opus also exist
    const values = Array.from(model.options).map((o) => o.value)
    expect(values).toContain('gpt-5-mini')

    // Switch to Claude — model list flips to claude tier
    fireEvent.change(screen.getByTestId('quick-start-provider'), { target: { value: 'claude' } })
    const claudeValues = Array.from((screen.getByTestId('quick-start-model') as HTMLSelectElement).options).map((o) => o.value)
    expect(claudeValues).toContain('sonnet')
    expect(claudeValues).not.toContain('gpt-5-mini')
  })

  it('submits via Enter key (not Shift+Enter)', () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    const ta = screen.getByTestId('quick-start-textarea') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'Quick test' } })
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: false })
    expect(onSubmit).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('keeps Advanced collapsed by default', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(screen.queryByTestId('quick-start-advanced')).not.toBeInTheDocument()
  })

  it('reveals agent / permission mode / additional dirs when Advanced is expanded', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))
    expect(screen.getByTestId('quick-start-advanced')).toBeInTheDocument()
    expect(screen.getByTestId('quick-start-permission-mode')).toBeInTheDocument()
    expect(screen.getByTestId('quick-start-additional-dirs')).toBeInTheDocument()
    // Agent picker is now a SectionPicker with a button list, not a <select>.
    const agentPicker = await screen.findByTestId('quick-start-agent-picker')
    await waitFor(() => {
      expect(within(agentPicker).getByText('Reviewer')).toBeInTheDocument()
    })
  })

  it('forwards advanced values to onSubmit', async () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))

    const agentPicker = await screen.findByTestId('quick-start-agent-picker')
    const reviewerBtn = await within(agentPicker).findByText('Reviewer')
    fireEvent.click(reviewerBtn)
    fireEvent.change(screen.getByTestId('quick-start-permission-mode'), { target: { value: 'plan' } })
    fireEvent.change(screen.getByTestId('quick-start-additional-dirs'), { target: { value: '/foo, /bar ,, ' } })
    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'do thing' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'do thing',
      agent: 'reviewer',
      permissionMode: 'plan',
      additionalDirs: ['/foo', '/bar'],
      attachedAgent: { id: 'reviewer', name: 'Reviewer' },
    }))
  })

  it('persists advanced values to localStorage and restores them on remount', async () => {
    const { unmount } = render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))
    const agentPicker = await screen.findByTestId('quick-start-agent-picker')
    const reviewerBtn = await within(agentPicker).findByText('Reviewer')
    fireEvent.click(reviewerBtn)
    fireEvent.change(screen.getByTestId('quick-start-permission-mode'), { target: { value: 'acceptEdits' } })
    fireEvent.change(screen.getByTestId('quick-start-additional-dirs'), { target: { value: '/x' } })

    const stored = window.localStorage.getItem('quickStartAdvanced')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!) as { agent: string; permissionMode: string; additionalDirsRaw: string }
    expect(parsed).toEqual({ agent: 'reviewer', permissionMode: 'acceptEdits', additionalDirsRaw: '/x' })

    unmount()
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))
    await waitFor(() => {
      expect((screen.getByTestId('quick-start-permission-mode') as HTMLSelectElement).value).toBe('acceptEdits')
    })
    expect((screen.getByTestId('quick-start-additional-dirs') as HTMLInputElement).value).toBe('/x')
  })

  // ── Advanced: skills + notes selection ──────────────────────────────────
  // (templates, file attach, and the legacy memory-files picker were removed
  // intentionally — they'll come back as dedicated features later.)

  it('skills picker is per-session multi-select and never calls skills:toggle', async () => {
    const { mockInvoke } = setupElectronAPI({
      'skills:list': [
        { id: 'lint', name: 'Lint', description: 'lints code', enabled: false, scope: 'project', cli: 'both' },
      ],
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
    })
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))

    const skillPicker = await screen.findByTestId('quick-start-skill-picker')
    const lintBtn = await within(skillPicker).findByText('Lint')
    fireEvent.click(lintBtn)

    // The local toggle must NOT mutate the global skill registry.
    expect(mockInvoke).not.toHaveBeenCalledWith('skills:toggle', expect.anything())

    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'go' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      attachedSkills: [{ id: 'lint', name: 'Lint' }],
    }))
  })

  it('notes picker forwards selected note ids/titles via attachedNotes', async () => {
    setupElectronAPI({
      'notes:list': [
        { id: 'n-1', title: 'Quarterly goals', tags: ['planning'], category: 'meeting', updatedAt: 5000, pinned: true },
      ],
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
    })
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))

    const notePicker = await screen.findByTestId('quick-start-note-picker')
    const noteBtn = await within(notePicker).findByText('Quarterly goals')
    fireEvent.click(noteBtn)

    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'go' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      attachedNotes: [{ id: 'n-1', title: 'Quarterly goals' }],
    }))
  })

  // ── Stale-value guards: dropdowns must not silently submit values that
  //    no longer match their visible options. ───────────────────────────────

  it('clears a persisted agent id that does not exist in the loaded agents list, and submits without --agent', async () => {
    // Seed localStorage with an agent id that the current provider's agents list won't contain.
    window.localStorage.setItem('quickStartAdvanced', JSON.stringify({
      agent: 'ghost-agent', permissionMode: 'default', additionalDirsRaw: '',
    }))
    setupElectronAPI({
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
      'agent:list': { copilot: [{ id: 'reviewer', name: 'Reviewer', description: '', source: 'builtin', cli: 'copilot-cli' }], claude: [] },
      'app:get-cwd': '/tmp/proj',
      'templates:list': [],
      'memory:list-files': [],
      'skills:list': [],
    })

    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))

    // After agents load, the stale 'ghost-agent' should be cleared from state.
    // The "No agent (default)" entry should be the only aria-pressed=true row.
    const agentPicker = await screen.findByTestId('quick-start-agent-picker')
    await waitFor(() => {
      const noneBtn = within(agentPicker).getByText(/No agent/i)
      expect(noneBtn.getAttribute('aria-pressed')).toBe('true')
    })

    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'go' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ agent: undefined }))
  })

  it('preserves a persisted agent id when the loaded list contains it', async () => {
    window.localStorage.setItem('quickStartAdvanced', JSON.stringify({
      agent: 'reviewer', permissionMode: 'default', additionalDirsRaw: '',
    }))
    setupElectronAPI({
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
      'agent:list': { copilot: [{ id: 'reviewer', name: 'Reviewer', description: '', source: 'builtin', cli: 'copilot-cli' }], claude: [] },
      'app:get-cwd': '/tmp/proj',
    })

    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))

    const agentPicker = await screen.findByTestId('quick-start-agent-picker')
    await waitFor(() => {
      // Agent name is rendered inside a <span> inside the <button> — climb up
      // to the button to read the aria-pressed selection state.
      const reviewerBtn = within(agentPicker).getByText('Reviewer').closest('button')
      expect(reviewerBtn?.getAttribute('aria-pressed')).toBe('true')
    })

    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'go' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ agent: 'reviewer' }))
  })

  it('explicitly choosing (none) sends agent: undefined even if a previous selection existed', async () => {
    window.localStorage.setItem('quickStartAdvanced', JSON.stringify({
      agent: 'reviewer', permissionMode: 'default', additionalDirsRaw: '',
    }))
    setupElectronAPI({
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
      'agent:list': { copilot: [{ id: 'reviewer', name: 'Reviewer', description: '', source: 'builtin', cli: 'copilot-cli' }], claude: [] },
      'app:get-cwd': '/tmp/proj',
    })

    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))

    const agentPicker = await screen.findByTestId('quick-start-agent-picker')
    await within(agentPicker).findByText('Reviewer')
    await waitFor(() => {
      const btn = within(agentPicker).getByText('Reviewer').closest('button')
      expect(btn?.getAttribute('aria-pressed')).toBe('true')
    })
    // Click "No agent" to clear selection.
    fireEvent.click(within(agentPicker).getByText(/No agent/i))

    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'go' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ agent: undefined }))
  })

  it('clears a model id from one provider when switching to a provider that does not have it', async () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)

    // Pick a Copilot-only model
    fireEvent.change(screen.getByTestId('quick-start-model'), { target: { value: 'gpt-5-mini' } })
    expect((screen.getByTestId('quick-start-model') as HTMLSelectElement).value).toBe('gpt-5-mini')

    // Switch to Claude — the model no longer exists in the new tier list, so state should clear.
    fireEvent.change(screen.getByTestId('quick-start-provider'), { target: { value: 'claude' } })
    await waitFor(() => {
      expect((screen.getByTestId('quick-start-model') as HTMLSelectElement).value).toBe('')
    })

    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'go' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ model: undefined }))
  })
})
