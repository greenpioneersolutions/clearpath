// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import StarterMemories from './StarterMemories'

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

describe('StarterMemories', () => {
  const mockDefs = [
    {
      id: 'work-profile',
      name: 'Work Profile',
      description: 'Your role and responsibilities',
      setupPhase: 'onboarding',
      setupPrompt: 'Tell me about your role',
      fields: [
        { key: 'role', label: 'Your Role', type: 'text', required: true, placeholder: 'e.g. Engineering Manager', helpText: 'What is your job title?' },
        { key: 'responsibilities', label: 'Responsibilities', type: 'textarea', required: false, placeholder: 'What do you do?', helpText: 'Describe your main duties' },
      ],
      example: 'Role: Engineering Manager\nResponsibilities: Lead frontend team',
      whatItUnlocks: 'Personalized responses based on your role',
    },
    {
      id: 'communication-preferences',
      name: 'Communication Style',
      description: 'How you prefer AI to communicate',
      setupPhase: 'early',
      setupPrompt: 'How do you prefer communication?',
      fields: [
        { key: 'style', label: 'Style', type: 'select', required: true, placeholder: '', helpText: 'Choose your preferred style', options: ['concise', 'detailed', 'balanced'] },
      ],
      example: 'Style: concise',
      whatItUnlocks: 'AI adapts its communication style',
    },
  ]

  const mockSetupState = {
    workProfileComplete: false,
    communicationPreferencesComplete: true,
    currentPrioritiesComplete: false,
    workingPreferencesComplete: false,
    stakeholderMapEntries: 0,
    hasCompletedFirstInteraction: false,
  }

  beforeEach(() => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'starter-pack:get-memories') return Promise.resolve(mockDefs)
      if (channel === 'starter-pack:get-setup-state') return Promise.resolve(mockSetupState)
      if (channel === 'starter-pack:get-memory-data') return Promise.resolve(null)
      if (channel === 'starter-pack:save-memory-data') return Promise.resolve({ success: true })
      return Promise.resolve(undefined)
    })
  })

  it('shows loading state', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<StarterMemories />)
    expect(screen.getByText('Loading starter memories...')).toBeInTheDocument()
  })

  it('renders memory cards after loading', async () => {
    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText('Work Profile')).toBeInTheDocument()
      expect(screen.getByText('Communication Style')).toBeInTheDocument()
    })
  })

  it('shows completion count', async () => {
    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText(/1 of 2 memories configured/)).toBeInTheDocument()
    })
  })

  it('shows phase badges', async () => {
    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText('Onboarding')).toBeInTheDocument()
      expect(screen.getByText('Early')).toBeInTheDocument()
    })
  })

  it('shows "Complete" label for completed memories', async () => {
    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText('Complete')).toBeInTheDocument()
    })
  })

  it('expands form when memory card is clicked', async () => {
    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText('Work Profile')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Work Profile'))

    await waitFor(() => {
      expect(screen.getByText('What it unlocks')).toBeInTheDocument()
      expect(screen.getByText('Your Role')).toBeInTheDocument()
      expect(screen.getByText('Responsibilities')).toBeInTheDocument()
      expect(screen.getByText('Example')).toBeInTheDocument()
    })
  })

  it('shows field types correctly (text input for text fields)', async () => {
    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText('Work Profile')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Work Profile'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. Engineering Manager')).toBeInTheDocument()
    })
  })

  it('saves form data when Save is clicked', async () => {
    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText('Work Profile')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Work Profile'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. Engineering Manager')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('e.g. Engineering Manager'), {
      target: { value: 'Senior Dev' },
    })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('starter-pack:save-memory-data', {
        id: 'work-profile',
        data: { role: 'Senior Dev' },
      })
    })
  })

  it('shows success message after save', async () => {
    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText('Work Profile')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Work Profile'))

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(screen.getByText('Saved successfully')).toBeInTheDocument()
    })
  })

  it('shows empty state when no definitions exist', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'starter-pack:get-memories') return Promise.resolve([])
      if (channel === 'starter-pack:get-setup-state') return Promise.resolve(mockSetupState)
      return Promise.resolve(null)
    })

    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText('No starter memory definitions found.')).toBeInTheDocument()
    })
  })

  it('shows Refresh button that reloads data', async () => {
    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Refresh'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('starter-pack:get-memories')
    })
  })

  it('renders select fields with options', async () => {
    render(<StarterMemories />)
    await waitFor(() => {
      expect(screen.getByText('Communication Style')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Communication Style'))

    await waitFor(() => {
      expect(screen.getByText('concise')).toBeInTheDocument()
      expect(screen.getByText('detailed')).toBeInTheDocument()
      expect(screen.getByText('balanced')).toBeInTheDocument()
    })
  })
})
