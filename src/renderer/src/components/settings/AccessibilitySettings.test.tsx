// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AccessibilityProvider } from '../../contexts/AccessibilityContext'
import AccessibilitySettings from './AccessibilitySettings'

const mockInvoke = vi.fn()

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  // Mock the accessibility:get call to return defaults
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'accessibility:get') {
      return Promise.resolve({
        fontScale: 1.0,
        reducedMotion: false,
        highContrast: false,
        focusStyle: 'ring',
        screenReaderMode: false,
        keyboardShortcutsEnabled: true,
      })
    }
    if (channel === 'accessibility:set') return Promise.resolve()
    if (channel === 'accessibility:reset') return Promise.resolve()
    return Promise.resolve()
  })

  // Mock matchMedia for the context provider
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

function renderWithProvider() {
  return render(
    <AccessibilityProvider>
      <AccessibilitySettings />
    </AccessibilityProvider>
  )
}

describe('AccessibilitySettings', () => {
  it('renders the heading', async () => {
    renderWithProvider()
    expect(screen.getByText('Accessibility')).toBeInTheDocument()
  })

  it('renders font scaling section', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Font Scaling')).toBeInTheDocument())
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('calls accessibility:set when font scale changes', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByLabelText('Font scale percentage')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Font scale percentage'), { target: { value: '1.2' } })
    expect(mockInvoke).toHaveBeenCalledWith('accessibility:set', { fontScale: 1.2 })
  })

  it('renders toggle switches for visual settings', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByLabelText('Toggle Reduced Motion')).toBeInTheDocument())
    expect(screen.getByLabelText('Toggle High Contrast')).toBeInTheDocument()
    expect(screen.getByLabelText('Toggle Screen Reader Mode')).toBeInTheDocument()
  })

  it('calls accessibility:set when reduced motion is toggled', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByLabelText('Toggle Reduced Motion')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Toggle Reduced Motion'))
    expect(mockInvoke).toHaveBeenCalledWith('accessibility:set', { reducedMotion: true })
  })

  it('calls accessibility:set when high contrast is toggled', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByLabelText('Toggle High Contrast')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Toggle High Contrast'))
    expect(mockInvoke).toHaveBeenCalledWith('accessibility:set', { highContrast: true })
  })

  it('calls accessibility:set when screen reader mode is toggled', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByLabelText('Toggle Screen Reader Mode')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Toggle Screen Reader Mode'))
    expect(mockInvoke).toHaveBeenCalledWith('accessibility:set', { screenReaderMode: true })
  })

  it('renders focus indicator options as radio group', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeInTheDocument())
    expect(screen.getByText('Ring')).toBeInTheDocument()
    expect(screen.getByText('Outline')).toBeInTheDocument()
    expect(screen.getByText('Both')).toBeInTheDocument()
  })

  it('calls accessibility:set when focus style is changed', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeInTheDocument())
    // Find all radio buttons and click the one with "Outline" text
    const radios = screen.getAllByRole('radio')
    const outlineRadio = radios.find((r) => r.textContent?.includes('Outline'))!
    fireEvent.click(outlineRadio)
    expect(mockInvoke).toHaveBeenCalledWith('accessibility:set', { focusStyle: 'outline' })
  })

  it('renders keyboard shortcuts section with toggle', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument())
    expect(screen.getByLabelText('Toggle keyboard shortcuts')).toBeInTheDocument()
    expect(screen.getByLabelText('Keyboard shortcut reference')).toBeInTheDocument()
  })

  it('calls accessibility:set when keyboard shortcuts toggled', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByLabelText('Toggle keyboard shortcuts')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Toggle keyboard shortcuts'))
    expect(mockInvoke).toHaveBeenCalledWith('accessibility:set', { keyboardShortcutsEnabled: false })
  })

  it('calls accessibility:reset when reset button is clicked', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByLabelText('Reset all accessibility settings to defaults')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Reset all accessibility settings to defaults'))
    expect(mockInvoke).toHaveBeenCalledWith('accessibility:reset')
  })

  it('renders shortcut key reference table', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Escape')).toBeInTheDocument())
    expect(screen.getByText('Close modal or panel')).toBeInTheDocument()
    expect(screen.getByText('?')).toBeInTheDocument()
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument()
  })

  it('shows preview text with current font scale', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText(/The quick brown fox/)).toBeInTheDocument())
  })
})
