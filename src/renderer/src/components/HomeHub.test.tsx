// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

vi.mock('../contexts/BrandingContext', () => ({
  useBranding: () => ({
    brand: {
      appName: 'ClearPathAI',
      logoPath: '',
      colorPrimary: '#5B4FC4',
      colorSecondary: '#7F77DD',
      colorAccent: '#1D9E75',
      colorAccentLight: '#5DCAA5',
      colorButtonPrimary: '#4F46E5',
    },
  }),
}))

beforeEach(() => {
  setupElectronAPI({
    'cli:get-persisted-sessions': [],
    'setup-wizard:is-complete': { complete: true },
    'agent:list': { copilot: [], claude: [] },
    'starter-pack:get-all-prompts': [],
    'app:get-cwd': '/tmp/project',
  })
})

import HomeHub from './HomeHub'

function LocationCapture({ onLocation }: { onLocation: (path: string, state: unknown) => void }) {
  const location = useLocation()
  onLocation(location.pathname + location.search, location.state)
  return null
}

function renderHub(overrides?: Record<string, unknown>, initialPath = '/') {
  if (overrides) setupElectronAPI(overrides)
  const locations: Array<{ path: string; state: unknown }> = [{ path: initialPath, state: null }]
  const result = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <HomeHub />
      <Routes>
        <Route path="*" element={<LocationCapture onLocation={(p, s) => { locations.push({ path: p, state: s }) }} />} />
      </Routes>
    </MemoryRouter>,
  )
  return { ...result, locations }
}

