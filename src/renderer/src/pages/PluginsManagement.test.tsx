// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

const samplePlugins = [
  {
    id: '/p/cop-one',
    name: 'cop-one',
    version: '1.0.0',
    description: 'A Copilot plugin',
    cli: 'copilot' as const,
    source: 'discovered' as const,
    enabled: true,
    path: '/p/cop-one',
    manifestPath: '/p/cop-one/plugin.json',
  },
  {
    id: '/p/claude-alpha',
    name: 'claude-alpha',
    version: '0.1.0',
    description: 'A Claude plugin',
    cli: 'claude' as const,
    source: 'custom' as const,
    enabled: false,
    path: '/p/claude-alpha',
    manifestPath: '/p/claude-alpha/.claude-plugin/plugin.json',
  },
]

beforeEach(() => {
  const api = setupElectronAPI({
    'plugins:list': samplePlugins,
    'plugins:rescan': samplePlugins,
    'plugins:set-enabled': null,
  })
  mockInvoke = api.mockInvoke
})

import PluginsManagement from './PluginsManagement'

describe('PluginsManagement', () => {
  it('renders the page header and section titles', async () => {
    render(<PluginsManagement />)
    expect(await screen.findByText('CLI Plugins')).toBeInTheDocument()
    expect(screen.getByText('GitHub Copilot CLI')).toBeInTheDocument()
    expect(screen.getByText('Claude Code CLI')).toBeInTheDocument()
  })

  it('calls plugins:list on mount', async () => {
    render(<PluginsManagement />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('plugins:list')
    })
  })

  it('renders discovered plugins from each CLI in the correct section', async () => {
    render(<PluginsManagement />)
    expect(await screen.findByText('cop-one')).toBeInTheDocument()
    expect(await screen.findByText('claude-alpha')).toBeInTheDocument()
  })

  it('clicking Rescan triggers plugins:rescan', async () => {
    render(<PluginsManagement />)
    const btn = await screen.findByRole('button', { name: /Rescan/i })
    fireEvent.click(btn)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('plugins:rescan')
    })
  })

  it('shows the Add Custom Path button', async () => {
    render(<PluginsManagement />)
    expect(await screen.findByRole('button', { name: /Add Custom Path/i })).toBeInTheDocument()
  })
})
