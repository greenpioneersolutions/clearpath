// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

beforeEach(() => {
  setupElectronAPI({
    'auth:get-status': {
      copilot: { cli: { installed: true, authenticated: true }, sdk: { installed: false, authenticated: false } },
      claude:  { cli: { installed: false, authenticated: false }, sdk: { installed: false, authenticated: false } },
    },
    'agent:list': { copilot: [], claude: [] },
    'starter-pack:get-all-prompts': [],
    'app:get-cwd': '/tmp/project',
  })
})

import HomeQuickStartBar from './HomeQuickStartBar'

describe('HomeQuickStartBar', () => {
  it('renders input and send button', async () => {
    const onSubmit = vi.fn()
    render(<HomeQuickStartBar onSubmit={onSubmit} />)
    expect(await screen.findByPlaceholderText(/What do you need help with/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Start session')).toBeInTheDocument()
  })

  it('disables send button when prompt is empty', async () => {
    const onSubmit = vi.fn()
    render(<HomeQuickStartBar onSubmit={onSubmit} />)
    const send = await screen.findByLabelText('Start session')
    expect(send).toBeDisabled()
  })

  it('calls onSubmit with the typed prompt when Enter is pressed', async () => {
    const onSubmit = vi.fn()
    render(<HomeQuickStartBar onSubmit={onSubmit} />)
    const input = await screen.findByPlaceholderText(/What do you need help with/i)
    fireEvent.change(input, { target: { value: 'draft an email' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'draft an email',
      cli: 'copilot-cli',
    }))
  })

  it('seeds the input from initialPrompt', async () => {
    const onSubmit = vi.fn()
    render(<HomeQuickStartBar onSubmit={onSubmit} initialPrompt="prefilled value" />)
    const input = await screen.findByPlaceholderText(/What do you need help with/i) as HTMLInputElement
    expect(input.value).toBe('prefilled value')
  })

  it('renders starter prompt suggestions and fills input when clicked', async () => {
    setupElectronAPI({
      'auth:get-status': {
        copilot: { cli: { installed: true, authenticated: true }, sdk: { installed: false, authenticated: false } },
        claude:  { cli: { installed: false, authenticated: false }, sdk: { installed: false, authenticated: false } },
      },
      'agent:list': { copilot: [], claude: [] },
      'app:get-cwd': '/tmp/project',
      'starter-pack:get-all-prompts': [
        { id: 'p1', displayText: 'Pick me first', targetAgentId: 'a1', category: 'spotlight', displayOrder: 1, followUpQuestions: [] },
        { id: 'p2', displayText: 'And me', targetAgentId: 'a2', category: 'spotlight', displayOrder: 2, followUpQuestions: [] },
        { id: 'p3', displayText: 'Me too', targetAgentId: 'a3', category: 'spotlight', displayOrder: 3, followUpQuestions: [] },
        { id: 'p4', displayText: 'Default-tier, not shown as a chip', targetAgentId: 'a4', category: 'default', displayOrder: 4, followUpQuestions: [] },
      ],
    })
    const onSubmit = vi.fn()
    render(<HomeQuickStartBar onSubmit={onSubmit} />)
    const first = await screen.findByText('Pick me first')
    expect(first).toBeInTheDocument()
    expect(screen.queryByText('Default-tier, not shown as a chip')).not.toBeInTheDocument()
    fireEvent.click(first)
    const input = screen.getByPlaceholderText(/What do you need help with/i) as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('Pick me first'))
  })

  it('opens the options popover when the pill button is clicked', async () => {
    const onSubmit = vi.fn()
    render(<HomeQuickStartBar onSubmit={onSubmit} />)
    const pill = await screen.findByLabelText('Session options')
    fireEvent.click(pill)
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /session options/i })).toBeInTheDocument()
    })
  })

  it('submits via the send button (not just Enter)', async () => {
    const onSubmit = vi.fn()
    render(<HomeQuickStartBar onSubmit={onSubmit} />)
    const input = await screen.findByPlaceholderText(/What do you need help with/i)
    fireEvent.change(input, { target: { value: 'click submit' } })
    fireEvent.click(screen.getByLabelText('Start session'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'click submit' }))
  })

  it('carries the model picked from the popover through to onSubmit', async () => {
    const onSubmit = vi.fn()
    render(<HomeQuickStartBar onSubmit={onSubmit} />)
    fireEvent.click(await screen.findByLabelText('Session options'))
    const modelSelect = await screen.findByLabelText('Model') as HTMLSelectElement
    fireEvent.change(modelSelect, { target: { value: 'gpt-4o' } })
    const input = screen.getByPlaceholderText(/What do you need help with/i)
    fireEvent.change(input, { target: { value: 'with a specific model' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'with a specific model',
      model: 'gpt-4o',
    }))
  })

  it('clears a stale agent selection when the backend switches providers', async () => {
    setupElectronAPI({
      'auth:get-status': {
        copilot: { cli: { installed: true, authenticated: true }, sdk: { installed: false, authenticated: false } },
        claude:  { cli: { installed: true, authenticated: true }, sdk: { installed: false, authenticated: false } },
      },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
      'agent:list': {
        copilot: [{ id: 'cop-only', name: 'CopOnly', description: '', source: 'file', cli: 'copilot-cli' }],
        claude:  [{ id: 'cl-only',  name: 'ClOnly',  description: '', source: 'file', cli: 'claude-cli'  }],
      },
    })
    const onSubmit = vi.fn()
    render(<HomeQuickStartBar onSubmit={onSubmit} />)

    fireEvent.click(await screen.findByLabelText('Session options'))
    // Pick a copilot agent first.
    const agentSelect = await screen.findByLabelText('Agent') as HTMLSelectElement
    await waitFor(() => expect(agentSelect.options.length).toBeGreaterThan(1))
    fireEvent.change(agentSelect, { target: { value: 'cop-only' } })

    // Switch backend to claude-cli — the copilot agent must drop after the
    // async agent:list refetch lands.
    const backendSelect = screen.getByLabelText('Backend') as HTMLSelectElement
    fireEvent.change(backendSelect, { target: { value: 'claude-cli' } })
    // Wait for the agent dropdown to reflect the new provider's agents.
    await waitFor(() => {
      const opts = Array.from((screen.getByLabelText('Agent') as HTMLSelectElement).options).map((o) => o.value)
      expect(opts).toContain('cl-only')
      expect(opts).not.toContain('cop-only')
    })

    const input = screen.getByPlaceholderText(/What do you need help with/i)
    fireEvent.change(input, { target: { value: 'submit after switch' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // The submitted agent should NOT be the stale copilot id.
    const call = onSubmit.mock.calls[onSubmit.mock.calls.length - 1][0]
    expect(call.cli).toBe('claude-cli')
    expect(call.agent).not.toBe('cop-only')
  })

  it('updates the pill label and submitted cli when the backend is switched (both ready)', async () => {
    setupElectronAPI({
      'auth:get-status': {
        copilot: { cli: { installed: true, authenticated: true }, sdk: { installed: false, authenticated: false } },
        claude:  { cli: { installed: true, authenticated: true }, sdk: { installed: false, authenticated: false } },
      },
      'agent:list': { copilot: [], claude: [] },
      'starter-pack:get-all-prompts': [],
      'app:get-cwd': '/tmp/project',
    })
    const onSubmit = vi.fn()
    render(<HomeQuickStartBar onSubmit={onSubmit} />)
    // Default backend is copilot-cli — pill should reflect that.
    const pill = await screen.findByLabelText('Session options')
    await waitFor(() => expect(pill.textContent).toMatch(/Copilot/))

    fireEvent.click(pill)
    const backendSelect = await screen.findByLabelText('Backend') as HTMLSelectElement
    fireEvent.change(backendSelect, { target: { value: 'claude-cli' } })

    // Pill text now reflects the new backend.
    await waitFor(() => expect(pill.textContent).toMatch(/Claude/))

    const input = screen.getByPlaceholderText(/What do you need help with/i)
    fireEvent.change(input, { target: { value: 'route me to claude' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'route me to claude',
      cli: 'claude-cli',
    }))
  })
})