describe('HomeHub — Mode B (setup complete)', () => {
  it('renders the greeting', async () => {
    renderHub()
    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeInTheDocument()
    })
  })

  it('renders the quick prompt input', async () => {
    renderHub()
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/What do you need help with/i)).toBeInTheDocument()
    })
  })

  it('renders the three CTA cards', async () => {
    renderHub()
    await waitFor(() => {
      expect(screen.getByText('Try an example')).toBeInTheDocument()
      expect(screen.getByText('Browse what I can do')).toBeInTheDocument()
      expect(screen.getByText('Customize my setup')).toBeInTheDocument()
    })
  })

  it('does NOT render the legacy wizard cards or context-nudge block', async () => {
    renderHub()
    await waitFor(() => screen.getByText('Try an example'))
    expect(screen.queryByText('Ask a question or get guidance')).not.toBeInTheDocument()
    expect(screen.queryByText('Write or do something')).not.toBeInTheDocument()
    expect(screen.queryByText('Make the AI work smarter for you')).not.toBeInTheDocument()
  })

  it('navigates to /learn when "Browse what I can do" is clicked', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByText('Browse what I can do'))
    fireEvent.click(screen.getByText('Browse what I can do'))
    await waitFor(() => {
      expect(locations.some((l) => l.path === '/learn')).toBe(true)
    })
  })

  it('navigates to /configure when "Customize my setup" is clicked', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByText('Customize my setup'))
    fireEvent.click(screen.getByText('Customize my setup'))
    await waitFor(() => {
      expect(locations.some((l) => l.path === '/configure')).toBe(true)
    })
  })

  it('opens the Try-an-example modal when the hero card is clicked', async () => {
    renderHub()
    await waitFor(() => screen.getByText('Try an example'))
    fireEvent.click(screen.getByText('Try an example'))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /try an example/i })).toBeInTheDocument()
    })
  })

  it('navigates to /work with quickPrompt state when Enter pressed with prompt', async () => {
    const { locations } = renderHub()
    const input = await screen.findByPlaceholderText(/What do you need help with/i)
    fireEvent.change(input, { target: { value: 'help me write an email' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      const workNav = locations.find((l) => l.path === '/work')
      expect(workNav).toBeDefined()
      const state = workNav!.state as { quickPrompt?: string }
      expect(state?.quickPrompt).toBe('help me write an email')
    })
  })

  it('does not navigate when Enter pressed with empty prompt', async () => {
    const { locations } = renderHub()
    const input = await screen.findByPlaceholderText(/What do you need help with/i)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(locations.filter((l) => l.path === '/work').length).toBe(0)
  })

  it('shows recent sessions when they exist', async () => {
    renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'My Session', startedAt: Date.now() - 60000, endedAt: Date.now() },
      ],
      'setup-wizard:is-complete': { complete: true },
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    await waitFor(() => {
      expect(screen.getByText('My Session')).toBeInTheDocument()
      expect(screen.getByText('Pick up where you left off')).toBeInTheDocument()
    })
  })

  it('picking an example in the modal fills the home input', async () => {
    setupElectronAPI({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: true },
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'starter-pack:get-all-prompts': [
        { id: 'p1', displayText: 'Help me prep a status update', targetAgentId: 'agent-x', category: 'spotlight', displayOrder: 1, followUpQuestions: [] },
      ],
    })
    renderHub()
    await waitFor(() => screen.getByText('Try an example'))
    fireEvent.click(screen.getByText('Try an example'))
    const useBtn = await screen.findByText('Use this prompt →')
    fireEvent.click(useBtn)
    const input = await screen.findByPlaceholderText(/What do you need help with/i) as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('Help me prep a status update'))
  })

  it('shows at most 3 recent sessions, sorted by startedAt descending', async () => {
    const now = Date.now()
    renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'Oldest', startedAt: now - 5 * 3600000 },
        { sessionId: 's2', cli: 'copilot', name: 'Middle-1', startedAt: now - 2 * 3600000 },
        { sessionId: 's3', cli: 'copilot', name: 'Newest', startedAt: now - 60000 },
        { sessionId: 's4', cli: 'copilot', name: 'Middle-2', startedAt: now - 3 * 3600000 },
        { sessionId: 's5', cli: 'copilot', name: 'Stale', startedAt: now - 8 * 3600000 },
      ],
      'setup-wizard:is-complete': { complete: true },
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    await waitFor(() => screen.getByText('Newest'))
    expect(screen.getByText('Newest')).toBeInTheDocument()
    expect(screen.getByText('Middle-1')).toBeInTheDocument()
    expect(screen.getByText('Middle-2')).toBeInTheDocument()
    expect(screen.queryByText('Oldest')).not.toBeInTheDocument()
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
  })

  it('renders "Untitled" for recent sessions with no name', async () => {
    renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's-n', cli: 'claude', startedAt: Date.now() - 3600000 },
      ],
      'setup-wizard:is-complete': { complete: true },
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    await waitFor(() => {
      expect(screen.getByText('Untitled')).toBeInTheDocument()
    })
  })

  it('"All sessions" link navigates to /work', async () => {
    const { locations } = renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'Session', startedAt: Date.now() - 60000 },
      ],
      'setup-wizard:is-complete': { complete: true },
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    await waitFor(() => screen.getByText('All sessions'))
    fireEvent.click(screen.getByText('All sessions'))
    await waitFor(() => {
      expect(locations.some((l) => l.path === '/work')).toBe(true)
    })
  })
})

describe('HomeHub — full handoff', () => {
  it('threads popover-picked model into the /work navigation state', async () => {
    setupElectronAPI({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: true },
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
      'auth:get-status': {
        copilot: { cli: { installed: true, authenticated: true }, sdk: { installed: false, authenticated: false } },
        claude:  { cli: { installed: false, authenticated: false }, sdk: { installed: false, authenticated: false } },
      },
    })
    const { locations } = renderHub()
    fireEvent.click(await screen.findByLabelText('Session options'))
    const modelSelect = await screen.findByLabelText('Model') as HTMLSelectElement
    fireEvent.change(modelSelect, { target: { value: 'gpt-4o' } })
    const input = screen.getByPlaceholderText(/What do you need help with/i)
    fireEvent.change(input, { target: { value: 'route me with a model' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      const work = locations.find((l) => l.path === '/work')
      expect(work).toBeDefined()
      const state = work!.state as { quickPrompt?: string; quickPromptCli?: string; quickPromptModel?: string }
      expect(state.quickPrompt).toBe('route me with a model')
      expect(state.quickPromptCli).toBe('copilot-cli')
      expect(state.quickPromptModel).toBe('gpt-4o')
    })
  })
})

