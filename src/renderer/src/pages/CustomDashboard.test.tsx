// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

vi.mock('react-grid-layout', () => {
  const React = require('react')
  const RGL = ({ children }: { children: unknown }) => React.createElement('div', { 'data-testid': 'grid-layout' }, children)
  return { default: RGL, WidthProvider: (C: unknown) => C, Responsive: RGL }
})

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

beforeEach(() => {
  const api = setupElectronAPI({
    'dashboard:get-active-layout': {
      id: 'default',
      name: 'Default',
      widgets: [
        { i: 'w1', type: 'quick-prompt', x: 0, y: 0, w: 6, h: 2, config: {} },
      ],
    },
    'dashboard:list-layouts': [
      { id: 'default', name: 'Default', widgets: [] },
    ],
  })
  mockInvoke = api.mockInvoke
})

import CustomDashboard from './CustomDashboard'

describe('CustomDashboard', () => {
  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <CustomDashboard />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('calls dashboard IPC channels on mount', () => {
    render(
      <MemoryRouter>
        <CustomDashboard />
      </MemoryRouter>,
    )
    expect(mockInvoke).toHaveBeenCalledWith('dashboard:get-active-layout')
    expect(mockInvoke).toHaveBeenCalledWith('dashboard:list-layouts')
  })

  it('renders dashboard layout name after loading', async () => {
    render(
      <MemoryRouter>
        <CustomDashboard />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByText('Default')).toBeInTheDocument()
    })
  })

  it('renders add widget button after loading', async () => {
    render(
      <MemoryRouter>
        <CustomDashboard />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByText(/Add Widget/i)).toBeInTheDocument()
    })
  })
})
