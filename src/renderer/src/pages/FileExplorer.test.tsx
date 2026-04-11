// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']
let mockOn: ReturnType<typeof setupElectronAPI>['mockOn']

beforeEach(() => {
  const api = setupElectronAPI({
    'app:get-cwd': '/tmp/project',
    'files:list': [
      { name: 'README.md', path: '/tmp/project/README.md', relativePath: 'README.md', isDirectory: false, size: 1024, modifiedAt: Date.now() },
      { name: 'src', path: '/tmp/project/src', relativePath: 'src', isDirectory: true, size: 0, modifiedAt: Date.now() },
    ],
    'files:watch': null,
    'cli:list-sessions': [],
  })
  mockInvoke = api.mockInvoke
  mockOn = api.mockOn
})

import FileExplorer from './FileExplorer'

describe('FileExplorer', () => {
  it('shows loading state initially', () => {
    render(<FileExplorer />)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('calls files:list on mount', () => {
    render(<FileExplorer />)
    expect(mockInvoke).toHaveBeenCalledWith('app:get-cwd')
  })

  it('renders file list after loading', async () => {
    render(<FileExplorer />)
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument()
    })
  })

  it('renders project working directory', async () => {
    render(<FileExplorer />)
    await waitFor(() => {
      expect(screen.getByText('/tmp/project')).toBeInTheDocument()
    })
  })

  it('subscribes to file change events', () => {
    render(<FileExplorer />)
    expect(mockOn).toHaveBeenCalledWith('files:changed', expect.any(Function))
  })

  it('renders search input', async () => {
    render(<FileExplorer />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
    })
  })
})
