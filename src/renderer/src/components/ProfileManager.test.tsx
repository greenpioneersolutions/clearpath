// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ProfileManager } from './ProfileManager'

describe('ProfileManager', () => {
  const baseProps = {
    profiles: [] as { id: string; name: string; enabledAgentIds: string[] }[],
    enabledAgentIds: ['a1', 'a2'],
    onApply: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    baseProps.onApply.mockReset()
    baseProps.onSave.mockReset()
    baseProps.onDelete.mockReset()
  })

  it('renders heading', () => {
    render(<ProfileManager {...baseProps} />)
    expect(screen.getByText('Profiles')).toBeInTheDocument()
  })

  it('shows empty message when no profiles', () => {
    render(<ProfileManager {...baseProps} />)
    expect(screen.getByText(/No profiles yet/)).toBeInTheDocument()
  })

  it('renders profile entries', () => {
    const profiles = [
      { id: 'p1', name: 'My Profile', enabledAgentIds: ['a1'] },
    ]
    render(<ProfileManager {...baseProps} profiles={profiles} />)
    expect(screen.getByText('My Profile')).toBeInTheDocument()
    expect(screen.getByText('1 agent enabled')).toBeInTheDocument()
  })

  it('calls onApply when Apply is clicked', () => {
    const profiles = [{ id: 'p1', name: 'Profile 1', enabledAgentIds: [] }]
    render(<ProfileManager {...baseProps} profiles={profiles} />)
    fireEvent.click(screen.getByText('Apply'))
    expect(baseProps.onApply).toHaveBeenCalledWith('p1')
  })

  it('calls onSave when save button is clicked with name', () => {
    render(<ProfileManager {...baseProps} />)
    const input = screen.getByPlaceholderText('Profile name…')
    fireEvent.change(input, { target: { value: 'New Profile' } })
    fireEvent.click(screen.getByText('Save'))
    expect(baseProps.onSave).toHaveBeenCalledWith('New Profile')
  })

  it('shows error when saving without name', () => {
    render(<ProfileManager {...baseProps} />)
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(baseProps.onSave).not.toHaveBeenCalled()
  })

  it('shows confirm before delete', () => {
    const profiles = [{ id: 'p1', name: 'Profile 1', enabledAgentIds: [] }]
    render(<ProfileManager {...baseProps} profiles={profiles} />)
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Confirm'))
    expect(baseProps.onDelete).toHaveBeenCalledWith('p1')
  })

  it('shows enabled agent count', () => {
    render(<ProfileManager {...baseProps} />)
    expect(screen.getByText(/2 enabled/)).toBeInTheDocument()
  })
})
