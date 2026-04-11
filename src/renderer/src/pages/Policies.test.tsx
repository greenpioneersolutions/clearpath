// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

beforeEach(() => {
  const api = setupElectronAPI({
    'policy:list-presets': [
      {
        id: 'std',
        name: 'Standard',
        description: 'Default policy',
        rules: {
          maxBudgetPerSession: null,
          maxBudgetPerDay: null,
          blockedTools: [],
          blockedFilePatterns: [],
          requiredPermissionMode: null,
          allowedModels: [],
          maxConcurrentAgents: null,
          maxTurnsPerSession: null,
        },
        isBuiltin: true,
        createdAt: Date.now(),
      },
    ],
    'policy:get-active': { activePresetId: 'std', presetName: 'Standard' },
    'policy:get-violations': [],
  })
  mockInvoke = api.mockInvoke
})

import Policies from './Policies'

describe('Policies', () => {
  it('renders loading state initially', () => {
    render(<Policies />)
    expect(screen.getByText('Loading policies...')).toBeInTheDocument()
  })

  it('renders policy presets after loading', async () => {
    render(<Policies />)
    await waitFor(() => {
      // "Standard" appears in both "Active: Standard" header and the preset card
      const items = screen.getAllByText('Standard')
      expect(items.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders tab buttons', async () => {
    render(<Policies />)
    await waitFor(() => {
      expect(screen.getByText('Presets')).toBeInTheDocument()
    })
    expect(screen.getByText(/Violations/)).toBeInTheDocument()
  })

  it('calls policy IPC channels on mount', () => {
    render(<Policies />)
    expect(mockInvoke).toHaveBeenCalledWith('policy:list-presets')
    expect(mockInvoke).toHaveBeenCalledWith('policy:get-active')
    expect(mockInvoke).toHaveBeenCalledWith('policy:get-violations')
  })
})
