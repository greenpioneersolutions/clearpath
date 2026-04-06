import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { DEFAULT_ACCESSIBILITY, type AccessibilitySettings, type FocusStyle } from '../types/accessibility'

interface AccessibilityContextValue {
  settings: AccessibilitySettings
  updateSetting: <K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => void
  resetAll: () => void
}

const AccessibilityContext = createContext<AccessibilityContextValue>({
  settings: DEFAULT_ACCESSIBILITY,
  updateSetting: () => {},
  resetAll: () => {},
})

export function useAccessibility(): AccessibilityContextValue {
  return useContext(AccessibilityContext)
}

const FOCUS_CLASSES = ['a11y-focus-ring', 'a11y-focus-outline', 'a11y-focus-both'] as const

function applyToDOM(s: AccessibilitySettings): void {
  const root = document.documentElement

  // Font scale
  root.style.fontSize = `${s.fontScale * 100}%`

  // Reduced motion
  root.classList.toggle('a11y-reduced-motion', s.reducedMotion)

  // High contrast
  root.classList.toggle('a11y-high-contrast', s.highContrast)

  // Focus style
  for (const cls of FOCUS_CLASSES) root.classList.remove(cls)
  root.classList.add(`a11y-focus-${s.focusStyle}`)

  // Screen reader mode
  root.classList.toggle('a11y-sr-mode', s.screenReaderMode)
}

export function AccessibilityProvider({ children }: { children: ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_ACCESSIBILITY)

  // Load on mount
  useEffect(() => {
    void (async () => {
      const saved = await window.electronAPI.invoke('accessibility:get') as AccessibilitySettings | null
      if (saved) {
        setSettings(saved)
        applyToDOM(saved)
      } else {
        applyToDOM(DEFAULT_ACCESSIBILITY)
      }
    })()
  }, [])

  // Sync with OS prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => {
      setSettings((prev) => {
        const next = { ...prev, reducedMotion: e.matches }
        applyToDOM(next)
        void window.electronAPI.invoke('accessibility:set', { reducedMotion: e.matches })
        return next
      })
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const updateSetting = useCallback(<K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      applyToDOM(next)
      void window.electronAPI.invoke('accessibility:set', { [key]: value })
      return next
    })
  }, [])

  const resetAll = useCallback(() => {
    setSettings(DEFAULT_ACCESSIBILITY)
    applyToDOM(DEFAULT_ACCESSIBILITY)
    void window.electronAPI.invoke('accessibility:reset')
  }, [])

  return (
    <AccessibilityContext.Provider value={{ settings, updateSetting, resetAll }}>
      {children}
    </AccessibilityContext.Provider>
  )
}
