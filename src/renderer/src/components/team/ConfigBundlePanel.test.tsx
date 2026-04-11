// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ConfigBundlePanel from './ConfigBundlePanel'

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

describe('ConfigBundlePanel', () => {
  it('renders heading and description', () => {
    render(<ConfigBundlePanel />)
    expect(screen.getByText('Configuration Bundle')).toBeInTheDocument()
    expect(screen.getByText(/Export or import your entire configuration/)).toBeInTheDocument()
  })

  it('renders Export and Import buttons', () => {
    render(<ConfigBundlePanel />)
    expect(screen.getByText('Export Bundle')).toBeInTheDocument()
    expect(screen.getByText('Import Bundle')).toBeInTheDocument()
  })

  it('calls team:export-bundle on export click and shows message', async () => {
    mockInvoke.mockResolvedValue('/tmp/config.json')
    render(<ConfigBundlePanel />)

    fireEvent.click(screen.getByText('Export Bundle'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('team:export-bundle')
      expect(screen.getByText('Exported to /tmp/config.json')).toBeInTheDocument()
    })
  })

  it('calls team:import-bundle on import click and shows success', async () => {
    mockInvoke.mockResolvedValue({ success: true })
    render(<ConfigBundlePanel />)

    fireEvent.click(screen.getByText('Import Bundle'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('team:import-bundle')
      expect(screen.getByText(/Config imported successfully/)).toBeInTheDocument()
    })
  })

  it('shows error message on failed import', async () => {
    mockInvoke.mockResolvedValue({ success: false, error: 'Invalid format' })
    render(<ConfigBundlePanel />)

    fireEvent.click(screen.getByText('Import Bundle'))

    await waitFor(() => {
      expect(screen.getByText('Error: Invalid format')).toBeInTheDocument()
    })
  })
})
