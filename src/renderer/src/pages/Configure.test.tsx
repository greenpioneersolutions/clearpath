// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
  // Provide mocks for all IPC channels that child components might call
  mockInvoke.mockImplementation((channel: string) => {
    // Settings
    if (channel === 'settings:get') return Promise.resolve({ flags: {}, model: { copilot: 'claude-sonnet-4-5', claude: 'sonnet' }, maxBudgetUsd: null, maxTurns: null, verbose: false })
    // Accessibility
    if (channel === 'accessibility:get-settings') return Promise.resolve({})
    // Policies
    if (channel === 'policy:get') return Promise.resolve({ mode: 'warn', rules: [] })
    if (channel === 'policy:list-presets') return Promise.resolve([])
    if (channel === 'policy:get-active') return Promise.resolve({ presetName: 'Standard', activePresetId: 'standard' })
    if (channel === 'policy:get-violations') return Promise.resolve([])
    if (channel === 'policy:list-violations') return Promise.resolve([])
    // Integration
    if (channel === 'integration:get-status') return Promise.resolve({ github: null })
    // Feature flags
    if (channel === 'feature-flags:get') return Promise.resolve(null)
    // Agents
    if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
    if (channel === 'agent:get-enabled') return Promise.resolve([])
    if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
    if (channel === 'agent:get-profiles') return Promise.resolve([])
    if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
    // Memory
    if (channel === 'app:get-cwd') return Promise.resolve('/test')
    if (channel === 'cli:list-sessions') return Promise.resolve([])
    if (channel === 'notes:list') return Promise.resolve([])
    if (channel === 'notes:get-tags') return Promise.resolve([])
    if (channel === 'notes:get-categories') return Promise.resolve([])
    // Skills
    if (channel === 'skills:list') return Promise.resolve([])
    // Workspaces
    if (channel === 'workspace:list') return Promise.resolve([])
    if (channel === 'workspace:get-active') return Promise.resolve(null)
    if (channel === 'workspace:get-repo-info') return Promise.resolve([])
    if (channel === 'workspace:activity-feed') return Promise.resolve([])
    // Team
    if (channel === 'team:get-info') return Promise.resolve(null)
    if (channel === 'team:list-members') return Promise.resolve([])
    // Scheduler
    if (channel === 'scheduler:list-tasks') return Promise.resolve([])
    // Branding
    if (channel === 'branding:get') return Promise.resolve(null)
    // Setup wizard
    if (channel === 'setup-wizard:get-state') return Promise.resolve({ step: 0, completed: false })
    if (channel === 'setup-wizard:is-complete') return Promise.resolve({ complete: true })
    // Wizard
    if (channel === 'wizard:get-options') return Promise.resolve([])
    // Starter
    if (channel === 'starter-pack:get-memories') return Promise.resolve([])
    if (channel === 'starter-pack:get-installed-memories') return Promise.resolve([])
    return Promise.resolve(null)
  })
})

import Configure from './Configure'

function renderConfigure() {
  return render(
    <MemoryRouter>
      <Configure />
    </MemoryRouter>
  )
}

describe('Configure', () => {
  it('renders vertical tab navigation', () => {
    renderConfigure()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('renders key tab labels', () => {
    renderConfigure()
    expect(screen.getByText('Setup Wizard')).toBeInTheDocument()
    expect(screen.getByText('Accessibility')).toBeInTheDocument()
    // "Settings" tab text — the tab label in the vertical nav
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Policies')).toBeInTheDocument()
    expect(screen.getByText('Integrations')).toBeInTheDocument()
  })

  it('shows Settings tab content by default', async () => {
    renderConfigure()
    // Settings page loads and shows "Settings" heading
    await waitFor(() => {
      // There will be multiple "Settings" texts (tab + heading)
      expect(mockInvoke).toHaveBeenCalledWith('settings:get')
    })
  })

  it('switches to Integrations tab', async () => {
    renderConfigure()
    fireEvent.click(screen.getByRole('tab', { name: 'Integrations' }))
    await waitFor(() => {
      expect(screen.getByText('Integrations', { selector: 'h1' })).toBeInTheDocument()
    })
  })

  it('has correct aria-selected attribute on active tab', () => {
    renderConfigure()
    const settingsTab = screen.getByRole('tab', { name: 'Settings' })
    expect(settingsTab).toHaveAttribute('aria-selected', 'true')
  })

  it('shows Learning Center link', () => {
    renderConfigure()
    expect(screen.getByText('Learning Center')).toBeInTheDocument()
  })

  it('updates aria-selected when switching tabs', () => {
    renderConfigure()
    const settingsTab = screen.getByRole('tab', { name: 'Settings' })
    const policiesTab = screen.getByRole('tab', { name: 'Policies' })

    expect(settingsTab).toHaveAttribute('aria-selected', 'true')
    expect(policiesTab).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(policiesTab)
    expect(policiesTab).toHaveAttribute('aria-selected', 'true')
    expect(settingsTab).toHaveAttribute('aria-selected', 'false')
  })
})
