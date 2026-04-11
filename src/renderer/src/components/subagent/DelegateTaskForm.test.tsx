// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import DelegateTaskForm from './DelegateTaskForm'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

describe('DelegateTaskForm', () => {
  const onSpawned = vi.fn()

  beforeEach(() => {
    onSpawned.mockReset()
  })

  it('renders heading and form fields', () => {
    render(<DelegateTaskForm onSpawned={onSpawned} />)
    // Heading is an h3
    expect(screen.getByRole('heading', { name: 'Delegate Task' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Describe the task...')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Fix auth bug')).toBeInTheDocument()
  })

  it('renders CLI backend selector with copilot selected by default', () => {
    render(<DelegateTaskForm onSpawned={onSpawned} />)
    expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('disables Delegate Task button when prompt is empty', () => {
    render(<DelegateTaskForm onSpawned={onSpawned} />)
    const btn = screen.getByRole('button', { name: 'Delegate Task' })
    expect(btn).toBeDisabled()
  })

  it('shows error when submitting with empty prompt', async () => {
    render(<DelegateTaskForm onSpawned={onSpawned} />)
    // Type whitespace only — button should remain disabled
    const textarea = screen.getByPlaceholderText('Describe the task...')
    fireEvent.change(textarea, { target: { value: '  ' } })
    expect(screen.getByRole('button', { name: 'Delegate Task' })).toBeDisabled()
  })

  it('calls subagent:spawn and onSpawned on successful submit', async () => {
    const spawnedInfo = {
      id: 'sub-1', name: 'Test task', cli: 'copilot', status: 'running',
      prompt: 'Do something', startedAt: Date.now(),
    }
    mockInvoke.mockResolvedValue(spawnedInfo)

    render(<DelegateTaskForm onSpawned={onSpawned} />)

    fireEvent.change(screen.getByPlaceholderText('Describe the task...'), {
      target: { value: 'Refactor the login module' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delegate Task' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('subagent:spawn', expect.objectContaining({
        cli: 'copilot',
        prompt: 'Refactor the login module',
      }))
      expect(onSpawned).toHaveBeenCalledWith(spawnedInfo)
    })
  })

  it('shows error message when spawn fails', async () => {
    mockInvoke.mockRejectedValue(new Error('Spawn failed'))

    render(<DelegateTaskForm onSpawned={onSpawned} />)

    fireEvent.change(screen.getByPlaceholderText('Describe the task...'), {
      target: { value: 'A task' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delegate Task' }))

    await waitFor(() => {
      expect(screen.getByText(/Spawn failed/)).toBeInTheDocument()
    })
  })

  it('switches CLI backend when clicked', () => {
    render(<DelegateTaskForm onSpawned={onSpawned} />)
    const claudeBtn = screen.getByText('Claude Code')
    fireEvent.click(claudeBtn)
    // Claude button should now be selected (bg-indigo-600)
    expect(claudeBtn.className).toContain('bg-indigo-600')
  })

  it('renders model selector with defaults', () => {
    render(<DelegateTaskForm onSpawned={onSpawned} />)
    // Both model and permission mode selects show "Default" as display value
    const selects = screen.getAllByDisplayValue('Default')
    expect(selects.length).toBe(2)
  })

  it('renders permission mode selector', () => {
    render(<DelegateTaskForm onSpawned={onSpawned} />)
    // Permission mode options include Plan, Accept Edits, Auto, YOLO
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText('Accept Edits')).toBeInTheDocument()
    expect(screen.getByText('YOLO / Bypass')).toBeInTheDocument()
  })
})
