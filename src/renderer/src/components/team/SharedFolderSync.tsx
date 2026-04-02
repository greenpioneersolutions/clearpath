import { useState, useEffect, useCallback } from 'react'

interface SharedConfig {
  fileName: string
  name: string
  description: string
  path: string
  modifiedAt: number
}

export default function SharedFolderSync(): JSX.Element {
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [configs, setConfigs] = useState<SharedConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const path = await window.electronAPI.invoke('team:get-shared-folder') as string | null
    setFolderPath(path)
    if (path) {
      const list = await window.electronAPI.invoke('team:list-shared-configs') as SharedConfig[]
      setConfigs(list)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSetFolder = async () => {
    const result = await window.electronAPI.invoke('team:set-shared-folder') as
      | { path: string } | { canceled: boolean }
    if ('path' in result) {
      setFolderPath(result.path)
      void load()
    }
  }

  const handleClearFolder = async () => {
    await window.electronAPI.invoke('team:clear-shared-folder')
    setFolderPath(null)
    setConfigs([])
  }

  const handleApply = async (config: SharedConfig) => {
    const result = await window.electronAPI.invoke('team:apply-shared-config', { path: config.path }) as
      { success: boolean; error?: string }
    if (result.success) {
      setMessage(`Applied "${config.name}"`)
    } else {
      setMessage(`Error: ${result.error}`)
    }
    setTimeout(() => setMessage(''), 3000)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Shared Config Folder</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Point to a shared folder (network drive, Google Drive, git repo) to sync team configurations
        </p>
      </div>

      {message && (
        <div className={`text-xs px-3 py-2 rounded-lg ${
          message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
        }`}>{message}</div>
      )}

      {/* Folder selector */}
      <div className="flex items-center gap-3">
        {folderPath ? (
          <>
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500">Syncing from</p>
              <p className="text-sm font-mono text-gray-800 truncate">{folderPath}</p>
            </div>
            <button onClick={() => void handleClearFolder()}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors">
              Disconnect
            </button>
            <button onClick={() => void load()}
              className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors">
              Refresh
            </button>
          </>
        ) : (
          <button onClick={() => void handleSetFolder()}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            Select Shared Folder
          </button>
        )}
      </div>

      {/* Config files */}
      {folderPath && (
        loading ? (
          <div className="text-center text-gray-400 text-sm py-4">Loading...</div>
        ) : configs.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-lg p-6 text-center">
            <p className="text-sm text-gray-400">No .json config files found in this folder</p>
          </div>
        ) : (
          <div className="space-y-2">
            {configs.map((c) => (
              <div key={c.fileName} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900">{c.name}</span>
                  {c.description && <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.fileName} · {new Date(c.modifiedAt).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => void handleApply(c)}
                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex-shrink-0">
                  Apply
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
