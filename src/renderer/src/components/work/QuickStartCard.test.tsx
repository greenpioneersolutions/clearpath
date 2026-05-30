// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

import QuickStartCard from './QuickStartCard'
import { LAUNCHPAD_COPY } from '../../copy/launchpad'

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
    'locations:list-approved': [
      { id: 'f-foo', label: 'Foo', path: '/foo', addedAt: 0 },
      { id: 'f-bar', label: 'Bar', path: '/bar', addedAt: 0 },
      { id: 'f-x',   label: 'X',   path: '/x',   addedAt: 0 },
    ],
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
    // The payload now also carries attachment + per-session-toggle fields, so we
    // assert the core values rather than an exact object.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Hello world',
      cli: 'copilot-cli',
    }))
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

  it('disables providers with no ready transport in the pill popover', async () => {
    // Only copilot is ready → provider <select> collapses into a "via Copilot · change"
    // pill. The full list still lives inside the popover; claude must be disabled.
    setupElectronAPI({
      'auth:get-status': authStatusFixture(
        { cli: true,  sdk: false },
        { cli: false, sdk: false },
      ),
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    const pill = await screen.findByTestId('quick-start-provider-pill') as HTMLButtonElement
    expect(pill).toBeInTheDocument()
    fireEvent.click(pill)
    const popover = await screen.findByTestId('quick-start-provider-popover')
    const claudeOpt = within(popover).getByRole('menuitemradio', { name: /Claude/i }) as HTMLButtonElement
    expect(claudeOpt).toBeDisabled()
  })

  it('shows the connect CTA when only the legacy cli:check-installed fallback is available', async () => {
    // auth:get-status returns no provider shape, so useAuthStatus falls back to
    // cli:check-installed — which reports install state only and deliberately
    // treats "installed but unknown auth" as not-ready. With neither provider
    // ready, the launchpad blocks with the connect CTA instead of the picker.
    setupElectronAPI({
      'auth:get-status': null,
      'cli:check-installed': { copilot: true, claude: false },
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(await screen.findByTestId('quick-start-connect-cta')).toBeInTheDocument()
    // The composer (and its provider picker) is replaced by the CTA.
    expect(screen.queryByTestId('quick-start-provider-pill')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quick-start-textarea')).not.toBeInTheDocument()
  })

  it('auto-corrects a Copilot default to the ready Claude provider (fresh-install case)', async () => {
    // The exact bug: defaultCli is the hardcoded copilot-cli but only Claude is
    // connected. The provider must self-correct to Claude so the launch targets
    // a CLI that can actually spawn — and submit must forward claude-cli.
    const onSubmit = vi.fn()
    setupElectronAPI({
      'auth:get-status': authStatusFixture({ cli: false, sdk: false }, { cli: true, sdk: false }),
    })
    render(<QuickStartCard onSubmit={onSubmit} defaultCli="copilot-cli" />)
    // Once readiness lands, the single-ready pill should read "Claude".
    await waitFor(() => {
      expect(screen.getByTestId('quick-start-provider-pill').textContent).toMatch(/Claude/)
    })
    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cli: 'claude-cli' }))
  })

  it('blocks submit and shows the connect CTA when neither provider is authenticated', async () => {
    const onSubmit = vi.fn()
    setupElectronAPI({
      'auth:get-status': authStatusFixture({ cli: false, sdk: false }, { cli: false, sdk: false }),
    })
    render(<QuickStartCard onSubmit={onSubmit} />)
    expect(await screen.findByTestId('quick-start-connect-cta')).toBeInTheDocument()
    // The connect button is a hash anchor into the setup wizard.
    const cta = screen.getByTestId('quick-start-connect-cta-button') as HTMLAnchorElement
    expect(cta.getAttribute('href')).toBe('#/configure?tab=setup')
    // No composer means no way to submit a doomed launch.
    expect(screen.queryByTestId('quick-start-submit')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not render the Connection picker (CLI vs SDK lives in Configure → Backends now)', async () => {
    // PR 1, change #2 — Connection picker was removed from this surface for
    // both single-ready and dual-ready situations. Transport is derived from
    // `defaultCli` and chosen in Configure → Backends.
    render(<QuickStartCard onSubmit={vi.fn()} />)
    await waitFor(() => {
      expect(screen.queryByTestId('quick-start-connection')).not.toBeInTheDocument()
    })
  })

  it('derives the SDK transport from defaultCli without a user-visible picker', async () => {
    // The Connection picker is gone — but we must still submit `${provider}-${transport}`
    // honoring the transport encoded in `defaultCli`. The defensive transport-
    // fallback effect inside the component may briefly flip to 'cli' before
    // auth status loads (EMPTY_READINESS treats sdk as unavailable); we wait
    // for the dual-provider <select> to appear, which only renders once auth
    // status confirms BOTH providers are ready.
    setupElectronAPI({
      'auth:get-status': authStatusFixture(
        { cli: true, sdk: true },
        { cli: true, sdk: false },
      ),
    })
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} defaultCli="copilot-sdk" />)
    // No connection picker should ever appear.
    expect(screen.queryByTestId('quick-start-connection')).not.toBeInTheDocument()
    // Wait for auth to finish loading (the dual-provider select appears once
    // readiness is real, not the optimistic EMPTY_READINESS default).
    await waitFor(() => {
      expect(screen.getByTestId('quick-start-provider')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    // After auth load, transport stays as the SDK that came in via defaultCli
    // because copilot SDK readiness is true and the defensive fallback only
    // fires when the current transport is NOT ready.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cli: 'copilot-sdk' }))
  })

  it('renders the provider <select> only when 2+ providers are ready', async () => {
    // Default fixture: both providers ready → user can switch via select.
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(await screen.findByTestId('quick-start-provider')).toBeInTheDocument()
    expect(screen.queryByTestId('quick-start-provider-pill')).not.toBeInTheDocument()
  })

  it('collapses provider into a pill when only one provider is ready', async () => {
    setupElectronAPI({
      'auth:get-status': authStatusFixture(
        { cli: true,  sdk: false },
        { cli: false, sdk: false },
      ),
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(await screen.findByTestId('quick-start-provider-pill')).toBeInTheDocument()
    expect(screen.queryByTestId('quick-start-provider')).not.toBeInTheDocument()
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

  it('keeps the Customize disclosure collapsed and all chip popovers closed by default', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(screen.queryByTestId('quick-start-customize')).not.toBeInTheDocument()
    // None of the chip popovers should be in the DOM until a chip is clicked.
    expect(screen.queryByTestId('attachment-popover')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quick-start-agent-picker')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quick-start-skill-picker')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quick-start-note-picker')).not.toBeInTheDocument()
  })

  it('reveals the agent picker when the Agent chip is clicked', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))
    // Permission mode + additional dirs live in the Customize disclosure, not
    // inside the Agent popover.
    expect(screen.queryByTestId('quick-start-permission-mode')).not.toBeInTheDocument()
    const agentPicker = await screen.findByTestId('quick-start-agent-picker')
    await waitFor(() => {
      expect(within(agentPicker).getByText('Reviewer')).toBeInTheDocument()
    })
  })

  it('reveals permission mode + session toggles when Customize is expanded; folders live in the +Folder chip', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('quick-start-customize-toggle'))
    expect(screen.getByTestId('quick-start-customize')).toBeInTheDocument()
    expect(screen.getByTestId('quick-start-permission-mode')).toBeInTheDocument()
    // Per-session CLI toggles now live in Customize (folders moved out).
    expect(screen.getByTestId('quick-start-cli-toggles')).toBeInTheDocument()
    // Folders are reached via the +Folder chip popover.
    fireEvent.click(screen.getByTestId('attachment-chip:folder'))
    expect(await screen.findByTestId('quick-start-folder-picker')).toBeInTheDocument()
  })

  it('forwards attachment + customize values to onSubmit', async () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    // Open the Agent popover via its chip.
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))
    const agentPicker = await screen.findByTestId('quick-start-agent-picker')
    const reviewerBtn = await within(agentPicker).findByText('Reviewer')
    fireEvent.click(reviewerBtn)
    // Switch to the Customize disclosure (separate surface) for permission mode.
    fireEvent.click(screen.getByTestId('quick-start-customize-toggle'))
    fireEvent.change(screen.getByTestId('quick-start-permission-mode'), { target: { value: 'plan' } })
    // Folders now live in the +Folder chip popover (order determines array order).
    fireEvent.click(screen.getByTestId('attachment-chip:folder'))
    const dirPicker = await screen.findByTestId('quick-start-folder-picker')
    fireEvent.click(within(dirPicker).getByText('Foo'))
    fireEvent.click(within(dirPicker).getByText('Bar'))
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
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))
    const agentPicker = await screen.findByTestId('quick-start-agent-picker')
    const reviewerBtn = await within(agentPicker).findByText('Reviewer')
    fireEvent.click(reviewerBtn)
    // Switch to Customize for the permission mode.
    fireEvent.click(screen.getByTestId('quick-start-customize-toggle'))
    fireEvent.change(screen.getByTestId('quick-start-permission-mode'), { target: { value: 'acceptEdits' } })
    // Folder selection lives in the +Folder chip popover now.
    fireEvent.click(screen.getByTestId('attachment-chip:folder'))
    const dirPicker = await screen.findByTestId('quick-start-folder-picker')
    fireEvent.click(within(dirPicker).getByText('X'))

    const stored = window.localStorage.getItem('quickStartAdvanced')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!) as { agent: string; permissionMode: string; additionalDirs: string[] }
    expect(parsed).toEqual({ agent: 'reviewer', permissionMode: 'acceptEdits', additionalDirs: ['/x'] })

    unmount()
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('quick-start-customize-toggle'))
    await waitFor(() => {
      expect((screen.getByTestId('quick-start-permission-mode') as HTMLSelectElement).value).toBe('acceptEdits')
    })
    // The previously-selected folder is restored as selected (aria-pressed) in the chip popover.
    fireEvent.click(screen.getByTestId('attachment-chip:folder'))
    const restoredPicker = await screen.findByTestId('quick-start-folder-picker')
    await waitFor(() => {
      expect(within(restoredPicker).getByText('X').closest('button')).toHaveAttribute('aria-pressed', 'true')
    })
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
    fireEvent.click(screen.getByTestId('attachment-chip:skill'))

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
    fireEvent.click(screen.getByTestId('attachment-chip:note'))

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
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))

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
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))

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
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))

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

  // ── PR 1: Cold-start example chips ─────────────────────────────────────────
  // The three chips render only when (a) the textarea is empty AND (b) the
  // user has never sent a prompt from this surface. Chip text comes from the
  // starter-pack IPC filtered to category === 'launchpad-spotlight'; a hard-
  // coded fallback array kicks in when the IPC errors or returns nothing.

  it('renders the three example chips when input is empty and first-prompt flag is unset', async () => {
    setupElectronAPI({
      // A provider must be connected or the both-red connect CTA replaces the
      // composer (and its example chips). setupElectronAPI resets the mock, so
      // re-supply a ready auth fixture here.
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
      'starter-pack:get-all-prompts': [
        { id: 'l1', displayText: "Explain this project like I'm new",  targetAgentId: 'a', category: 'launchpad-spotlight', displayOrder: 1, followUpQuestions: [] },
        { id: 'l2', displayText: 'Summarize what changed this week',    targetAgentId: 'b', category: 'launchpad-spotlight', displayOrder: 2, followUpQuestions: [] },
        { id: 'l3', displayText: 'Draft a status update for my team',   targetAgentId: 'c', category: 'launchpad-spotlight', displayOrder: 3, followUpQuestions: [] },
        // a non-launchpad entry that must NOT appear as a chip
        { id: 'p1', displayText: 'Some default prompt', targetAgentId: 'x', category: 'default', displayOrder: 4, followUpQuestions: [] },
      ],
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    await waitFor(() => {
      const chips = screen.getAllByTestId('quick-start-example-chip')
      expect(chips).toHaveLength(3)
    })
    const labels = screen.getAllByTestId('quick-start-example-chip').map((b) => b.textContent)
    expect(labels).toEqual([
      "Explain this project like I'm new",
      'Summarize what changed this week',
      'Draft a status update for my team',
    ])
    expect(screen.queryByText('Some default prompt')).not.toBeInTheDocument()
  })

  it('falls back to the hardcoded chips when starter-pack IPC returns nothing', async () => {
    setupElectronAPI({ 'starter-pack:get-all-prompts': [] })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    await waitFor(() => {
      const chips = screen.getAllByTestId('quick-start-example-chip')
      expect(chips).toHaveLength(3)
    })
  })

  it('clicking an example chip prefills the textarea (without auto-submitting)', async () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    const chip = await screen.findAllByTestId('quick-start-example-chip')
    fireEvent.click(chip[0])
    expect((screen.getByTestId('quick-start-textarea') as HTMLTextAreaElement).value)
      .toBe("Explain this project like I'm new")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('hides the chips after the first prompt is submitted and persists the flag', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    await waitFor(() => expect(screen.getAllByTestId('quick-start-example-chip').length).toBeGreaterThan(0))

    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'go' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))

    await waitFor(() => {
      expect(screen.queryByTestId('quick-start-example-chip')).not.toBeInTheDocument()
    })
    expect(window.localStorage.getItem('quickStartFirstPromptSent')).toBe('1')
  })

  it('does not render the chips on a fresh mount if the first-prompt flag is set', async () => {
    window.localStorage.setItem('quickStartFirstPromptSent', '1')
    render(<QuickStartCard onSubmit={vi.fn()} />)
    // wait a tick for any async IPC settle
    await waitFor(() => {
      expect(screen.queryByTestId('quick-start-example-chips')).not.toBeInTheDocument()
    })
  })

  it('hides the chips while there is text in the textarea, even before first submit', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    await waitFor(() => expect(screen.getAllByTestId('quick-start-example-chip').length).toBeGreaterThan(0))
    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'work in progress' } })
    expect(screen.queryByTestId('quick-start-example-chip')).not.toBeInTheDocument()
  })

  // ── PR 1: Plain-language permission mode labels + hint ─────────────────────

  it('renders the four plain-language permission mode labels', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('quick-start-customize-toggle'))
    const select = await screen.findByTestId('quick-start-permission-mode') as HTMLSelectElement
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels).toEqual([
      'Ask me before changes',
      "Just plan, don't change anything",
      'Auto-approve file edits',
      'Full autonomy (advanced)',
    ])
    // Values must stay unchanged — they flow to --permission-mode.
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual(['default', 'plan', 'acceptEdits', 'bypassPermissions'])
  })

  it('renders the hint for the currently selected permission mode and updates on change', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('quick-start-customize-toggle'))
    const hint = await screen.findByTestId('quick-start-permission-mode-hint')
    expect(hint).toHaveTextContent(LAUNCHPAD_COPY.quickStart.permissionHints.default)

    fireEvent.change(screen.getByTestId('quick-start-permission-mode'), { target: { value: 'bypassPermissions' } })
    expect(screen.getByTestId('quick-start-permission-mode-hint'))
      .toHaveTextContent(LAUNCHPAD_COPY.quickStart.permissionHints.bypassPermissions)
  })

  // ── PR 3: Attachment chip toolbar + popover refactor ─────────────────────

  it('renders the four attachment chips (agent / skill / note / files) in a toolbar', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    const toolbar = screen.getByTestId('attachment-chip-toolbar')
    expect(toolbar).toBeInTheDocument()
    expect(within(toolbar).getByTestId('attachment-chip:agent')).toBeInTheDocument()
    expect(within(toolbar).getByTestId('attachment-chip:skill')).toBeInTheDocument()
    expect(within(toolbar).getByTestId('attachment-chip:note')).toBeInTheDocument()
    expect(within(toolbar).getByTestId('attachment-chip:files')).toBeInTheDocument()
    // The Customize toggle is still its own disclosure, separate from the chips.
    expect(screen.getByTestId('quick-start-customize-toggle')).toBeInTheDocument()
  })

  it('clicking a chip opens its popover with the matching SectionPicker', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(screen.queryByTestId('attachment-popover')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('attachment-chip:skill'))
    expect(await screen.findByTestId('attachment-popover')).toBeInTheDocument()
    expect(screen.getByTestId('quick-start-skill-picker')).toBeInTheDocument()
    // The Agent and Note pickers must NOT also render — only one popover open
    // at a time is the contract.
    expect(screen.queryByTestId('quick-start-agent-picker')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quick-start-note-picker')).not.toBeInTheDocument()
  })

  it('clicking the same chip twice closes its popover', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))
    expect(await screen.findByTestId('quick-start-agent-picker')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))
    await waitFor(() => {
      expect(screen.queryByTestId('quick-start-agent-picker')).not.toBeInTheDocument()
    })
    expect(screen.queryByTestId('attachment-popover')).not.toBeInTheDocument()
  })

  it('clicking a different chip closes the first popover and opens the second', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))
    expect(await screen.findByTestId('quick-start-agent-picker')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('attachment-chip:note'))
    await waitFor(() => {
      expect(screen.queryByTestId('quick-start-agent-picker')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('quick-start-note-picker')).toBeInTheDocument()
  })

  it('Escape key closes an open popover', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))
    expect(await screen.findByTestId('quick-start-agent-picker')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByTestId('quick-start-agent-picker')).not.toBeInTheDocument()
    })
  })

  it('mousedown outside the popover closes it', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))
    expect(await screen.findByTestId('quick-start-agent-picker')).toBeInTheDocument()

    // Mousedown on the textarea is outside both the popover and the anchor
    // chip — that's the case the AttachmentPopover's click-outside handler
    // is meant to catch.
    fireEvent.mouseDown(screen.getByTestId('quick-start-textarea'))
    await waitFor(() => {
      expect(screen.queryByTestId('quick-start-agent-picker')).not.toBeInTheDocument()
    })
  })

  it('selecting an item inside a popover surfaces the selected-attachment chip above the input', async () => {
    setupElectronAPI({
      'skills:list': [
        { id: 'lint', name: 'Lint', description: 'lints code', enabled: false, scope: 'project', cli: 'both' },
      ],
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('attachment-chip:skill'))
    const skillPicker = await screen.findByTestId('quick-start-skill-picker')
    fireEvent.click(await within(skillPicker).findByText('Lint'))
    // The selected-attachment chip row above the action row should now render.
    const refs = await screen.findByTestId('quick-start-refs')
    expect(within(refs).getByText('Lint')).toBeInTheDocument()
  })

  it('chip selection count badge appears once there is at least one selection', async () => {
    setupElectronAPI({
      'skills:list': [
        { id: 'lint', name: 'Lint', description: 'lints code', enabled: false, scope: 'project', cli: 'both' },
      ],
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    // No selection yet → no count badge.
    expect(screen.queryByTestId('attachment-chip-count:skill')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('attachment-chip:skill'))
    const skillPicker = await screen.findByTestId('quick-start-skill-picker')
    fireEvent.click(await within(skillPicker).findByText('Lint'))
    // Badge appears with count = 1.
    const badge = await screen.findByTestId('attachment-chip-count:skill')
    expect(badge).toHaveTextContent('1')
  })

  it('Files chip is active (showFileAttachments default-on) and opens a popover', async () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    const filesChip = screen.getByTestId('attachment-chip:files') as HTMLButtonElement
    // File attachments now ship enabled by default, so the chip is interactive.
    expect(filesChip).not.toBeDisabled()
    expect(filesChip).toHaveTextContent(LAUNCHPAD_COPY.quickStart.chips.filesActive)
    fireEvent.click(filesChip)
    expect(await screen.findByTestId('quick-start-files-picker')).toBeInTheDocument()
  })

  // ── PR 3: centralized launchpad copy ─────────────────────────────────────

  it('reads the title, subtitle, and placeholder from LAUNCHPAD_COPY', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(screen.getByText(LAUNCHPAD_COPY.quickStart.title)).toBeInTheDocument()
    expect(screen.getByText(LAUNCHPAD_COPY.quickStart.subtitle)).toBeInTheDocument()
    expect(screen.getByTestId('quick-start-textarea'))
      .toHaveAttribute('placeholder', LAUNCHPAD_COPY.quickStart.placeholder)
  })

  it('renders the submit button label from LAUNCHPAD_COPY', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(screen.getByTestId('quick-start-submit'))
      .toHaveTextContent(LAUNCHPAD_COPY.quickStart.submitLabel)
  })

  it('renders the Customize toggle label from LAUNCHPAD_COPY', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(screen.getByTestId('quick-start-customize-toggle'))
      .toHaveTextContent(LAUNCHPAD_COPY.quickStart.customizeLabel)
  })

  it('renders the four chip labels from LAUNCHPAD_COPY', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(screen.getByTestId('attachment-chip:agent'))
      .toHaveTextContent(LAUNCHPAD_COPY.quickStart.chips.agent)
    expect(screen.getByTestId('attachment-chip:skill'))
      .toHaveTextContent(LAUNCHPAD_COPY.quickStart.chips.skill)
    expect(screen.getByTestId('attachment-chip:note'))
      .toHaveTextContent(LAUNCHPAD_COPY.quickStart.chips.note)
    // Files ships enabled by default now → active label, not the "(soon)" placeholder.
    expect(screen.getByTestId('attachment-chip:files'))
      .toHaveTextContent(LAUNCHPAD_COPY.quickStart.chips.filesActive)
  })

  // ── Gap coverage: end-to-end and resilience ─────────────────────────────────

  it('full E2E flow: opens all three popovers, selects items, and forwards everything to onSubmit', async () => {
    setupElectronAPI({
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
      'agent:list': {
        copilot: [
          { id: 'reviewer', name: 'Reviewer', description: 'reviews', source: 'builtin', cli: 'copilot-cli' },
          { id: 'planner',  name: 'Planner',  description: 'plans',   source: 'builtin', cli: 'copilot-cli' },
        ],
        claude: [],
      },
      'skills:list': [
        { id: 'lint',     name: 'Lint',     description: 'lints',  enabled: false, scope: 'project', cli: 'both' },
        { id: 'doc',      name: 'Doc',      description: 'docs',   enabled: false, scope: 'project', cli: 'both' },
        { id: 'security', name: 'Security', description: 'sec',    enabled: false, scope: 'project', cli: 'both' },
      ],
      'notes:list': [
        { id: 'n-conv', title: 'Team conventions', tags: ['style'], category: 'reference', updatedAt: 1, pinned: false },
      ],
    })
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)

    // Open Agent popover → select Planner.
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))
    const agentPicker = await screen.findByTestId('quick-start-agent-picker')
    fireEvent.click(await within(agentPicker).findByText('Planner'))

    // Open Skill popover → select Lint and Doc. Selections must accumulate
    // across popover open/close cycles (skill state lives on the parent).
    fireEvent.click(screen.getByTestId('attachment-chip:skill'))
    const skillPicker = await screen.findByTestId('quick-start-skill-picker')
    fireEvent.click(await within(skillPicker).findByText('Lint'))
    fireEvent.click(await within(skillPicker).findByText('Doc'))

    // Open Note popover → select the conventions note.
    fireEvent.click(screen.getByTestId('attachment-chip:note'))
    const notePicker = await screen.findByTestId('quick-start-note-picker')
    fireEvent.click(await within(notePicker).findByText('Team conventions'))

    // Sanity (BEFORE submit): the selected-attachment chips above the input
    // reflect all three. Submit clears the draft (skills/notes), so this must
    // be asserted while the selections are still live.
    const refs = screen.getByTestId('quick-start-refs')
    expect(within(refs).getByText('Planner')).toBeInTheDocument()
    expect(within(refs).getByText('Lint')).toBeInTheDocument()
    expect(within(refs).getByText('Doc')).toBeInTheDocument()
    expect(within(refs).getByText('Team conventions')).toBeInTheDocument()

    // Submit. All three attachment kinds plus the prompt must land on onSubmit.
    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'do everything' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'do everything',
      agent: 'planner',
      attachedAgent: { id: 'planner', name: 'Planner' },
      attachedSkills: expect.arrayContaining([
        { id: 'lint', name: 'Lint' },
        { id: 'doc',  name: 'Doc'  },
      ]),
      attachedNotes: [{ id: 'n-conv', title: 'Team conventions' }],
    }))
  })

  it('does NOT persist skill or note selections to ADVANCED_KEY (those are per-session only)', async () => {
    setupElectronAPI({
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
      'skills:list': [
        { id: 'lint', name: 'Lint', description: 'lints', enabled: false, scope: 'project', cli: 'both' },
      ],
      'notes:list': [
        { id: 'n-1', title: 'A note', tags: [], category: 'reference', updatedAt: 1, pinned: false },
      ],
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByTestId('attachment-chip:skill'))
    fireEvent.click(await within(await screen.findByTestId('quick-start-skill-picker')).findByText('Lint'))
    fireEvent.click(screen.getByTestId('attachment-chip:note'))
    fireEvent.click(await within(await screen.findByTestId('quick-start-note-picker')).findByText('A note'))

    // The localStorage shape pins down what's allowed to persist: agent +
    // permissionMode + additionalDirs only. Skills and notes are session
    // scoped on purpose — a stale persisted skill id could silently rejoin
    // the next chat with no UI signal.
    const stored = JSON.parse(window.localStorage.getItem('quickStartAdvanced') ?? '{}') as Record<string, unknown>
    expect(Object.keys(stored).sort()).toEqual(['additionalDirs', 'agent', 'permissionMode'])
    expect(stored).not.toHaveProperty('selectedSkillIds')
    expect(stored).not.toHaveProperty('selectedNoteIds')
    expect(stored).not.toHaveProperty('skills')
    expect(stored).not.toHaveProperty('notes')
  })

  it('does not downgrade defaultCli="copilot-sdk" to copilot-cli while auth status is still loading', async () => {
    // Reproduces the race PR 1 guarded against: EMPTY_READINESS reports
    // sdk: false during the optimistic window, so the "switch transport if
    // not ready" effect would silently downgrade copilot-sdk → copilot-cli
    // before auth:get-status resolved. The guard waits for authStatus.loaded.
    const { mockInvoke } = setupElectronAPI()
    // Override auth:get-status with a promise that never resolves during the test.
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'auth:get-status') return new Promise(() => {})
      if (channel === 'cli:check-installed') return new Promise(() => {})
      return Promise.resolve(null)
    })
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} defaultCli="copilot-sdk" />)
    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'go' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cli: 'copilot-sdk' }))
  })

  it('switching provider drops skill selections that do not exist for the new provider', async () => {
    // Both providers connected so the user-facing <select> renders (the pill
    // collapse path doesn't expose the same UI for switching).
    setupElectronAPI({
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
      'skills:list': [
        { id: 'cl-only', name: 'Claude Only', description: '', enabled: false, scope: 'project', cli: 'claude' },
        { id: 'shared',  name: 'Shared',      description: '', enabled: false, scope: 'project', cli: 'both' },
        { id: 'co-only', name: 'Copilot Only', description: '', enabled: false, scope: 'project', cli: 'copilot' },
      ],
    })
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} defaultCli="claude-cli" />)

    // Select both visible-for-claude skills.
    fireEvent.click(screen.getByTestId('attachment-chip:skill'))
    const claudePicker = await screen.findByTestId('quick-start-skill-picker')
    fireEvent.click(await within(claudePicker).findByText('Claude Only'))
    fireEvent.click(await within(claudePicker).findByText('Shared'))

    // Flip provider — the claude-only skill must drop from selection.
    fireEvent.change(screen.getByTestId('quick-start-provider'), { target: { value: 'copilot' } })

    // Wait for the async skills:list re-fetch + state purge to settle. The
    // selected-attachment chip row above the input is the visible signal that
    // the purge completed; "Claude Only" must disappear from it before submit.
    await waitFor(() => {
      const refs = screen.queryByTestId('quick-start-refs')
      expect(refs && within(refs).queryByText('Claude Only')).toBeFalsy()
    })

    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'go' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      cli: 'copilot-cli',
      attachedSkills: [{ id: 'shared', name: 'Shared' }],
    }))
  })

  it('falls back to the hardcoded example chips when starter-pack IPC rejects', async () => {
    const { mockInvoke } = setupElectronAPI()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'starter-pack:get-all-prompts') return Promise.reject(new Error('boom'))
      // Defaults for the rest — copy from DEFAULT_IPC_RESPONSES via a no-op return null.
      if (channel === 'auth:get-status') {
        return Promise.resolve(authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }))
      }
      if (channel === 'cli:check-installed') return Promise.resolve({ copilot: true, claude: true })
      return Promise.resolve(null)
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getAllByTestId('quick-start-example-chip')).toHaveLength(3)
    })
  })

  it('clicking an enabled provider option inside the pill popover switches providers', async () => {
    // Both providers ready so both options are enabled.
    setupElectronAPI({
      'auth:get-status': authStatusFixture({ cli: true, sdk: false }, { cli: true, sdk: false }),
    })
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} defaultCli="copilot-cli" />)

    // With 2+ providers ready the surface uses the <select>, not the pill —
    // assert that contract so this test doesn't silently miss the pill path.
    expect(screen.getByTestId('quick-start-provider')).toBeInTheDocument()
    expect(screen.queryByTestId('quick-start-provider-pill')).not.toBeInTheDocument()

    // The pill is the single-provider collapse; the select is the dual path.
    // Either way switching provider via the <select> must flip onSubmit's cli.
    fireEvent.change(screen.getByTestId('quick-start-provider'), { target: { value: 'claude' } })
    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'go' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cli: 'claude-cli' }))
  })

  describe('draft persistence', () => {
    it('persists the typed prompt to localStorage and restores it on remount', async () => {
      const { unmount } = render(<QuickStartCard onSubmit={vi.fn()} />)
      fireEvent.change(screen.getByTestId('quick-start-textarea'), {
        target: { value: 'half-written thought' },
      })
      // Persisted synchronously via the draft effect.
      await waitFor(() => {
        expect(window.localStorage.getItem('quickStartDraft')).toContain('half-written thought')
      })

      // Navigating away unmounts Work + QuickStartCard…
      unmount()
      // …and coming back restores the draft from localStorage.
      render(<QuickStartCard onSubmit={vi.fn()} />)
      expect((screen.getByTestId('quick-start-textarea') as HTMLTextAreaElement).value)
        .toBe('half-written thought')
    })

    it('"Start something new" clears the draft and removes the saved blob', async () => {
      render(<QuickStartCard onSubmit={vi.fn()} />)
      fireEvent.change(screen.getByTestId('quick-start-textarea'), {
        target: { value: 'scrap this' },
      })
      await waitFor(() => {
        expect(window.localStorage.getItem('quickStartDraft')).toContain('scrap this')
      })

      fireEvent.click(screen.getByTestId('quick-start-clear-draft'))
      expect((screen.getByTestId('quick-start-textarea') as HTMLTextAreaElement).value).toBe('')
      await waitFor(() => {
        expect(window.localStorage.getItem('quickStartDraft')).toBeNull()
      })
    })

    it('clears the saved draft after a successful submit', async () => {
      render(<QuickStartCard onSubmit={vi.fn()} defaultCli="copilot-cli" />)
      fireEvent.change(screen.getByTestId('quick-start-textarea'), {
        target: { value: 'send me' },
      })
      await waitFor(() => {
        expect(window.localStorage.getItem('quickStartDraft')).toContain('send me')
      })
      fireEvent.click(screen.getByTestId('quick-start-submit'))
      await waitFor(() => {
        expect(window.localStorage.getItem('quickStartDraft')).toBeNull()
      })
    })
  })
})
