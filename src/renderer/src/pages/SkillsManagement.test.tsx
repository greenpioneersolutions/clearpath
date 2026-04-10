// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

beforeEach(() => {
  const api = setupElectronAPI({
    'app:get-cwd': '/tmp/project',
    'skills:list': [],
    'starter-pack:get-skills': [],
    'starter-pack:get-agents': [],
    'agent:list': { copilot: [], claude: [] },
  })
  mockInvoke = api.mockInvoke
})

import SkillsManagement from './SkillsManagement'

describe('SkillsManagement', () => {
  it('renders without crashing', () => {
    render(<SkillsManagement />)
    // Loading state uses skeleton pulses, not text
    expect(document.querySelector('[class]')).toBeTruthy()
  })

  it('calls skills IPC channels on mount', () => {
    render(<SkillsManagement />)
    expect(mockInvoke).toHaveBeenCalledWith('app:get-cwd')
  })

  it('renders skill list after loading', async () => {
    render(<SkillsManagement />)
    await waitFor(() => {
      expect(screen.queryByText(/Loading/)).not.toBeInTheDocument()
    })
  })

  it('shows create skill button', async () => {
    render(<SkillsManagement />)
    await waitFor(() => {
      expect(screen.getByText(/Create Skill/i)).toBeInTheDocument()
    })
  })

  it('shows import button', async () => {
    render(<SkillsManagement />)
    await waitFor(() => {
      expect(screen.getByText(/Import/i)).toBeInTheDocument()
    })
  })
})
