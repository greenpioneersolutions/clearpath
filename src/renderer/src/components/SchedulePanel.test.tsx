// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

beforeEach(() => {
  const api = setupElectronAPI({
    'scheduler:list': [],
    'scheduler:templates': [],
    'templates:list': [],
  })
  mockInvoke = api.mockInvoke
})

import SchedulePanel from './SchedulePanel'

describe('SchedulePanel', () => {
  it('renders without crashing', () => {
    render(<SchedulePanel cli="copilot" />)
    expect(document.querySelector('[class]')).toBeTruthy()
  })

  it('calls scheduler:list on mount', () => {
    render(<SchedulePanel cli="copilot" />)
    expect(mockInvoke).toHaveBeenCalledWith('scheduler:list')
  })

  it('renders create buttons after loading', async () => {
    render(<SchedulePanel cli="copilot" />)
    await waitFor(() => {
      expect(screen.getByText('Create Custom Schedule')).toBeInTheDocument()
    })
    expect(screen.getByText('Schedule a Template')).toBeInTheDocument()
  })

  it('shows schedule heading', async () => {
    render(<SchedulePanel cli="copilot" />)
    await waitFor(() => {
      expect(screen.getByText('Schedule')).toBeInTheDocument()
    })
  })
})
