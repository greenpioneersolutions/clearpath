// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ConfigProfiles from './ConfigProfiles'

const mockInvoke = vi.fn()

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()

  // Default mock implementations
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'settings:list-profiles') {
      return Promise.resolve([
        { id: 'p1', name: 'My Config', description: 'Test profile', createdAt: Date.now(), settings: {} },
        { id: 'builtin-starter', name: 'Starter', description: 'Built-in preset', createdAt: 0, settings: {} },
      ])
    }
    if (channel === 'settings:save-profile') return Promise.resolve()
    if (channel === 'settings:load-profile') return Promise.resolve({ settings: {} })
    if (channel === 'settings:delete-profile') return Promise.resolve()
    if (channel === 'settings:export-profile') return Promise.resolve({ path: '/tmp/profile.json' })
    if (channel === 'settings:import-profile') return Promise.resolve({ profile: { id: 'imported', name: 'Imported Config', description: '', createdAt: Date.now(), settings: {} } })
    return Promise.resolve()
  })

  // Mock confirm
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ConfigProfiles', () => {
  const onApply = vi.fn()

  beforeEach(() => {
    onApply.mockReset()
  })

  it('shows loading skeletons initially then renders profiles', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    // After loading, profiles should appear
    await waitFor(() => expect(screen.getByText('My Config')).toBeInTheDocument())
    expect(screen.getByText('Starter')).toBeInTheDocument()
  })

  it('shows "starter" badge for builtin profiles', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('starter')).toBeInTheDocument())
  })

  it('renders Import and Save Current buttons', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('Import')).toBeInTheDocument())
    expect(screen.getByText('Save Current')).toBeInTheDocument()
  })

  it('shows save form when Save Current is clicked', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('Save Current')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save Current'))
    expect(screen.getByPlaceholderText('e.g. My Project Config')).toBeInTheDocument()
    expect(screen.getByText('Save Profile')).toBeInTheDocument()
  })

  it('hides save form when Cancel is clicked', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('Save Current')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save Current'))
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('e.g. My Project Config')).not.toBeInTheDocument()
  })

  it('disables Save Profile button when name is empty', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('Save Current')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save Current'))
    expect(screen.getByText('Save Profile')).toBeDisabled()
  })

  it('calls settings:save-profile with name and description', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('Save Current')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save Current'))

    fireEvent.change(screen.getByPlaceholderText('e.g. My Project Config'), { target: { value: 'New Profile' } })
    fireEvent.change(screen.getByPlaceholderText('What this profile is for...'), { target: { value: 'My description' } })
    fireEvent.click(screen.getByText('Save Profile'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:save-profile', {
        name: 'New Profile',
        description: 'My description',
      })
    })
  })

  it('shows success message after saving', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('Save Current')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save Current'))
    fireEvent.change(screen.getByPlaceholderText('e.g. My Project Config'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByText('Save Profile'))

    await waitFor(() => expect(screen.getByText('Profile saved')).toBeInTheDocument())
  })

  it('calls settings:load-profile when Load is clicked', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('My Config')).toBeInTheDocument())

    const loadButtons = screen.getAllByText('Load')
    fireEvent.click(loadButtons[0])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:load-profile', { id: 'p1' })
    })
  })

  it('calls onApply after loading a profile', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('My Config')).toBeInTheDocument())

    const loadButtons = screen.getAllByText('Load')
    fireEvent.click(loadButtons[0])

    await waitFor(() => expect(onApply).toHaveBeenCalled())
  })

  it('calls settings:export-profile when Export is clicked', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('My Config')).toBeInTheDocument())

    const exportButtons = screen.getAllByText('Export')
    fireEvent.click(exportButtons[0])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:export-profile', { id: 'p1' })
    })
  })

  it('shows Delete button only for non-builtin profiles', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('My Config')).toBeInTheDocument())

    const deleteButtons = screen.getAllByText('Delete')
    // Only 1 Delete button (for the non-builtin profile)
    expect(deleteButtons).toHaveLength(1)
  })

  it('calls settings:delete-profile with confirm when Delete is clicked', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('My Config')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith('Delete profile "My Config"?')
      expect(mockInvoke).toHaveBeenCalledWith('settings:delete-profile', { id: 'p1' })
    })
  })

  it('calls settings:import-profile when Import is clicked', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('Import')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Import'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:import-profile')
    })
  })

  it('shows imported profile name on successful import', async () => {
    render(<ConfigProfiles onApply={onApply} />)
    await waitFor(() => expect(screen.getByText('Import')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Import'))

    await waitFor(() => expect(screen.getByText('Imported "Imported Config"')).toBeInTheDocument())
  })
})
