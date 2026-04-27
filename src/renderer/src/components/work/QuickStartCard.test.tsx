// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

import QuickStartCard from './QuickStartCard'

beforeEach(() => {
  window.localStorage.clear()
  setupElectronAPI({
    'cli:check-installed': { copilot: true, claude: true },
    'agent:list': {
      copilot: [
        { id: 'reviewer', name: 'Reviewer', description: 'reviews code', source: 'builtin', cli: 'copilot-cli' },
      ],
      claude: [],
    },
  })
})

describe('QuickStartCard', () => {
  it('renders the textarea, CLI selector, and submit button', () => {
    render(<QuickStartCard onSubmit={vi.fn()} />)
    expect(screen.getByTestId('quick-start-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('quick-start-cli')).toBeInTheDocument()
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

  it('calls onSubmit with the prompt and selected CLI', () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} defaultCli="copilot-cli" />)
    const ta = screen.getByTestId('quick-start-textarea') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith({
      prompt: 'Hello world',
      cli: 'copilot-cli',
      model: undefined,
      agent: undefined,
      permissionMode: undefined,
      additionalDirs: undefined,
    })
  })

  it('switches CLI dropdown selection', () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    const select = screen.getByTestId('quick-start-cli') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'claude-cli' } })
    expect(select.value).toBe('claude-cli')

    const ta = screen.getByTestId('quick-start-textarea') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'Test' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cli: 'claude-cli' }))
  })

  it('disables un-installed CLI options', async () => {
    setupElectronAPI({
      'cli:check-installed': { copilot: true, claude: false },
    })
    render(<QuickStartCard onSubmit={vi.fn()} />)
    await waitFor(() => {
      const opts = screen.getAllByRole('option') as HTMLOptionElement[]
      const claude = opts.find((o) => o.value === 'claude-cli')
      expect(claude?.disabled).toBe(true)
    })
  })

  it('passes optional model when provided', () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'Hi' } })
    fireEvent.change(screen.getByTestId('quick-start-model'), { target: { value: 'sonnet-4.5' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Hi', cli: 'copilot-cli', model: 'sonnet-4.5' }))
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
    await waitFor(() => {
      const agentSelect = screen.getByTestId('quick-start-agent') as HTMLSelectElement
      expect(agentSelect.querySelector('option[value="reviewer"]')).toBeTruthy()
    })
  })

  it('forwards advanced values to onSubmit', async () => {
    const onSubmit = vi.fn()
    render(<QuickStartCard onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))

    await waitFor(() => {
      const agentSelect = screen.getByTestId('quick-start-agent') as HTMLSelectElement
      expect(agentSelect.querySelector('option[value="reviewer"]')).toBeTruthy()
    })
    fireEvent.change(screen.getByTestId('quick-start-agent'), { target: { value: 'reviewer' } })
    fireEvent.change(screen.getByTestId('quick-start-permission-mode'), { target: { value: 'plan' } })
    fireEvent.change(screen.getByTestId('quick-start-additional-dirs'), { target: { value: '/foo, /bar ,, ' } })
    fireEvent.change(screen.getByTestId('quick-start-textarea'), { target: { value: 'do thing' } })
    fireEvent.click(screen.getByTestId('quick-start-submit'))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'do thing',
      agent: 'reviewer',
      permissionMode: 'plan',
      additionalDirs: ['/foo', '/bar'],
    }))
  })

  it('persists advanced values to localStorage and restores them on remount', async () => {
    const { unmount } = render(<QuickStartCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('quick-start-advanced-toggle'))
    await waitFor(() => {
      const agentSelect = screen.getByTestId('quick-start-agent') as HTMLSelectElement
      expect(agentSelect.querySelector('option[value="reviewer"]')).toBeTruthy()
    })
    fireEvent.change(screen.getByTestId('quick-start-agent'), { target: { value: 'reviewer' } })
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
})
