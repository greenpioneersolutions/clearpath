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
    'notes:list': [],
    'agent:list': { copilot: [], claude: [] },
    'app:get-cwd': '/tmp/project',
    'skills:list': [],
  })
})

import HomeHub from './HomeHub'

// Helper that renders HomeHub inside a router and captures location changes
function LocationCapture({ onLocation }: { onLocation: (path: string) => void }) {
  const location = useLocation()
  onLocation(location.pathname + location.search)
  return null
}

function renderHub(overrides?: Record<string, unknown>, initialPath = '/') {
  if (overrides) setupElectronAPI(overrides)
  const locations: string[] = [initialPath]
  const result = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <HomeHub />
      <Routes>
        <Route path="*" element={<LocationCapture onLocation={(p) => { locations.push(p) }} />} />
      </Routes>
    </MemoryRouter>,
  )
  return { ...result, locations }
}

describe('HomeHub', () => {
  it('renders greeting', async () => {
    renderHub()
    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeInTheDocument()
    })
  })

  it('renders quick prompt input', async () => {
    renderHub()
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/What do you need help with/i)).toBeInTheDocument()
    })
  })

  it('calls IPC channels on mount', () => {
    const api = setupElectronAPI({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    renderHub()
    expect(api.mockInvoke).toHaveBeenCalledWith('cli:get-persisted-sessions')
    expect(api.mockInvoke).toHaveBeenCalledWith('setup-wizard:is-complete')
  })

  it('calls skills:list with cwd from app:get-cwd', async () => {
    const api = setupElectronAPI({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    renderHub()
    await waitFor(() => {
      expect(api.mockInvoke).toHaveBeenCalledWith('app:get-cwd')
      expect(api.mockInvoke).toHaveBeenCalledWith('skills:list', { workingDirectory: '/tmp/project' })
    })
  })

  it('renders action cards', async () => {
    renderHub()
    await waitFor(() => {
      expect(screen.getByText('Ask a question or get guidance')).toBeInTheDocument()
      expect(screen.getByText('Write or do something')).toBeInTheDocument()
      expect(screen.getByText('Explore what I can do')).toBeInTheDocument()
      expect(screen.getByText('Customize my setup')).toBeInTheDocument()
    })
  })

  it('navigates to /work?tab=wizard when "Ask a question" card is clicked', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByText('Ask a question or get guidance'))
    fireEvent.click(screen.getByText('Ask a question or get guidance'))
    await waitFor(() => {
      expect(locations).toContain('/work?tab=wizard&wizardOption=question')
    })
  })

  it('navigates to /work?tab=wizard&wizardStep=context when "Write or do something" card is clicked', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByText('Write or do something'))
    fireEvent.click(screen.getByText('Write or do something'))
    await waitFor(() => {
      expect(locations).toContain('/work?tab=wizard&wizardStep=context')
    })
  })

  it('navigates to /learn when "Explore what I can do" card is clicked', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByText('Explore what I can do'))
    fireEvent.click(screen.getByText('Explore what I can do'))
    await waitFor(() => {
      expect(locations).toContain('/learn')
    })
  })

  it('navigates to /configure when setup is complete and customize card is clicked', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByText('Customize my setup'))
    fireEvent.click(screen.getByText('Customize my setup'))
    await waitFor(() => {
      expect(locations).toContain('/configure')
    })
  })

  it('navigates to /configure?tab=setup when setup is NOT complete and card is clicked', async () => {
    const { locations } = renderHub({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: false },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => screen.getByText('Set up my workspace'))
    fireEvent.click(screen.getByText('Set up my workspace'))
    await waitFor(() => {
      expect(locations).toContain('/configure?tab=setup')
    })
  })

  it('shows "Recommended" badge when setup is not complete', async () => {
    renderHub({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: false },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => {
      expect(screen.getByText('Recommended')).toBeInTheDocument()
    })
  })

  it('shows context nudge section when no memories/agents/skills exist', async () => {
    renderHub()
    await waitFor(() => {
      expect(screen.getByText('Make the AI work smarter for you')).toBeInTheDocument()
      expect(screen.getByText('Add a memory')).toBeInTheDocument()
      expect(screen.getByText('Create an agent')).toBeInTheDocument()
      expect(screen.getByText('Build a skill')).toBeInTheDocument()
    })
  })

  it('navigates to /configure?tab=memory when "Add a memory" nudge is clicked', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByText('Add a memory'))
    fireEvent.click(screen.getByText('Add a memory'))
    await waitFor(() => {
      expect(locations).toContain('/configure?tab=memory')
    })
  })

  it('navigates to /configure?tab=agents when "Create an agent" nudge is clicked', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByText('Create an agent'))
    fireEvent.click(screen.getByText('Create an agent'))
    await waitFor(() => {
      expect(locations).toContain('/configure?tab=agents')
    })
  })

  it('navigates to /configure?tab=skills when "Build a skill" nudge is clicked', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByText('Build a skill'))
    fireEvent.click(screen.getByText('Build a skill'))
    await waitFor(() => {
      expect(locations).toContain('/configure?tab=skills')
    })
  })

  it('hides context nudge when context exists', async () => {
    renderHub({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [{ id: 'n1', content: 'a note' }],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => {
      expect(screen.queryByText('Make the AI work smarter for you')).not.toBeInTheDocument()
    })
  })

  it('shows context counts in "Write or do something" description when context exists', async () => {
    renderHub({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [{ id: 'n1' }, { id: 'n2' }],
      'agent:list': { copilot: [{ id: 'a1' }], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [{ id: 's1' }],
    })
    await waitFor(() => {
      expect(screen.getByText(/2 memories/)).toBeInTheDocument()
    })
  })

  it('shows recent sessions when sessions exist', async () => {
    renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'My Session', startedAt: Date.now() - 60000, endedAt: Date.now() },
      ],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => {
      expect(screen.getByText('My Session')).toBeInTheDocument()
      expect(screen.getByText('Pick up where you left off')).toBeInTheDocument()
    })
  })

  it('clicking recent session navigates to /work with sessionId state', async () => {
    const { locations } = renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 'sess-abc', cli: 'copilot', name: 'Resume Me', startedAt: Date.now() - 120000 },
      ],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => screen.getByText('Resume Me'))
    fireEvent.click(screen.getByText('Resume Me'))
    await waitFor(() => {
      expect(locations).toContain('/work')
    })
  })

  it('"All sessions" link navigates to /work', async () => {
    const { locations } = renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'Session', startedAt: Date.now() - 60000 },
      ],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => screen.getByText('All sessions'))
    fireEvent.click(screen.getByText('All sessions'))
    await waitFor(() => {
      expect(locations).toContain('/work')
    })
  })

  it('shows "Untitled" for sessions with no name', async () => {
    renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's2', cli: 'claude', startedAt: Date.now() - 3600000 * 2 },
      ],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => {
      expect(screen.getByText('Untitled')).toBeInTheDocument()
    })
  })

  it('navigates to /work with quickPrompt state when prompt entered and Enter pressed', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByPlaceholderText(/What do you need help with/i))
    const input = screen.getByPlaceholderText(/What do you need help with/i)
    fireEvent.change(input, { target: { value: 'help me write an email' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(locations).toContain('/work')
    })
  })

  it('does not navigate when Enter pressed with empty prompt', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByPlaceholderText(/What do you need help with/i))
    const input = screen.getByPlaceholderText(/What do you need help with/i)
    fireEvent.keyDown(input, { key: 'Enter' })
    // location should remain at / — no navigation to /work
    expect(locations.filter(l => l === '/work').length).toBe(0)
  })

  it('clicking the arrow button with prompt navigates to /work', async () => {
    const { locations } = renderHub()
    await waitFor(() => screen.getByPlaceholderText(/What do you need help with/i))
    const input = screen.getByPlaceholderText(/What do you need help with/i)
    fireEvent.change(input, { target: { value: 'draft an email' } })
    fireEvent.click(screen.getByLabelText('Start session'))
    await waitFor(() => {
      expect(locations).toContain('/work')
    })
  })

  it('gracefully handles skills:list error without crashing', async () => {
    const api = setupElectronAPI({
      'cli:get-persisted-sessions': [],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    api.mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'skills:list') return Promise.reject(new Error('not found'))
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve([])
      if (channel === 'setup-wizard:is-complete') return Promise.resolve({ complete: true })
      if (channel === 'notes:list') return Promise.resolve([])
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'app:get-cwd') return Promise.resolve('/tmp/project')
      return Promise.resolve(null)
    })
    renderHub()
    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeInTheDocument()
    })
  })

  it('shows timeAgo as "Just now" for very recent sessions', async () => {
    renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'Fresh', startedAt: Date.now() - 30000 },
      ],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => {
      expect(screen.getByText('Just now')).toBeInTheDocument()
    })
  })

  it('shows timeAgo in hours for sessions a few hours old', async () => {
    renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'Old Session', startedAt: Date.now() - 3600000 * 3 },
      ],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => {
      expect(screen.getByText('3h ago')).toBeInTheDocument()
    })
  })

  it('shows timeAgo in days for sessions more than a day old', async () => {
    renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'Last Week', startedAt: Date.now() - 3600000 * 48 },
      ],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => {
      expect(screen.getByText('2d ago')).toBeInTheDocument()
    })
  })

  it('shows timeAgo in minutes for sessions less than an hour old', async () => {
    renderHub({
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'Recent', startedAt: Date.now() - 60000 * 30 },
      ],
      'setup-wizard:is-complete': { complete: true },
      'notes:list': [],
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'skills:list': [],
    })
    await waitFor(() => {
      expect(screen.getByText('30m ago')).toBeInTheDocument()
    })
  })
})
