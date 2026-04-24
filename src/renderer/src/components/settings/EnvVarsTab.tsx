import { useState } from 'react'
import EnvVarsEditor from './EnvVarsEditor'

export default function EnvVarsTab(): JSX.Element {
  const [cli, setCli] = useState<'copilot' | 'claude'>('copilot')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">CLI:</span>
        {(['copilot', 'claude'] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCli(c)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              cli === c
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {c === 'copilot' ? 'Copilot' : 'Claude'}
          </button>
        ))}
      </div>

      <EnvVarsEditor cli={cli} />
    </div>
  )
}
