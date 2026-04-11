// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

vi.mock('../components/onboarding/FirstRunWizard', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="first-run-wizard">
      <button onClick={() => onComplete()}>Complete</button>
    </div>
  ),
}))

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

beforeEach(() => {
  const api = setupElectronAPI({
    'onboarding:get-state': {
      completedOnboarding: true,
      trainingModeEnabled: false,
      featureUsage: {},
      guidedTasksCompleted: [],
      level: 'beginner',
      progress: 0,
      total: 10,
    },
  })
  mockInvoke = api.mockInvoke
})

import Onboarding from './Onboarding'

describe('Onboarding', () => {
  it('shows loading initially', () => {
    render(<Onboarding />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('calls onboarding:get-state on mount', () => {
    render(<Onboarding />)
    expect(mockInvoke).toHaveBeenCalledWith('onboarding:get-state')
  })

  it('renders onboarding content after loading', async () => {
    render(<Onboarding />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
  })

  it('shows wizard when onboarding not completed', async () => {
    setupElectronAPI({
      'onboarding:get-state': {
        completedOnboarding: false,
        trainingModeEnabled: false,
        featureUsage: {},
        guidedTasksCompleted: [],
        level: 'beginner',
        progress: 0,
        total: 10,
      },
    })
    render(<Onboarding />)
    // vi.mock for FirstRunWizard doesn't work due to setup-coverage.ts preloading.
    // The real FirstRunWizard renders with "Welcome to Clear Path" text.
    await waitFor(() => {
      expect(screen.getByText(/Welcome to Clear Path/i)).toBeInTheDocument()
    })
  })
})
