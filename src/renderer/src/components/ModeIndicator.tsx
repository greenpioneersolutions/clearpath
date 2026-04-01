export type SessionMode = 'normal' | 'plan' | 'autopilot'

export const MODE_CYCLE: SessionMode[] = ['normal', 'plan', 'autopilot']

const MODE_STYLES: Record<SessionMode, { label: string; classes: string }> = {
  normal: {
    label: 'Normal',
    classes: 'text-gray-400 bg-gray-700/60 border-gray-600',
  },
  plan: {
    label: 'Plan',
    classes: 'text-blue-300 bg-blue-900/40 border-blue-700',
  },
  autopilot: {
    label: 'Autopilot',
    classes: 'text-green-300 bg-green-900/40 border-green-700',
  },
}

interface Props {
  mode: SessionMode
  onToggle: () => void
}

export default function ModeIndicator({ mode, onToggle }: Props): JSX.Element {
  const { label, classes } = MODE_STYLES[mode]

  return (
    <button
      onClick={onToggle}
      title="Cycle mode: Normal → Plan → Autopilot (Shift+Tab)"
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${classes}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          mode === 'normal'
            ? 'bg-gray-400'
            : mode === 'plan'
              ? 'bg-blue-400'
              : 'bg-green-400'
        }`}
      />
      {label}
    </button>
  )
}
