// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

const SAMPLE_PROMPTS = [
  { id: 'p1', displayText: 'Recommended spotlight prompt', targetAgentId: 'agent-x', category: 'spotlight' as const, displayOrder: 1, followUpQuestions: [] },
  { id: 'p2', displayText: 'Another default prompt', targetAgentId: 'agent-y', category: 'default' as const, displayOrder: 2, followUpQuestions: [] },
]

beforeEach(() => {
  setupElectronAPI({
    'starter-pack:get-all-prompts': SAMPLE_PROMPTS,
  })
})

import TryAnExampleModal from './TryAnExampleModal'

describe('TryAnExampleModal', () => {
  it('returns nothing when closed', () => {
    const { container } = render(<TryAnExampleModal isOpen={false} onClose={vi.fn()} onPick={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders all prompts grouped by category when open', async () => {
    render(<TryAnExampleModal isOpen={true} onClose={vi.fn()} onPick={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Recommended spotlight prompt')).toBeInTheDocument()
      expect(screen.getByText('Another default prompt')).toBeInTheDocument()
    })
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
  })

  it('calls onPick with the prompt text and then onClose when "Use this prompt" is clicked', async () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<TryAnExampleModal isOpen={true} onClose={onClose} onPick={onPick} />)
    await waitFor(() => screen.getByText('Recommended spotlight prompt'))
    const buttons = screen.getAllByText('Use this prompt →')
    fireEvent.click(buttons[0])
    expect(onPick).toHaveBeenCalledWith('Recommended spotlight prompt')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<TryAnExampleModal isOpen={true} onClose={onClose} onPick={vi.fn()} />)
    await waitFor(() => screen.getByText('Recommended spotlight prompt'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<TryAnExampleModal isOpen={true} onClose={onClose} onPick={vi.fn()} />)
    const dialog = await screen.findByRole('dialog', { name: /try an example/i })
    // The backdrop is the dialog's parent (the fixed inset-0 div).
    const backdrop = dialog.parentElement as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('renders the agent attribution label for each prompt', async () => {
    render(<TryAnExampleModal isOpen={true} onClose={vi.fn()} onPick={vi.fn()} />)
    await waitFor(() => screen.getByText('Recommended spotlight prompt'))
    expect(screen.getByText('via agent-x')).toBeInTheDocument()
    expect(screen.getByText('via agent-y')).toBeInTheDocument()
  })

  it('closes when the X icon button is clicked', async () => {
    const onClose = vi.fn()
    render(<TryAnExampleModal isOpen={true} onClose={onClose} onPick={vi.fn()} />)
    await waitFor(() => screen.getByText('Recommended spotlight prompt'))
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('excludes launchpad-spotlight prompts (those belong to the Sessions launchpad chips)', async () => {
    setupElectronAPI({
      'starter-pack:get-all-prompts': [
        { id: 'p-keep', displayText: 'Keep me', targetAgentId: 'a-keep', category: 'spotlight' as const, displayOrder: 1, followUpQuestions: [] },
        { id: 'p-drop', displayText: 'Drop me — I am a launchpad chip', targetAgentId: 'a-drop', category: 'launchpad-spotlight', displayOrder: 2, followUpQuestions: [] },
      ],
    })
    render(<TryAnExampleModal isOpen={true} onClose={vi.fn()} onPick={vi.fn()} />)
    await waitFor(() => screen.getByText('Keep me'))
    expect(screen.queryByText(/Drop me/)).not.toBeInTheDocument()
  })

  it('picks the correct prompt when a non-first "Use this prompt" button is clicked', async () => {
    const onPick = vi.fn()
    render(<TryAnExampleModal isOpen={true} onClose={vi.fn()} onPick={onPick} />)
    await waitFor(() => screen.getByText('Another default prompt'))
    const buttons = screen.getAllByText('Use this prompt →')
    // Two prompts in SAMPLE_PROMPTS — click the second one and assert that's
    // what was picked (regression for index/scope bugs in the .map handler).
    fireEvent.click(buttons[1])
    expect(onPick).toHaveBeenCalledWith('Another default prompt')
  })

  it('does not refetch prompts when reopened after being closed', async () => {
    const api = setupElectronAPI({
      'starter-pack:get-all-prompts': SAMPLE_PROMPTS,
    })
    const { rerender } = render(<TryAnExampleModal isOpen={true} onClose={vi.fn()} onPick={vi.fn()} />)
    await waitFor(() => screen.getByText('Recommended spotlight prompt'))
    const callsAfterFirstOpen = api.mockInvoke.mock.calls.filter((c) => c[0] === 'starter-pack:get-all-prompts').length
    expect(callsAfterFirstOpen).toBe(1)

    rerender(<TryAnExampleModal isOpen={false} onClose={vi.fn()} onPick={vi.fn()} />)
    rerender(<TryAnExampleModal isOpen={true} onClose={vi.fn()} onPick={vi.fn()} />)
    // The `loaded` flag guards the fetch — count must remain at 1.
    const callsAfterReopen = api.mockInvoke.mock.calls.filter((c) => c[0] === 'starter-pack:get-all-prompts').length
    expect(callsAfterReopen).toBe(1)
  })

  it('shows an empty-state message when no prompts are available', async () => {
    setupElectronAPI({
      'starter-pack:get-all-prompts': [],
    })
    render(<TryAnExampleModal isOpen={true} onClose={vi.fn()} onPick={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/No examples available/i)).toBeInTheDocument()
    })
  })
})
