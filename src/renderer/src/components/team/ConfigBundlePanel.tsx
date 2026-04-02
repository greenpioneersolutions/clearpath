import { useState } from 'react'

export default function ConfigBundlePanel(): JSX.Element {
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)

  const handleExport = async () => {
    setWorking(true)
    const path = await window.electronAPI.invoke('team:export-bundle') as string | null
    setWorking(false)
    if (path) {
      setMessage(`Exported to ${path}`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const handleImport = async () => {
    setWorking(true)
    const result = await window.electronAPI.invoke('team:import-bundle') as { success: boolean; error?: string }
    setWorking(false)
    if (result.success) {
      setMessage('Config imported successfully — restart app to apply')
      setTimeout(() => setMessage(''), 5000)
    } else if (result.error) {
      setMessage(`Error: ${result.error}`)
      setTimeout(() => setMessage(''), 4000)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Configuration Bundle</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Export or import your entire configuration — settings, agents, templates, and profiles — as a single file
        </p>
      </div>

      {message && (
        <div className={`text-xs px-3 py-2 rounded-lg ${
          message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
        }`}>{message}</div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => void handleExport()}
          disabled={working}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all"
        >
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-800">Export Bundle</div>
            <div className="text-xs text-gray-500">Save all config to .json</div>
          </div>
        </button>

        <button
          onClick={() => void handleImport()}
          disabled={working}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all"
        >
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-800">Import Bundle</div>
            <div className="text-xs text-gray-500">Load config from .json</div>
          </div>
        </button>
      </div>
    </div>
  )
}
