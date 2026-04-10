// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { BrandingProvider, useBranding } from './BrandingContext'
import type { BrandingConfig } from './BrandingContext'
import type { ReactNode } from 'react'

// ── Mock electronAPI ─────────────────────────────────────────────────────────

const mockInvoke = vi.fn()
const mockOn = vi.fn()

beforeEach(() => {
  mockInvoke.mockReset()
  mockOn.mockReset()
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn },
    writable: true,
    configurable: true,
  })
  // Mock matchMedia for dark mode detection
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

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.className = ''
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <BrandingProvider>{children}</BrandingProvider>
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useBranding (default context)', () => {
  it('returns defaults when used outside provider', () => {
    const { result } = renderHook(() => useBranding())

    expect(result.current.brand.appName).toBe('ClearPathAI')
    expect(result.current.brand.colorPrimary).toBe('#5B4FC4')
    expect(result.current.isDark).toBe(false)
    expect(result.current.loading).toBe(true)
    expect(typeof result.current.updateBrand).toBe('function')
    expect(typeof result.current.resetBrand).toBe('function')
    expect(typeof result.current.applyPreset).toBe('function')
  })
})

describe('BrandingProvider', () => {
  it('renders children', () => {
    mockInvoke.mockRejectedValue(new Error('not ready'))

    render(
      <BrandingProvider>
        <div data-testid="child">Hello</div>
      </BrandingProvider>,
    )
    expect(screen.getByTestId('child')).toBeDefined()
  })

  it('loads branding on mount and applies CSS variables', async () => {
    const config: BrandingConfig = {
      appName: 'TestApp',
      appTagline: 'Test tagline',
      wordmarkParts: ['Test', 'App', '!'],
      colorPrimary: '#FF0000',
      colorSecondary: '#00FF00',
      colorAccent: '#0000FF',
      colorAccentLight: '#5555FF',
      colorNeural: '#AABBCC',
      colorButtonPrimary: '#123456',
      colorButtonHover: '#654321',
      colorSidebarBg: '#111111',
      colorSidebarText: '#EEEEEE',
      colorNavActive: '#ABCDEF',
      lightPageBg: '#F0F0F0',
      lightCardBg: '#FFFFFF',
      lightBorder: '#CCCCCC',
      lightTextPrimary: '#000000',
      lightTextSecondary: '#555555',
      lightTextTertiary: '#999999',
      darkPageBg: '#1A1A1A',
      darkCardBg: '#2A2A2A',
      darkBorder: '#3A3A3A',
      darkTextPrimary: '#FAFAFA',
      darkTextSecondary: '#AAAAAA',
      darkTextTertiary: '#666666',
      colorMode: 'light',
      useCustomLogo: false,
      customLogoDataUrl: null,
      borderRadius: 'rounded',
    }
    mockInvoke.mockResolvedValueOnce(config)

    const { result } = renderHook(() => useBranding(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.brand.appName).toBe('TestApp')
    expect(result.current.isDark).toBe(false)

    const root = document.documentElement
    expect(root.style.getPropertyValue('--brand-primary')).toBe('#FF0000')
    expect(root.style.getPropertyValue('--brand-page-bg')).toBe('#F0F0F0') // light mode
    expect(root.style.getPropertyValue('--brand-radius')).toBe('0.75rem') // rounded
  })

  it('resolves isDark=true for dark colorMode', async () => {
    const config = {
      appName: 'Dark',
      appTagline: '',
      wordmarkParts: ['D', 'a', 'rk'],
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
      colorMode: 'dark',
      useCustomLogo: false,
      customLogoDataUrl: null,
      borderRadius: 'sharp',
    } as BrandingConfig
    mockInvoke.mockResolvedValueOnce(config)

    const { result } = renderHook(() => useBranding(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--brand-page-bg')).toBe('#111827') // dark bg
    expect(document.documentElement.style.getPropertyValue('--brand-radius')).toBe('0.25rem') // sharp
  })

  it('updateBrand calls IPC and updates state', async () => {
    const initial = {
      appName: 'ClearPathAI', appTagline: 'No code. No confusion. Just go.',
      wordmarkParts: ['Clear', 'Path', 'AI'],
      colorPrimary: '#5B4FC4', colorSecondary: '#7F77DD', colorAccent: '#1D9E75',
      colorAccentLight: '#5DCAA5', colorNeural: '#85B7EB',
      colorButtonPrimary: '#4F46E5', colorButtonHover: '#6366F1',
      colorSidebarBg: '#111827', colorSidebarText: '#9CA3AF', colorNavActive: '#4F46E5',
      lightPageBg: '#F3F4F6', lightCardBg: '#FFFFFF', lightBorder: '#E5E7EB',
      lightTextPrimary: '#111827', lightTextSecondary: '#6B7280', lightTextTertiary: '#9CA3AF',
      darkPageBg: '#111827', darkCardBg: '#1F2937', darkBorder: '#374151',
      darkTextPrimary: '#F9FAFB', darkTextSecondary: '#9CA3AF', darkTextTertiary: '#6B7280',
      colorMode: 'system' as const, useCustomLogo: false, customLogoDataUrl: null, borderRadius: 'rounded' as const,
    }
    mockInvoke.mockResolvedValueOnce(initial) // load

    const { result } = renderHook(() => useBranding(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const updated = { ...initial, appName: 'NewName' }
    mockInvoke.mockResolvedValueOnce(updated)

    await act(async () => {
      await result.current.updateBrand({ appName: 'NewName' })
    })

    expect(mockInvoke).toHaveBeenCalledWith('branding:set', { appName: 'NewName' })
    expect(result.current.brand.appName).toBe('NewName')
  })

  it('resetBrand calls IPC and restores defaults', async () => {
    const initial = {
      appName: 'Custom', appTagline: '', wordmarkParts: ['C', 'u', 's'],
      colorPrimary: '#FF0000', colorSecondary: '#7F77DD', colorAccent: '#1D9E75',
      colorAccentLight: '#5DCAA5', colorNeural: '#85B7EB',
      colorButtonPrimary: '#4F46E5', colorButtonHover: '#6366F1',
      colorSidebarBg: '#111827', colorSidebarText: '#9CA3AF', colorNavActive: '#4F46E5',
      lightPageBg: '#F3F4F6', lightCardBg: '#FFFFFF', lightBorder: '#E5E7EB',
      lightTextPrimary: '#111827', lightTextSecondary: '#6B7280', lightTextTertiary: '#9CA3AF',
      darkPageBg: '#111827', darkCardBg: '#1F2937', darkBorder: '#374151',
      darkTextPrimary: '#F9FAFB', darkTextSecondary: '#9CA3AF', darkTextTertiary: '#6B7280',
      colorMode: 'light' as const, useCustomLogo: false, customLogoDataUrl: null, borderRadius: 'rounded' as const,
    }
    mockInvoke.mockResolvedValueOnce(initial) // load

    const { result } = renderHook(() => useBranding(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const defaults = { ...initial, appName: 'ClearPathAI', colorPrimary: '#5B4FC4' }
    mockInvoke.mockResolvedValueOnce(defaults)

    await act(async () => {
      await result.current.resetBrand()
    })

    expect(mockInvoke).toHaveBeenCalledWith('branding:reset')
    expect(result.current.brand.appName).toBe('ClearPathAI')
  })

  it('applyPreset calls IPC and updates state', async () => {
    const initial = {
      appName: 'ClearPathAI', appTagline: '', wordmarkParts: ['C', 'P', 'AI'],
      colorPrimary: '#5B4FC4', colorSecondary: '#7F77DD', colorAccent: '#1D9E75',
      colorAccentLight: '#5DCAA5', colorNeural: '#85B7EB',
      colorButtonPrimary: '#4F46E5', colorButtonHover: '#6366F1',
      colorSidebarBg: '#111827', colorSidebarText: '#9CA3AF', colorNavActive: '#4F46E5',
      lightPageBg: '#F3F4F6', lightCardBg: '#FFFFFF', lightBorder: '#E5E7EB',
      lightTextPrimary: '#111827', lightTextSecondary: '#6B7280', lightTextTertiary: '#9CA3AF',
      darkPageBg: '#111827', darkCardBg: '#1F2937', darkBorder: '#374151',
      darkTextPrimary: '#F9FAFB', darkTextSecondary: '#9CA3AF', darkTextTertiary: '#6B7280',
      colorMode: 'system' as const, useCustomLogo: false, customLogoDataUrl: null, borderRadius: 'rounded' as const,
    }
    mockInvoke.mockResolvedValueOnce(initial) // load

    const { result } = renderHook(() => useBranding(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const presetResult = { ...initial, colorPrimary: '#00FF00' }
    mockInvoke.mockResolvedValueOnce(presetResult)

    await act(async () => {
      await result.current.applyPreset('green-theme')
    })

    expect(mockInvoke).toHaveBeenCalledWith('branding:apply-preset', { presetId: 'green-theme' })
    expect(result.current.brand.colorPrimary).toBe('#00FF00')
  })

  it('handles load failure gracefully', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC not ready'))

    const { result } = renderHook(() => useBranding(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Should have defaults
    expect(result.current.brand.appName).toBe('ClearPathAI')
  })

  it('applies pill border radius', async () => {
    const config = {
      appName: 'ClearPathAI', appTagline: '', wordmarkParts: ['C', 'P', 'AI'],
      colorPrimary: '#5B4FC4', colorSecondary: '#7F77DD', colorAccent: '#1D9E75',
      colorAccentLight: '#5DCAA5', colorNeural: '#85B7EB',
      colorButtonPrimary: '#4F46E5', colorButtonHover: '#6366F1',
      colorSidebarBg: '#111827', colorSidebarText: '#9CA3AF', colorNavActive: '#4F46E5',
      lightPageBg: '#F3F4F6', lightCardBg: '#FFFFFF', lightBorder: '#E5E7EB',
      lightTextPrimary: '#111827', lightTextSecondary: '#6B7280', lightTextTertiary: '#9CA3AF',
      darkPageBg: '#111827', darkCardBg: '#1F2937', darkBorder: '#374151',
      darkTextPrimary: '#F9FAFB', darkTextSecondary: '#9CA3AF', darkTextTertiary: '#6B7280',
      colorMode: 'light' as const, useCustomLogo: false, customLogoDataUrl: null, borderRadius: 'pill' as const,
    }
    mockInvoke.mockResolvedValueOnce(config)

    renderHook(() => useBranding(), { wrapper })

    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--brand-radius')).toBe('9999px')
    })
  })
})
