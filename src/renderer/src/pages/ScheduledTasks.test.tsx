// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

beforeEach(() => {
  const api = setupElectronAPI({
    'scheduler:list': [],
  })
  mockInvoke = api.mockInvoke
})

import ScheduledTasks from './ScheduledTasks'

describe('ScheduledTasks', () => {
  it('renders page heading', () => {
    render(<ScheduledTasks />)
    expect(screen.getByText('Scheduled Tasks')).toBeInTheDocument()
  })

  it('renders empty state after loading', async () => {
    render(<ScheduledTasks />)
    await waitFor(() => {
      expect(screen.getByText(/No scheduled tasks/i)).toBeInTheDocument()
    })
  })

  it('calls scheduler:list on mount', () => {
    render(<ScheduledTasks />)
    expect(mockInvoke).toHaveBeenCalledWith('scheduler:list')
  })

  it('shows create button after loading', async () => {
    render(<ScheduledTasks />)
    await waitFor(() => {
      expect(screen.getByText(/Create/i)).toBeInTheDocument()
    })
  })
})
