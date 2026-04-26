// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import McpCatalogGrid from './McpCatalogGrid'
import type { McpCatalogEntry } from '../../types/mcp'

const mockInvoke = vi.fn()

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
})

const mockCatalog: McpCatalogEntry[] = [
  {
    id: 'filesystem',
    displayName: 'Filesystem',
    description: 'Read and write files on the local filesystem.',
    homepageUrl: 'https://example.com',
    command: 'npx',
    args: ['-y', '@mcp/fs'],
    envSchema: [],
    recommendedFor: ['copilot', 'claude'],
  },
  {
    id: 'github',
    displayName: 'GitHub',
    description: 'Interact with GitHub.',
    homepageUrl: 'https://example.com/gh',
    command: 'npx',
    args: ['-y', '@mcp/github'],
    envSchema: [
      {
        name: 'GITHUB_TOKEN',
        description: 'PAT',
        secret: true,
        required: true,
      },
      {
        name: 'OTHER',
        description: 'Other',
        secret: true,
        required: false,
      },
    ],
  },
]

function setupMocks(catalog = mockCatalog) {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'mcp:catalog-list') return Promise.resolve(catalog)
    if (channel === 'workspace:get-active') return Promise.resolve(null)
    if (channel === 'workspace:list') return Promise.resolve([])
    return Promise.resolve(null)
  })
}

const noop = () => {}

describe('McpCatalogGrid', () => {
  it('renders catalog items from IPC', async () => {
    setupMocks()
    render(<McpCatalogGrid onInstalled={noop} onWarning={noop} onError={noop} />)
    await waitFor(() => {
      expect(screen.getByText('Filesystem')).toBeDefined()
      expect(screen.getByText('GitHub')).toBeDefined()
    })
  })

  it('shows a secret count badge when entry has secret env vars', async () => {
    setupMocks()
    render(<McpCatalogGrid onInstalled={noop} onWarning={noop} onError={noop} />)
    await waitFor(() => {
      expect(screen.getByText(/2 secrets required/)).toBeDefined()
    })
  })

  it('shows command badge for each entry', async () => {
    setupMocks()
    render(<McpCatalogGrid onInstalled={noop} onWarning={noop} onError={noop} />)
    await waitFor(() => {
      // two 'npx' badges (one per catalog card)
      const npxBadges = screen.getAllByText('npx')
      expect(npxBadges.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('opens wizard when Install button clicked', async () => {
    setupMocks()
    render(<McpCatalogGrid onInstalled={noop} onWarning={noop} onError={noop} />)
    await waitFor(() => {
      expect(screen.getAllByText('Install').length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getAllByText('Install')[0])
    await waitFor(() => {
      // Wizard shows display name pre-filled
      expect(screen.getByText(/Install Filesystem/)).toBeDefined()
    })
  })

  it('renders a Custom server card and opens blank wizard', async () => {
    setupMocks()
    render(<McpCatalogGrid onInstalled={noop} onWarning={noop} onError={noop} />)
    await waitFor(() => {
      expect(screen.getByText('Custom server')).toBeDefined()
    })
    fireEvent.click(screen.getByText('Add custom'))
    await waitFor(() => {
      expect(screen.getByText('Add custom connection')).toBeDefined()
    })
  })

  it('shows loading skeletons before catalog loads', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<McpCatalogGrid onInstalled={noop} onWarning={noop} onError={noop} />)
    const pulses = document.querySelectorAll('.animate-pulse')
    expect(pulses.length).toBeGreaterThan(0)
  })
})
