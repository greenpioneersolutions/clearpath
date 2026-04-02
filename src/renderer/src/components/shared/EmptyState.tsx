interface Props {
  icon: string
  title: string
  description: string
  primaryAction?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
}

export default function EmptyState({ icon, title, description, primaryAction, secondaryAction }: Props): JSX.Element {
  return (
    <div className="text-center py-8 px-4">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-sm font-medium text-gray-700 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto leading-relaxed">{description}</p>
      {primaryAction && (
        <button onClick={primaryAction.onClick}
          className="px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          {primaryAction.label}
        </button>
      )}
      {secondaryAction && (
        <button onClick={secondaryAction.onClick}
          className="block mx-auto mt-2 text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
          {secondaryAction.label}
        </button>
      )}
    </div>
  )
}
