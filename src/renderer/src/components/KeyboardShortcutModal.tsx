import { useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'

const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'Ctrl/Cmd + 1', action: 'Go to Home' },
      { keys: 'Ctrl/Cmd + 2', action: 'Go to Work' },
      { keys: 'Ctrl/Cmd + 3', action: 'Go to Insights' },
      { keys: 'Ctrl/Cmd + 4', action: 'Go to PR Scores' },
      { keys: 'Ctrl/Cmd + 5', action: 'Go to Configure' },
      { keys: 'Ctrl/Cmd + ,', action: 'Open Configure' },
    ],
  },
  {
    title: 'Work Page',
    shortcuts: [
      { keys: 'Ctrl/Cmd + /', action: 'Focus message input' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: '?', action: 'Show this shortcut reference' },
      { keys: 'Escape', action: 'Close modal or panel' },
      { keys: 'Tab / Shift+Tab', action: 'Move between controls' },
      { keys: 'Enter / Space', action: 'Activate buttons and links' },
      { keys: 'Arrow Keys', action: 'Navigate menus and autocomplete' },
    ],
  },
]

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function KeyboardShortcutModal({ isOpen, onClose }: Props): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, isOpen)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-shortcut-title"
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="kb-shortcut-title" className="text-lg font-bold text-gray-900">Keyboard Shortcuts</h2>
          <button onClick={onClose} aria-label="Close keyboard shortcuts" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{group.title}</h3>
              <table className="w-full text-sm" aria-label={`${group.title} shortcuts`}>
                <tbody>
                  {group.shortcuts.map((s) => (
                    <tr key={s.keys} className="border-b border-gray-50">
                      <td className="py-1.5 pr-4">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs font-mono text-gray-700">{s.keys}</kbd>
                      </td>
                      <td className="py-1.5 text-gray-600">{s.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-3 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">Manage shortcuts in Configure &gt; Accessibility</p>
        </div>
      </div>
    </div>
  )
}
