// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

vi.mock('../contexts/BrandingContext', () => ({
  useBranding: () => ({
    brand: { appName: 'ClearPathAI', logoPath: '', accentColor: '#4F46E5' },
  }),
}))

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

beforeEach(() => {
  const api = setupElectronAPI({
    'cli:get-persisted-sessions': [],
    'setup-wizard:is-complete': { complete: true },
    'notes:list': [],
    'agent:list': { copilot: [], claude: [] },
    'app:get-cwd': '/tmp/project',
    'skills:list': [],
  })
  mockInvoke = api.mockInvoke
})

import HomeHub from './HomeHub'

describe('HomeHub', () => {
  it('renders greeting', async () => {
    render(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeInTheDocument()
    })
  })

  it('renders quick prompt input', async () => {
    render(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/What do you need help with/i)).toBeInTheDocument()
    })
  })

  it('calls IPC channels on mount', () => {
    render(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>,
    )
    expect(mockInvoke).toHaveBeenCalledWith('cli:get-persisted-sessions')
    expect(mockInvoke).toHaveBeenCalledWith('setup-wizard:is-complete')
  })

  it('renders action cards', async () => {
    render(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>,
    )
    await waitFor(() => {
      // HomeHub shows action cards for navigating to Work, Configure, etc.
      const links = document.querySelectorAll('a, button')
      expect(links.length).toBeGreaterThan(0)
    })
  })
})