describe('HomeHub — setup nudge (incomplete setup, non-blocking)', () => {
  it('renders the setup nudge ALONGSIDE the full home — never as a gate', async () => {
    renderHub({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: false },
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    // The nudge shows up...
    await waitFor(() => {
      expect(screen.getByTestId('home-setup-nudge')).toBeInTheDocument()
    })
    expect(screen.getByText("Let's get you set up")).toBeInTheDocument()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    // ...and the full home surface renders alongside it. Users are NOT gated.
    expect(screen.getByPlaceholderText(/What do you need help with/i)).toBeInTheDocument()
    expect(screen.getByText('Try an example')).toBeInTheDocument()
    expect(screen.getByText('Browse what I can do')).toBeInTheDocument()
    expect(screen.getByText('Customize my setup')).toBeInTheDocument()
  })

  it('clicking the setup nudge navigates to /configure?tab=setup', async () => {
    const { locations } = renderHub({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: false },
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    const nudge = await screen.findByTestId('home-setup-nudge')
    fireEvent.click(nudge)
    await waitFor(() => {
      expect(locations.some((l) => l.path === '/configure?tab=setup')).toBe(true)
    })
  })

  it('does NOT render the setup nudge when setup is complete', async () => {
    renderHub({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: true },
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    // Wait for the input so we know the probe has settled.
    await screen.findByPlaceholderText(/What do you need help with/i)
    expect(screen.queryByTestId('home-setup-nudge')).not.toBeInTheDocument()
  })

  it('preserves a typed prompt when the example modal is dismissed without picking', async () => {
    renderHub({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: true },
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    const input = await screen.findByPlaceholderText(/What do you need help with/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'work in progress' } })
    fireEvent.click(screen.getByText('Try an example'))
    await waitFor(() => screen.getByRole('dialog', { name: /try an example/i }))
    // Close without picking
    fireEvent.keyDown(document, { key: 'Escape' })
    // Input value must still be the user's typed text — no remount fired.
    await waitFor(() => expect(input.value).toBe('work in progress'))
  })

  it('renders the full home surface immediately while the setup probe is in-flight (no gate)', async () => {
    // Hold the setup-wizard probe forever so setupComplete stays null. The
    // home must NOT block on this — the input and core cards must render
    // immediately even before the probe resolves.
    const api = setupElectronAPI({
      'cli:get-persisted-sessions': [],
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    api.mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:is-complete') return new Promise(() => { /* never resolves */ })
      return Promise.resolve(null)
    })
    render(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>,
    )
    // The input renders even with the probe pending — proves no gate.
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/What do you need help with/i)).toBeInTheDocument()
    })
    // The nudge must NOT flash before the probe settles — otherwise returning
    // users would see it for a frame on every cold load.
    expect(screen.queryByTestId('home-setup-nudge')).not.toBeInTheDocument()
  })

  it('renders the full home with no nudge when the setup probe rejects', async () => {
    // If the probe errors, we can't know the setup state — fall through to a
    // clean home. Showing a nudge based on guesswork would be worse than
    // showing nothing.
    const api = setupElectronAPI({
      'cli:get-persisted-sessions': [],
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    api.mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'setup-wizard:is-complete') return Promise.reject(new Error('boom'))
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve([])
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'starter-pack:get-all-prompts') return Promise.resolve([])
      if (channel === 'app:get-cwd') return Promise.resolve('/tmp/project')
      return Promise.resolve(null)
    })
    render(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/What do you need help with/i)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('home-setup-nudge')).not.toBeInTheDocument()
  })
})
