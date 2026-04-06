import { useAccessibility } from '../../contexts/AccessibilityContext'
import type { FocusStyle } from '../../types/accessibility'

const FOCUS_OPTIONS: { value: FocusStyle; label: string; description: string }[] = [
  { value: 'ring', label: 'Ring', description: 'Glowing ring around focused element' },
  { value: 'outline', label: 'Outline', description: 'Solid outline around focused element' },
  { value: 'both', label: 'Both', description: 'Ring and outline combined for maximum visibility' },
]

const SHORTCUTS = [
  { keys: '?', action: 'Show keyboard shortcuts' },
  { keys: 'Ctrl/Cmd + ,', action: 'Open Configure' },
  { keys: 'Ctrl/Cmd + /', action: 'Focus message input' },
  { keys: 'Ctrl/Cmd + 1–5', action: 'Navigate to screen (Home, Work, Insights, PR Scores, Configure)' },
  { keys: 'Escape', action: 'Close modal or panel' },
  { keys: 'Tab / Shift+Tab', action: 'Move between controls' },
  { keys: 'Enter / Space', action: 'Activate buttons and links' },
  { keys: 'Arrow Keys', action: 'Navigate menus and autocomplete' },
]

function Toggle({ id, label, description, checked, onChange }: {
  id: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-gray-900 cursor-pointer">{label}</label>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={`Toggle ${label}`}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-indigo-600' : 'bg-gray-300'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
    </div>
  )
}

export default function AccessibilitySettings(): JSX.Element {
  const { settings, updateSetting, resetAll } = useAccessibility()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Accessibility</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Customize the app for your needs. These settings help with screen readers, keyboard navigation, visual comfort, and motion sensitivity.
        </p>
      </div>

      {/* Font Scaling */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3" aria-labelledby="a11y-font-heading">
        <h2 id="a11y-font-heading" className="text-sm font-semibold text-gray-900">Font Scaling</h2>
        <p className="text-xs text-gray-500">Adjust text size across the entire app. Default is 100%.</p>
        <div className="flex items-center gap-4">
          <label htmlFor="a11y-font-scale" className="text-xs text-gray-500 w-8 flex-shrink-0">
            {Math.round(settings.fontScale * 100)}%
          </label>
          <input
            id="a11y-font-scale"
            type="range"
            min={0.85}
            max={1.5}
            step={0.05}
            value={settings.fontScale}
            onChange={(e) => updateSetting('fontScale', parseFloat(e.target.value))}
            className="flex-1"
            aria-label="Font scale percentage"
          />
        </div>
        <p className="text-xs text-gray-400" style={{ fontSize: `${settings.fontScale}rem` }}>
          Preview: The quick brown fox jumps over the lazy dog.
        </p>
      </section>

      {/* Toggles */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 divide-y divide-gray-100" aria-labelledby="a11y-visual-heading">
        <h2 id="a11y-visual-heading" className="text-sm font-semibold text-gray-900 pb-3">Visual & Motion</h2>

        <Toggle
          id="a11y-reduced-motion"
          label="Reduced Motion"
          description="Disable all animations and transitions. Automatically syncs with your system's motion preference."
          checked={settings.reducedMotion}
          onChange={(v) => updateSetting('reducedMotion', v)}
        />

        <Toggle
          id="a11y-high-contrast"
          label="High Contrast"
          description="Increase text and border contrast for better readability in both light and dark mode."
          checked={settings.highContrast}
          onChange={(v) => updateSetting('highContrast', v)}
        />

        <Toggle
          id="a11y-sr-mode"
          label="Screen Reader Mode"
          description="Add extra hidden labels and more verbose status announcements for screen reader users."
          checked={settings.screenReaderMode}
          onChange={(v) => updateSetting('screenReaderMode', v)}
        />
      </section>

      {/* Focus Indicators */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3" aria-labelledby="a11y-focus-heading">
        <h2 id="a11y-focus-heading" className="text-sm font-semibold text-gray-900">Focus Indicators</h2>
        <p className="text-xs text-gray-500">Choose how focused elements are highlighted when navigating with keyboard.</p>
        <div role="radiogroup" aria-label="Focus indicator style" className="flex gap-3">
          {FOCUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="radio"
              aria-checked={settings.focusStyle === opt.value}
              onClick={() => updateSetting('focusStyle', opt.value)}
              className={`flex-1 px-4 py-3 rounded-lg border text-left transition-all ${
                settings.focusStyle === opt.value
                  ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className={`text-sm font-medium ${settings.focusStyle === opt.value ? 'text-indigo-700' : 'text-gray-800'}`}>
                {opt.label}
              </span>
              <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3" aria-labelledby="a11y-kb-heading">
        <div className="flex items-center justify-between">
          <h2 id="a11y-kb-heading" className="text-sm font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button
            role="switch"
            aria-checked={settings.keyboardShortcutsEnabled}
            aria-label="Toggle keyboard shortcuts"
            onClick={() => updateSetting('keyboardShortcutsEnabled', !settings.keyboardShortcutsEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              settings.keyboardShortcutsEnabled ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              settings.keyboardShortcutsEnabled ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        <table className="w-full text-sm" aria-label="Keyboard shortcut reference">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th scope="col" className="pb-2 font-medium">Shortcut</th>
              <th scope="col" className="pb-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys} className="border-b border-gray-50">
                <td className="py-2">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs font-mono text-gray-700">{s.keys}</kbd>
                </td>
                <td className="py-2 text-gray-600">{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Reset */}
      <div className="flex justify-end">
        <button
          onClick={resetAll}
          aria-label="Reset all accessibility settings to defaults"
          className="px-4 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}
