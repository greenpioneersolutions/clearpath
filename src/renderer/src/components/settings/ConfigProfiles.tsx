import { useState, useEffect, useCallback } from 'react'
import type { ConfigProfile } from '../../types/settings'

interface Props {
  onApply: () => void
}

export default function ConfigProfiles({ onApply }: Props): JSX.Element {
  const [profiles, setProfiles] = useState<ConfigProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showSave, setShowSave] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('settings:list-profiles') as ConfigProfile[]
    setProfiles(result)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    await window.electronAPI.invoke('settings:save-profile', {
      name: saveName.trim(),
      description: saveDesc.trim(),
    })
    setSaving(false)
    setShowSave(false)
    setSaveName('')
    setSaveDesc('')
    setMessage('Profile saved')
    setTimeout(() => setMessage(''), 2000)
    void load()
  }

  const handleLoad = async (id: string) => {
    const result = await window.electronAPI.invoke('settings:load-profile', { id }) as
      | { settings: unknown }
      | { error: string }
    if ('error' in result) {
      setMessage(`Error: ${result.error}`)
    } else {
      setMessage('Profile loaded')
      onApply()
    }
    setTimeout(() => setMessage(''), 2000)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete profile "${name}"?`)) return
    await window.electronAPI.invoke('settings:delete-profile', { id })
    void load()
  }

  const handleExport = async (id: string) => {
    const result = await window.electronAPI.invoke('settings:export-profile', { id }) as
      | { path: string }
      | { canceled?: boolean; error?: string }
    if ('path' in result) {
      setMessage(`Exported to ${result.path}`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const handleImport = async () => {
    const result = await window.electronAPI.invoke('settings:import-profile') as
      | { profile: ConfigProfile }
      | { canceled?: boolean; error?: string }
    if ('profile' in result) {
      setMessage(`Imported "${result.profile.name}"`)
      setTimeout(() => setMessage(''), 2000)
      void load()
    } else if ('error' in result && result.error) {
      setMessage(`Error: ${result.error}`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const isBuiltin = (p: ConfigProfile) => p.id.startsWith('builtin-')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Configuration Profiles</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Save, load, export, and import settings configurations
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void handleImport()}
            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Import
          </button>
          <button
            onClick={() => setShowSave(!showSave)}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {showSave ? 'Cancel' : 'Save Current'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`text-xs px-3 py-2 rounded-lg ${
          message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
        }`}>
          {message}
        </div>
      )}

      {/* Save form */}
      {showSave && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Profile Name</label>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. My Project Config"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={saveDesc}
              onChange={(e) => setSaveDesc(e.target.value)}
              placeholder="What this profile is for..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={() => void handleSave()}
            disabled={saving || !saveName.trim()}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      )}

      {/* Profile list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div key={profile.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{profile.name}</span>
                    {isBuiltin(profile) && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">starter</span>
                    )}
                  </div>
                  {profile.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{profile.description}</p>
                  )}
                  {profile.createdAt > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(profile.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => void handleLoad(profile.id)}
                    className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => void handleExport(profile.id)}
                    className="px-2.5 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Export
                  </button>
                  {!isBuiltin(profile) && (
                    <button
                      onClick={() => void handleDelete(profile.id, profile.name)}
                      className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
