import { useState } from 'react'
import type { AgentProfile } from '../types/ipc'

interface Props {
  profiles: AgentProfile[]
  enabledAgentIds: string[]
  onApply: (profileId: string) => void
  onSave: (name: string) => void
  onDelete: (profileId: string) => void
}

export function ProfileManager({
  profiles,
  enabledAgentIds,
  onApply,
  onSave,
  onDelete,
}: Props): JSX.Element {
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = () => {
    const name = newName.trim()
    if (!name) { setSaveError('Name is required'); return }
    setSaveError(null)
    onSave(name)
    setNewName('')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Profiles</h3>

      {/* Saved profiles list */}
      {profiles.length === 0 ? (
        <p className="text-xs text-gray-400 mb-4">
          No profiles yet. Save your current toggle state as a named preset.
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{profile.name}</p>
                <p className="text-xs text-gray-400">
                  {profile.enabledAgentIds.length} agent
                  {profile.enabledAgentIds.length !== 1 ? 's' : ''} enabled
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => onApply(profile.id)}
                  className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                >
                  Apply
                </button>
                {confirmDeleteId === profile.id ? (
                  <>
                    <button
                      onClick={() => {
                        onDelete(profile.id)
                        setConfirmDeleteId(null)
                      }}
                      className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-md"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(profile.id)}
                    className="text-xs px-2 py-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save current state */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-500 mb-2">
          Save current toggle state ({enabledAgentIds.length} enabled) as a preset
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setSaveError(null) }}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Profile name…"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            onClick={handleSave}
            className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            Save
          </button>
        </div>
        {saveError && <p className="text-xs text-red-500 mt-1">{saveError}</p>}
      </div>
    </div>
  )
}
