import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccessibility } from '../contexts/AccessibilityContext'

const ROUTES = ['/', '/work', '/insights', '/pr-scores', '/configure'] as const

export function useKeyboardShortcuts(onShowHelp: () => void): void {
  const { settings } = useAccessibility()
  const navigate = useNavigate()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!settings.keyboardShortcutsEnabled) return

    const target = e.target as HTMLElement
    const inInput = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || target.isContentEditable

    const mod = e.metaKey || e.ctrlKey

    // ? — show keyboard shortcut help (only when not in input)
    if (e.key === '?' && !inInput && !mod) {
      e.preventDefault()
      onShowHelp()
      return
    }

    // Ctrl/Cmd + , — open Configure
    if (mod && e.key === ',') {
      e.preventDefault()
      navigate('/configure')
      return
    }

    // Ctrl/Cmd + / — focus message input on Work page
    if (mod && e.key === '/') {
      e.preventDefault()
      const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="Message input"]')
      textarea?.focus()
      return
    }

    // Ctrl/Cmd + 1-5 — navigate to route by index
    if (mod && e.key >= '1' && e.key <= '5') {
      const idx = parseInt(e.key) - 1
      if (idx < ROUTES.length) {
        e.preventDefault()
        navigate(ROUTES[idx])
      }
    }
  }, [settings.keyboardShortcutsEnabled, navigate, onShowHelp])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
