import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface LocationsHealth {
  defaultWorkingDir: { path: string; exists: boolean } | null
  approvedFolders: Array<{ exists: boolean }>
  sourceFolders: Array<{ exists: boolean }>
}

interface Counts { skills: number; agents: number; plugins: number }

/**
 * Compact Home card summarizing the user's local setup: whether a working
 * folder is anchored and how many skills/agents/plugins ClearPath found. Links
 * into Configure → Local Setup for the full surface. Renders nothing until the
 * health probe returns so it never flashes empty.
 */
export default function LocalSetupCard(): JSX.Element | null {
  const navigate = useNavigate()
  const [health, setHealth] = useState<LocationsHealth | null>(null)
  const [counts, setCounts] = useState<Counts>({ skills: 0, agents: 0, plugins: 0 })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const h = await window.electronAPI.invoke('locations:health') as LocationsHealth | null
        if (cancelled) return
        setHealth(h ?? { defaultWorkingDir: null, approvedFolders: [], sourceFolders: [] })
      } catch {
        if (!cancelled) setHealth({ defaultWorkingDir: null, approvedFolders: [], sourceFolders: [] })
      }
      try {
        const cwd = (await window.electronAPI.invoke('app:get-cwd') as string | null) ?? ''
        const [skills, agents, plugins] = await Promise.all([
          window.electronAPI.invoke('skills:list', { workingDirectory: cwd }) as Promise<unknown[] | null>,
          window.electronAPI.invoke('agent:list', { workingDir: cwd || undefined }) as Promise<{ copilot?: unknown[]; claude?: unknown[] } | null>,
          window.electronAPI.invoke('plugins:list') as Promise<unknown[] | null>,
        ])
        if (cancelled) return
        setCounts({
          skills: Array.isArray(skills) ? skills.length : 0,
          agents: (agents?.copilot?.length ?? 0) + (agents?.claude?.length ?? 0),
          plugins: Array.isArray(plugins) ? plugins.length : 0,
        })
      } catch { /* counts stay at 0 */ }
    })()
    return () => { cancelled = true }
  }, [])

  if (!health) return null

  const hasWorkingFolder = !!health.defaultWorkingDir?.exists
  const workingLabel = hasWorkingFolder
    ? health.defaultWorkingDir!.path
    : 'No working folder set'

  return (
    <button
      data-testid="home-local-setup-card"
      onClick={() => navigate('/configure?tab=local-setup')}
      className="w-full text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all group flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100">
        <span className="text-xl">📁</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Your local setup</h3>
          {!hasWorkingFolder && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
              Action needed
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1 truncate" title={workingLabel}>
          {hasWorkingFolder ? `Working folder: ${workingLabel}` : 'Point the AI at your code so it can read your files.'}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {counts.skills} skills · {counts.agents} agents · {counts.plugins} plugins found
        </p>
      </div>
      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
