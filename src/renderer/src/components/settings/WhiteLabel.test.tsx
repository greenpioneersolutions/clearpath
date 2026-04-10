// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BrandingProvider } from '../../contexts/BrandingContext'
import WhiteLabel from './WhiteLabel'

const mockInvoke = vi.fn()

const mockBrandConfig = {
  appName: 'ClearPathAI',
  appTagline: 'No code. No confusion. Just go.',
  wordmarkParts: ['Clear', 'Path', 'AI'] as [string, string, string],
  colorPrimary: '#5B4FC4',
  colorSecondary: '#7F77DD',
  colorAccent: '#1D9E75',
  colorAccentLight: '#5DCAA5',
  colorNeural: '#85B7EB',
  colorButtonPrimary: '#4F46E5',
  colorButtonHover: '#6366F1',
  colorSidebarBg: '#111827',
  colorSidebarText: '#9CA3AF',
  colorNavActive: '#4F46E5',
  lightPageBg: '#F3F4F6',
  lightCardBg: '#FFFFFF',
  lightBorder: '#E5E7EB',
  lightTextPrimary: '#111827',
  lightTextSecondary: '#6B7280',
  lightTextTertiary: '#9CA3AF',
  darkPageBg: '#111827',
  darkCardBg: '#1F2937',
  darkBorder: '#374151',
  darkTextPrimary: '#F9FAFB',
  darkTextSecondary: '#9CA3AF',
  darkTextTertiary: '#6B7280',
  colorMode: 'system' as const,
  useCustomLogo: false,
  customLogoDataUrl: null,
  borderRadius: 'rounded' as const,
}

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'branding:get') return Promise.resolve({ ...mockBrandConfig })
    if (channel === 'branding:set') return Promise.resolve({ ...mockBrandConfig })
    if (channel === 'branding:reset') return Promise.resolve({ ...mockBrandConfig })
    if (channel === 'branding:get-presets') {
      return Promise.resolve([
        { id: 'default', name: 'Default', preview: ['#5B4FC4', '#7F77DD', '#1D9E75'] },
        { id: 'ocean', name: 'Ocean Blue', preview: ['#1E40AF', '#3B82F6', '#06B6D4'] },
      ])
    }
    if (channel === 'branding:apply-preset') return Promise.resolve({ ...mockBrandConfig })
    return Promise.resolve()
  })

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
    <BrandingProvider>
      <WhiteLabel />
    </BrandingProvider>
  )
}

describe('WhiteLabel', () => {
  it('renders heading', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('White Label')).toBeInTheDocument())
  })

  it('renders section tabs', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Theme Presets')).toBeInTheDocument())
    expect(screen.getByText('Identity')).toBeInTheDocument()
    expect(screen.getByText('Brand Colors')).toBeInTheDocument()
    expect(screen.getByText('UI Colors')).toBeInTheDocument()
    expect(screen.getByText('Surfaces & Mode')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('renders theme presets on initial load', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument())
    expect(screen.getByText('Ocean Blue')).toBeInTheDocument()
  })

  it('shows Reset to Default button in presets tab', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Reset to Default')).toBeInTheDocument())
  })

  it('calls branding:reset when Reset to Default is clicked', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Reset to Default')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Reset to Default'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('branding:reset')
    })
  })

  it('calls branding:apply-preset when a preset is clicked', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Ocean Blue')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Ocean Blue'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('branding:apply-preset', { presetId: 'ocean' })
    })
  })

  it('switches to Identity tab and shows app name input', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Identity')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Identity'))
    await waitFor(() => expect(screen.getByText('App Name')).toBeInTheDocument())
    expect(screen.getByText('Tagline')).toBeInTheDocument()
    expect(screen.getByText('Wordmark Parts')).toBeInTheDocument()
  })

  it('calls branding:set when app name changes', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Identity')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Identity'))
    await waitFor(() => expect(screen.getByText('App Name')).toBeInTheDocument())

    const appNameInput = screen.getByDisplayValue('ClearPathAI')
    fireEvent.change(appNameInput, { target: { value: 'MyApp' } })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('branding:set', expect.objectContaining({ appName: 'MyApp' }))
    })
  })

  it('switches to Brand Colors tab', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Brand Colors')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Brand Colors'))
    await waitFor(() => expect(screen.getByText('Primary')).toBeInTheDocument())
    expect(screen.getByText('Secondary')).toBeInTheDocument()
    expect(screen.getByText('Accent')).toBeInTheDocument()
  })

  it('switches to UI Colors tab', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('UI Colors')).toBeInTheDocument())
    fireEvent.click(screen.getByText('UI Colors'))
    await waitFor(() => expect(screen.getByText('Button Primary')).toBeInTheDocument())
    expect(screen.getByText('Sidebar Background')).toBeInTheDocument()
  })

  it('switches to Surfaces & Mode tab and shows color mode options', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Surfaces & Mode')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Surfaces & Mode'))
    await waitFor(() => expect(screen.getByText('Color Mode')).toBeInTheDocument())
    expect(screen.getByText('System (Auto)')).toBeInTheDocument()
  })

  it('switches to Preview tab', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Preview')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Preview'))
    await waitFor(() => expect(screen.getByText(/Live preview/)).toBeInTheDocument())
  })

  it('shows border radius options in Identity tab', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Identity')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Identity'))
    await waitFor(() => expect(screen.getByText('Border Radius Style')).toBeInTheDocument())
    expect(screen.getByText('sharp')).toBeInTheDocument()
    expect(screen.getByText('rounded')).toBeInTheDocument()
    expect(screen.getByText('pill')).toBeInTheDocument()
  })
})
