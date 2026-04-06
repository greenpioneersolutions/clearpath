export type FocusStyle = 'ring' | 'outline' | 'both'

export interface AccessibilitySettings {
  fontScale: number
  reducedMotion: boolean
  highContrast: boolean
  focusStyle: FocusStyle
  screenReaderMode: boolean
  keyboardShortcutsEnabled: boolean
}

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  fontScale: 1.0,
  reducedMotion: false,
  highContrast: false,
  focusStyle: 'ring',
  screenReaderMode: false,
  keyboardShortcutsEnabled: true,
}
