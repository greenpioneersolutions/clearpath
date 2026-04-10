// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import WizardSettings from './WizardSettings'

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
  title: 'Session Wizard',
  subtitle: 'Build prompts with guidance',
  initialQuestion: 'What would you like to do?',
  options: [
    {
      id: 'question',
      label: 'Ask a Question',
      description: 'Quick Q&A about your codebase',
      icon: '❓',
      fields: [
        { id: 'q1', label: 'Your question', placeholder: 'Type here...', type: 'textarea' as const, required: true },
      ],
      promptTemplate: '{{q1}}',
    },
  ],
}

const defaultCtxSettings = {
  showUseContext: true,
  showMemories: true,
  showAgents: true,
  showSkills: true,
}

describe('WizardSettings', () => {
  beforeEach(() => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'wizard:get-config') return Promise.resolve(sampleConfig)
      if (channel === 'wizard:get-context-settings') return Promise.resolve(defaultCtxSettings)
      return Promise.resolve(null)
    })
  })

  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<WizardSettings />)
    expect(screen.getByText('Loading wizard config...')).toBeInTheDocument()
  })

  it('renders heading and options after loading', async () => {
    render(<WizardSettings />)

    await waitFor(() => {
      expect(screen.getByText('Session Wizard')).toBeInTheDocument()
    })
    expect(screen.getByText('Ask a Question')).toBeInTheDocument()
  })

  it('renders General section with title and initial question inputs', async () => {
    render(<WizardSettings />)

    await waitFor(() => {
      expect(screen.getByText('General')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Session Wizard')).toBeInTheDocument()
    expect(screen.getByDisplayValue('What would you like to do?')).toBeInTheDocument()
  })

  it('shows Save Changes button when config is modified', async () => {
    render(<WizardSettings />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Session Wizard')).toBeInTheDocument()
    })

    const titleInput = screen.getByDisplayValue('Session Wizard')
    fireEvent.change(titleInput, { target: { value: 'My Wizard' } })
    expect(screen.getByText('Save Changes')).toBeInTheDocument()
  })

  it('calls wizard:save-config when Save Changes is clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'wizard:get-config') return Promise.resolve(sampleConfig)
      if (channel === 'wizard:get-context-settings') return Promise.resolve(defaultCtxSettings)
      if (channel === 'wizard:save-config') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })

    render(<WizardSettings />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Session Wizard')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByDisplayValue('Session Wizard'), { target: { value: 'Updated' } })
    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('wizard:save-config', expect.objectContaining({
        config: expect.objectContaining({ title: 'Updated' }),
      }))
    })
  })

  it('calls wizard:reset-config when Reset to Defaults is clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'wizard:get-config') return Promise.resolve(sampleConfig)
      if (channel === 'wizard:get-context-settings') return Promise.resolve(defaultCtxSettings)
      if (channel === 'wizard:reset-config') return Promise.resolve({ success: true, config: sampleConfig })
      return Promise.resolve(null)
    })

    render(<WizardSettings />)

    await waitFor(() => {
      expect(screen.getByText('Reset to Defaults')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Reset to Defaults'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('wizard:reset-config')
    })
  })

  it('renders Use Context toggle section', async () => {
    render(<WizardSettings />)

    await waitFor(() => {
      expect(screen.getByText('Use Context')).toBeInTheDocument()
    })
  })

  it('adds a new option when + Add Option is clicked', async () => {
    render(<WizardSettings />)

    await waitFor(() => {
      expect(screen.getByText('+ Add Option')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('+ Add Option'))
    expect(screen.getByText('New Option')).toBeInTheDocument()
  })
})
