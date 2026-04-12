import { useState, useEffect } from 'react'
import { useExtensions, type InstalledExtension, type RequirementCheckResult } from '../../hooks/useExtensions'

/** Human-readable permission labels. */
const PERMISSION_LABELS: Record<string, string> = {
  'integration:github:read': 'Read your GitHub repositories, pull requests, and issues',
  'integration:github:write': 'Create and modify pull requests, issues, and comments on GitHub',
  'notifications:emit': 'Send you notifications',
  'storage': 'Store data locally (up to 5 MB)',
  'env:read': 'Read non-sensitive environment variable names',
  'http:fetch': 'Make network requests to declared domains',
  'navigation': 'Navigate the app programmatically',
  'compliance:log': 'Write entries to the audit log',
}

export default function ExtensionManager(): JSX.Element {
  const { extensions, loading, error, refresh, toggle, uninstall, install, updatePermissions, checkRequirements } =
    useExtensions()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [requirementResults, setRequirementResults] = useState<Record<string, RequirementCheckResult>>({})

  const selectedExt = extensions.find((e) => e.manifest.id === selectedId)

  // Check requirements for all extensions that have them
  useEffect(() => {
    async function checkAll() {
      const results: Record<string, RequirementCheckResult> = {}
      for (const ext of extensions) {
        if (ext.manifest.requires && ext.manifest.requires.length > 0) {
          results[ext.manifest.id] = await checkRequirements(ext.manifest.id)
        }
      }
      setRequirementResults(results)
    }
    if (extensions.length > 0) checkAll()
  }, [extensions, checkRequirements])

  async function handleToggle(ext: InstalledExtension) {
    try {
      setActionError(null)
      await toggle(ext.manifest.id, !ext.enabled)
    } catch (err) {
      setActionError(String(err))
    }
  }

  async function handleUninstall(ext: InstalledExtension) {
    if (!confirm(`Uninstall "${ext.manifest.name}"? This will remove the extension and all its data.`)) {
      return
    }
    try {
      setActionError(null)
      setSelectedId(null)
      await uninstall(ext.manifest.id)
    } catch (err) {
      setActionError(String(err))
    }
  }

  async function handleInstall() {
    try {
      setActionError(null)
      await install()
    } catch (err) {
      setActionError(String(err))
    }
  }

  async function handleGrantAll(ext: InstalledExtension) {
    try {
      setActionError(null)
      const ungrantedPerms = ext.manifest.permissions.filter(
        (p) => !ext.grantedPermissions.includes(p),
      )
      if (ungrantedPerms.length > 0) {
        await updatePermissions(ext.manifest.id, ungrantedPerms, [])
      }
    } catch (err) {
      setActionError(String(err))
    }
  }

  async function handleRevokePermission(ext: InstalledExtension, perm: string) {
    try {
      setActionError(null)
      await updatePermissions(ext.manifest.id, [], [perm])
    } catch (err) {
      setActionError(String(err))
    }
  }

  async function handleGrantPermission(ext: InstalledExtension, perm: string) {
    try {
      setActionError(null)
      await updatePermissions(ext.manifest.id, [perm], [])
    } catch (err) {
      setActionError(String(err))
    }
  }

  if (loading) {
    return <div className="p-6 text-gray-400">Loading extensions...</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Extensions</h2>
          <p className="text-sm text-gray-400 mt-1">
            Manage installed extensions. Enable, disable, or configure permissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh()}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
          >
            Refresh
          </button>
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded"
          >
            Install Extension
          </button>
        </div>
      </div>

      {/* Error display */}
      {(error || actionError) && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 px-4 py-2 rounded text-sm">
          {error || actionError}
        </div>
      )}

      {/* Extension list */}
      {extensions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No extensions installed</p>
          <p className="text-sm mt-1">Click &quot;Install Extension&quot; to add one.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {extensions.map((ext) => (
            <div
              key={ext.manifest.id}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                selectedId === ext.manifest.id
                  ? 'border-indigo-500 bg-indigo-900/20'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
              onClick={() => setSelectedId(selectedId === ext.manifest.id ? null : ext.manifest.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Extension icon placeholder */}
                  <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center text-gray-400 text-lg font-bold">
                    {ext.manifest.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{ext.manifest.name}</span>
                      <span className="text-xs text-gray-500">v{ext.manifest.version}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          ext.source === 'bundled'
                            ? 'bg-blue-900/50 text-blue-300'
                            : 'bg-green-900/50 text-green-300'
                        }`}
                      >
                        {ext.source}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">{ext.manifest.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  {requirementResults[ext.manifest.id] && !requirementResults[ext.manifest.id].met && (
                    <span className="text-xs text-amber-400 flex items-center gap-1" title="Missing required integrations">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      Setup needed
                    </span>
                  )}
                  {ext.errorCount > 0 && (
                    <span className="text-xs text-yellow-400" title={ext.lastError ?? ''}>
                      {ext.errorCount} error{ext.errorCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {/* Toggle switch */}
                  <button
                    onClick={() => handleToggle(ext)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      ext.enabled ? 'bg-indigo-600' : 'bg-gray-600'
                    }`}
                    title={ext.enabled ? 'Disable' : 'Enable'}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                        ext.enabled ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Expanded detail panel */}
              {selectedId === ext.manifest.id && (
                <div className="mt-4 pt-4 border-t border-gray-700 space-y-4">
                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <div className="text-gray-500">Author</div>
                    <div className="text-gray-300">{ext.manifest.author}</div>
                    <div className="text-gray-500">ID</div>
                    <div className="text-gray-400 font-mono text-xs">{ext.manifest.id}</div>
                    <div className="text-gray-500">Installed</div>
                    <div className="text-gray-300">{new Date(ext.installedAt).toLocaleDateString()}</div>
                    <div className="text-gray-500">Source</div>
                    <div className="text-gray-300">{ext.source === 'bundled' ? 'Bundled with app' : 'User installed'}</div>
                  </div>

                  {/* Requirements */}
                  {requirementResults[ext.manifest.id] && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-300 mb-2">Requirements</h4>
                      <div className="space-y-1.5">
                        {requirementResults[ext.manifest.id].results.map((req) => (
                          <div
                            key={req.integration}
                            className={`flex items-center justify-between text-sm rounded px-3 py-2 ${
                              req.met ? 'bg-green-900/20 border border-green-800/30' : 'bg-amber-900/20 border border-amber-800/30'
                            }`}
                          >
                            <div>
                              <span className={req.met ? 'text-green-300' : 'text-amber-300'}>
                                {req.label}
                              </span>
                              {!req.met && (
                                <p className="text-xs text-amber-400/70 mt-0.5">{req.message}</p>
                              )}
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              req.met ? 'bg-green-900/50 text-green-300' : 'bg-amber-900/50 text-amber-300'
                            }`}>
                              {req.met ? 'Connected' : 'Not connected'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Permissions */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-300">Permissions</h4>
                      {ext.manifest.permissions.some((p) => !ext.grantedPermissions.includes(p)) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleGrantAll(ext)
                          }}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          Grant all
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {ext.manifest.permissions.map((perm) => {
                        const granted = ext.grantedPermissions.includes(perm)
                        return (
                          <div
                            key={perm}
                            className="flex items-center justify-between text-sm bg-gray-800 rounded px-3 py-1.5"
                          >
                            <span className="text-gray-300">
                              {PERMISSION_LABELS[perm] ?? perm}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (granted) {
                                  handleRevokePermission(ext, perm)
                                } else {
                                  handleGrantPermission(ext, perm)
                                }
                              }}
                              className={`text-xs px-2 py-0.5 rounded ${
                                granted
                                  ? 'bg-green-900/50 text-green-300 hover:bg-red-900/50 hover:text-red-300'
                                  : 'bg-gray-700 text-gray-400 hover:bg-green-900/50 hover:text-green-300'
                              }`}
                            >
                              {granted ? 'Granted' : 'Denied'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  {ext.source === 'user' && (
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUninstall(ext)
                        }}
                        className="px-3 py-1.5 text-sm bg-red-900/50 hover:bg-red-800 text-red-300 rounded"
                      >
                        Uninstall
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
