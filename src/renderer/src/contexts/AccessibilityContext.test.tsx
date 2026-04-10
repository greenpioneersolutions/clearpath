// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { AccessibilityProvider, useAccessibility } from './AccessibilityContext'
import { DEFAULT_ACCESSIBILITY } from '../types/accessibility'
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
  // Mock matchMedia (needed for prefers-reduced-motion listener)
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
  // Default: no saved settings
  mockInvoke.mockResolvedValue(null)
})

afterEach(() => {
  // Clean up DOM class/style changes
  document.documentElement.removeAttribute('style')
  document.documentElement.className = ''
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <AccessibilityProvider>{children}</AccessibilityProvider>
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAccessibility (default context)', () => {
  it('returns DEFAULT_ACCESSIBILITY settings when used outside provider', () => {
    const { result } = renderHook(() => useAccessibility())

    expect(result.current.settings).toEqual(DEFAULT_ACCESSIBILITY)
    expect(typeof result.current.updateSetting).toBe('function')
    expect(typeof result.current.resetAll).toBe('function')
  })
})

describe('AccessibilityProvider', () => {
  it('renders children', () => {
    render(
      <AccessibilityProvider>
        <div data-testid="child">Hello</div>
      </AccessibilityProvider>,
    )
    expect(screen.getByTestId('child')).toBeDefined()
  })

  it('loads saved settings on mount', async () => {
    const saved = { ...DEFAULT_ACCESSIBILITY, fontScale: 1.5, highContrast: true }
    mockInvoke.mockResolvedValueOnce(saved)

    const { result } = renderHook(() => useAccessibility(), { wrapper })

    // Wait for async load
    await vi.waitFor(() => {
      expect(result.current.settings.fontScale).toBe(1.5)
    })
    expect(result.current.settings.highContrast).toBe(true)
    expect(mockInvoke).toHaveBeenCalledWith('accessibility:get')
  })

  it('applies default DOM styles when no saved settings', async () => {
    mockInvoke.mockResolvedValueOnce(null)

    renderHook(() => useAccessibility(), { wrapper })

    await vi.waitFor(() => {
      expect(document.documentElement.style.fontSize).toBe('100%')
    })
  })

  it('updateSetting updates state and calls IPC', async () => {
    mockInvoke.mockResolvedValueOnce(null) // initial load

    const { result } = renderHook(() => useAccessibility(), { wrapper })

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('accessibility:get')
    })

    act(() => {
      result.current.updateSetting('highContrast', true)
    })

    expect(result.current.settings.highContrast).toBe(true)
    expect(mockInvoke).toHaveBeenCalledWith('accessibility:set', { highContrast: true })
    expect(document.documentElement.classList.contains('a11y-high-contrast')).toBe(true)
  })

  it('updateSetting applies font scale to DOM', async () => {
    mockInvoke.mockResolvedValueOnce(null)

    const { result } = renderHook(() => useAccessibility(), { wrapper })

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('accessibility:get')
    })

    act(() => {
      result.current.updateSetting('fontScale', 1.25)
    })

    expect(document.documentElement.style.fontSize).toBe('125%')
  })

  it('resetAll restores defaults and calls IPC', async () => {
    const saved = { ...DEFAULT_ACCESSIBILITY, highContrast: true, fontScale: 2 }
    mockInvoke.mockResolvedValueOnce(saved)

    const { result } = renderHook(() => useAccessibility(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.settings.highContrast).toBe(true)
    })

    act(() => {
      result.current.resetAll()
    })

    expect(result.current.settings).toEqual(DEFAULT_ACCESSIBILITY)
    expect(mockInvoke).toHaveBeenCalledWith('accessibility:reset')
  })

  it('applies focus style class to DOM', async () => {
    const saved = { ...DEFAULT_ACCESSIBILITY, focusStyle: 'both' as const }
    mockInvoke.mockResolvedValueOnce(saved)

    renderHook(() => useAccessibility(), { wrapper })

    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains('a11y-focus-both')).toBe(true)
    })
  })

  it('applies reduced motion class to DOM', async () => {
    const saved = { ...DEFAULT_ACCESSIBILITY, reducedMotion: true }
    mockInvoke.mockResolvedValueOnce(saved)

    renderHook(() => useAccessibility(), { wrapper })

    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains('a11y-reduced-motion')).toBe(true)
    })
  })

  it('applies screen reader mode class to DOM', async () => {
    const saved = { ...DEFAULT_ACCESSIBILITY, screenReaderMode: true }
    mockInvoke.mockResolvedValueOnce(saved)

    renderHook(() => useAccessibility(), { wrapper })

    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains('a11y-sr-mode')).toBe(true)
    })
  })
})
