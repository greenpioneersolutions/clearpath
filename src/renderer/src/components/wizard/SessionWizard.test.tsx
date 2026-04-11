// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import SessionWizard from './SessionWizard'

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

const sampleConfig = {
  title: 'What would you like to do?',
  subtitle: 'Choose a starting point',
  initialQuestion: 'Pick an option',
  options: [
    {
      id: 'question',
      label: 'Ask a Question',
      description: 'Quick Q&A',
      icon: '❓',
      fields: [
        { id: 'q1', label: 'Your question', placeholder: 'Type here...', type: 'textarea' as const, required: true },
      ],
      promptTemplate: '{{q1}}',
    },
    {
      id: 'task',
      label: 'Do a Task',
      description: 'Get work done',
      icon: '🔧',
      fields: [
        { id: 't1', label: 'Describe the task', placeholder: 'What needs to be done...', type: 'textarea' as const, required: true },
      ],
      promptTemplate: '{{t1}}',
    },
  ],
}

describe('SessionWizard', () => {
  const onLaunchSession = vi.fn()

  beforeEach(() => {
    onLaunchSession.mockReset()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'wizard:get-config') return Promise.resolve(sampleConfig)
      if (channel === 'wizard:get-context-settings') return Promise.resolve({
        showUseContext: true, showMemories: true, showAgents: true, showSkills: true,
      })
      if (channel === 'notes:list') return Promise.resolve([])
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'skill:list') return Promise.resolve([])
      if (channel === 'starter-pack:list-agents') return Promise.resolve([])
      return Promise.resolve(null)
    })
  })

  it('shows loading state initially then renders wizard options', async () => {
    render(<SessionWizard onLaunchSession={onLaunchSession} defaultCli="copilot" />)

    await waitFor(() => {
      expect(screen.getByText('Ask a Question')).toBeInTheDocument()
    })
    expect(screen.getByText('Do a Task')).toBeInTheDocument()
  })

  it('fetches wizard config on mount', async () => {
    render(<SessionWizard onLaunchSession={onLaunchSession} defaultCli="copilot" />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('wizard:get-config')
    })
  })

  it('renders initial question from config', async () => {
    render(<SessionWizard onLaunchSession={onLaunchSession} defaultCli="copilot" />)

    await waitFor(() => {
      expect(screen.getByText('Pick an option')).toBeInTheDocument()
    })
  })
})
