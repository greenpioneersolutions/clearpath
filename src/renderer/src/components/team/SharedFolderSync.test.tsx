// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import SharedFolderSync from './SharedFolderSync'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

describe('SharedFolderSync', () => {
  it('renders heading', async () => {
    mockInvoke.mockResolvedValue(null)
    render(<SharedFolderSync />)
    expect(screen.getByText('Shared Config Folder')).toBeInTheDocument()
  })

  it('shows Select Shared Folder button when no folder is set', async () => {
    mockInvoke.mockResolvedValue(null)
    render(<SharedFolderSync />)

    await waitFor(() => {
      expect(screen.getByText('Select Shared Folder')).toBeInTheDocument()
    })
  })

  it('shows folder path and config list when folder is set', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'team:get-shared-folder') return Promise.resolve('/shared/team')
      if (channel === 'team:list-shared-configs') return Promise.resolve([
        { fileName: 'default.json', name: 'Default Config', description: 'Team defaults', path: '/shared/team/default.json', modifiedAt: Date.now() },
      ])
      return Promise.resolve(null)
    })

    render(<SharedFolderSync />)

    await waitFor(() => {
      expect(screen.getByText('/shared/team')).toBeInTheDocument()
      expect(screen.getByText('Default Config')).toBeInTheDocument()
      expect(screen.getByText('Apply')).toBeInTheDocument()
    })
  })

  it('calls team:set-shared-folder when Select Shared Folder is clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'team:get-shared-folder') return Promise.resolve(null)
      if (channel === 'team:set-shared-folder') return Promise.resolve({ path: '/new/folder' })
      if (channel === 'team:list-shared-configs') return Promise.resolve([])
      return Promise.resolve(null)
    })

    render(<SharedFolderSync />)

    await waitFor(() => {
      expect(screen.getByText('Select Shared Folder')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Select Shared Folder'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('team:set-shared-folder')
    })
  })

  it('applies a shared config when Apply is clicked', async () => {
    const configPath = '/shared/team/default.json'
    mockInvoke.mockImplementation((channel: string, args?: Record<string, unknown>) => {
      if (channel === 'team:get-shared-folder') return Promise.resolve('/shared/team')
      if (channel === 'team:list-shared-configs') return Promise.resolve([
        { fileName: 'default.json', name: 'Default Config', description: '', path: configPath, modifiedAt: Date.now() },
      ])
      if (channel === 'team:apply-shared-config') return Promise.resolve({ success: true })
      return Promise.resolve(null)
    })

    render(<SharedFolderSync />)

    await waitFor(() => {
      expect(screen.getByText('Apply')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Apply'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('team:apply-shared-config', { path: configPath })
    })
  })

  it('shows empty state when folder has no configs', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'team:get-shared-folder') return Promise.resolve('/shared/team')
      if (channel === 'team:list-shared-configs') return Promise.resolve([])
      return Promise.resolve(null)
    })

    render(<SharedFolderSync />)

    await waitFor(() => {
      expect(screen.getByText(/No .json config files found/)).toBeInTheDocument()
    })
  })
})
