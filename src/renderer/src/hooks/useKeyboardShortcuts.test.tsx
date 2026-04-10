// @vitest-environment jsdom
import { renderHook, act, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AccessibilityProvider } from '../contexts/AccessibilityContext'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import type { ReactNode } from 'react'
import type { AccessibilitySettings } from '../types/accessibility'

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn()

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

let currentPath = '/work'
function LocationSpy(): null {
  const location = useLocation()
  currentPath = location.pathname
  return null
}

/**
 * Build a wrapper that provides MemoryRouter + AccessibilityProvider.
 * electronAPI.invoke('accessibility:get') controls the settings the provider loads.
 */
function makeWrapper(overrides?: Partial<AccessibilitySettings>) {
  const settings = {
    fontScale: 1,
    reducedMotion: false,
    highContrast: false,
    focusStyle: 'ring' as const,
    screenReaderMode: false,
    keyboardShortcutsEnabled: true,
    ...overrides,
  }
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'accessibility:get') return Promise.resolve(settings)
    if (channel === 'accessibility:set') return Promise.resolve()
    if (channel === 'accessibility:reset') return Promise.resolve()
    return Promise.resolve(null)
  })

  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <MemoryRouter initialEntries={['/work']}>
        <LocationSpy />
        <AccessibilityProvider>
          {children}
        </AccessibilityProvider>
      </MemoryRouter>
    )
  }
}

beforeEach(() => {
  currentPath = '/work'
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn() },
    writable: true,
    configurable: true,
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

afterEach(() => {
  cleanup()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useKeyboardShortcuts', () => {
  it('calls onShowHelp when ? is pressed', () => {
    const wrapper = makeWrapper()
    const onHelp = vi.fn()
    renderHook(() => useKeyboardShortcuts(onHelp), { wrapper })

    fireKey('?')
    expect(onHelp).toHaveBeenCalledOnce()
  })

  it('does not call onShowHelp when ? is pressed with Ctrl', () => {
    const wrapper = makeWrapper()
    const onHelp = vi.fn()
    renderHook(() => useKeyboardShortcuts(onHelp), { wrapper })

    fireKey('?', { ctrlKey: true })
    expect(onHelp).not.toHaveBeenCalled()
  })

  it('navigates to /configure on Ctrl+,', () => {
    const wrapper = makeWrapper()
    renderHook(() => useKeyboardShortcuts(vi.fn()), { wrapper })

    act(() => { fireKey(',', { ctrlKey: true }) })
    expect(currentPath).toBe('/configure')
  })

  it('navigates to /configure on Meta+,', () => {
    const wrapper = makeWrapper()
    renderHook(() => useKeyboardShortcuts(vi.fn()), { wrapper })

    act(() => { fireKey(',', { metaKey: true }) })
    expect(currentPath).toBe('/configure')
  })

  it('focuses message input on Ctrl+/', () => {
    const textarea = document.createElement('textarea')
    textarea.setAttribute('aria-label', 'Message input')
    document.body.appendChild(textarea)
    const focusSpy = vi.spyOn(textarea, 'focus')

    const wrapper = makeWrapper()
    renderHook(() => useKeyboardShortcuts(vi.fn()), { wrapper })

    fireKey('/', { ctrlKey: true })
    expect(focusSpy).toHaveBeenCalled()

    document.body.removeChild(textarea)
  })

  it.each([
    ['1', '/'],
    ['2', '/work'],
    ['3', '/insights'],
    ['4', '/pr-scores'],
    ['5', '/configure'],
  ] as const)('navigates to route on Ctrl+%s', (key, route) => {
    const wrapper = makeWrapper()
    renderHook(() => useKeyboardShortcuts(vi.fn()), { wrapper })

    act(() => { fireKey(key, { ctrlKey: true }) })
    expect(currentPath).toBe(route)
  })

  it('does not navigate for Ctrl+6 and above', () => {
    const wrapper = makeWrapper()
    renderHook(() => useKeyboardShortcuts(vi.fn()), { wrapper })

    act(() => { fireKey('6', { ctrlKey: true }) })
    expect(currentPath).toBe('/work')
  })

  it('does nothing when shortcuts are disabled', async () => {
    const wrapper = makeWrapper({ keyboardShortcutsEnabled: false })
    const onHelp = vi.fn()
    renderHook(() => useKeyboardShortcuts(onHelp), { wrapper })

    // Wait for AccessibilityProvider to load settings from electronAPI
    // and re-render the hook with keyboardShortcutsEnabled: false
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('accessibility:get')
    })

    // Allow React to flush the state update from the async load
    await act(async () => {})

    fireKey('?')
    fireKey(',', { ctrlKey: true })
    fireKey('1', { ctrlKey: true })

    expect(onHelp).not.toHaveBeenCalled()
    expect(currentPath).toBe('/work')
  })

  it('does not fire ? when typing in an input', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const wrapper = makeWrapper()
    const onHelp = vi.fn()
    renderHook(() => useKeyboardShortcuts(onHelp), { wrapper })

    const event = new KeyboardEvent('keydown', { key: '?', bubbles: true })
    Object.defineProperty(event, 'target', { value: input })
    document.dispatchEvent(event)

    expect(onHelp).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('cleans up listener on unmount', () => {
    const wrapper = makeWrapper()
    const onHelp = vi.fn()
    const { unmount } = renderHook(() => useKeyboardShortcuts(onHelp), { wrapper })

    unmount()
    fireKey('?')
    expect(onHelp).not.toHaveBeenCalled()
  })
})
