import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// ── Types (mirror main's LocationsManager + discovery handlers) ──────────────--

interface ApprovedFolderHealth {
  id: string
  label: string
  path: string
  addedAt: number
  exists: boolean
}

interface LocationsHealth {
  defaultWorkingDir: { path: string; exists: boolean } | null
  approvedFolders: ApprovedFolderHealth[]
  sourceFolders: Array<{ path: string; exists: boolean }>
}

interface SkillRow { scope: string; dirPath: string }
interface AgentRow { filePath?: string }
interface AgentListResult { copilot: AgentRow[]; claude: AgentRow[] }
interface PluginRow { path: string; cli: string; source: string }

interface DiscoverySummary {
  skills: { count: number; locations: string[] }
  agents: { count: number; locations: string[] }
  plugins: { count: number; locations: string[] }
}

const EMPTY_HEALTH: LocationsHealth = { defaultWorkingDir: null, approvedFolders: [], sourceFolders: [] }
const EMPTY_DISCOVERY: DiscoverySummary = {
  skills: { count: 0, locations: [] },
  agents: { count: 0, locations: [] },
  plugins: { count: 0, locations: [] },
}

/** Parent directory of a file/dir path, for "where found" grouping. */
function parentDir(p: string): string {
  const norm = p.replace(/[\\/]+$/, '')
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'))
  return idx > 0 ? norm.slice(0, idx) : norm
}

function uniqueTop(paths: string[], limit = 4): string[] {
  return Array.from(new Set(paths)).slice(0, limit)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LocalSetup(): JSX.Element {
  const navigate = useNavigate()
  const [health, setHealth] = useState<LocationsHealth>(EMPTY_HEALTH)
  const [discovery, setDiscovery] = useState<DiscoverySummary>(EMPTY_DISCOVERY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadHealth = useCallback(async () => {
    try {
      const h = await window.electronAPI.invoke('locations:health') as LocationsHealth | null
      setHealth(h ?? EMPTY_HEALTH)
    } catch {
      setHealth(EMPTY_HEALTH)
    }
  }, [])

  const loadDiscovery = useCallback(async () => {
    try {
      const cwd = (await window.electronAPI.invoke('app:get-cwd') as string | null) ?? ''
      const [skills, agents, plugins] = await Promise.all([
        window.electronAPI.invoke('skills:list', { workingDirectory: cwd }) as Promise<SkillRow[] | null>,
        window.electronAPI.invoke('agent:list', { workingDir: cwd || undefined }) as Promise<AgentListResult | null>,
        window.electronAPI.invoke('plugins:list') as Promise<PluginRow[] | null>,
      ])
      const skillRows = Array.isArray(skills) ? skills : []
      const agentRows = [...(agents?.copilot ?? []), ...(agents?.claude ?? [])]
      const pluginRows = Array.isArray(plugins) ? plugins : []
      setDiscovery({
        skills: { count: skillRows.length, locations: uniqueTop(skillRows.map((s) => parentDir(s.dirPath))) },
        agents: { count: agentRows.length, locations: uniqueTop(agentRows.map((a) => parentDir(a.filePath ?? ''))) },
        plugins: { count: pluginRows.length, locations: uniqueTop(pluginRows.map((p) => parentDir(p.path))) },
      })
    } catch {
      setDiscovery(EMPTY_DISCOVERY)
    }
  }, [])

  const refresh = useCallback(async () => {
    setBusy(true)
    await Promise.all([loadHealth(), loadDiscovery()])
    setBusy(false)
  }, [loadHealth, loadDiscovery])

  useEffect(() => { void refresh() }, [refresh])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const setWorkingFolder = async () => {
    setError(null)
    const res = await window.electronAPI.invoke('locations:add-approved') as
      | { entry?: { path: string }; canceled?: boolean; error?: string } | null
    if (!res || res.canceled) return
    if (res.error) { setError(res.error); return }
    if (res.entry) await window.electronAPI.invoke('locations:set-default-cwd', { path: res.entry.path })
    await refresh()
  }

  // Clear the saved working folder. Sessions then fall back to the app's own
  // launch directory — the built-in default — without the user hunting for a
  // path they can't see in a packaged build.
  const resetWorkingFolder = async () => {
    setError(null)
    await window.electronAPI.invoke('locations:set-default-cwd', { path: null })
    await refresh()
  }

  // Reveal a discovered folder in Finder/Explorer. Best-effort.
  const openPath = async (path: string) => {
    await window.electronAPI.invoke('locations:open-path', { path })
  }

  const addApproved = async () => {
    setError(null)
    const res = await window.electronAPI.invoke('locations:add-approved') as { error?: string; canceled?: boolean } | null
    if (res?.error) { setError(res.error); return }
    if (res?.canceled) return
    await refresh()
  }

  const removeApproved = async (id: string) => {
    await window.electronAPI.invoke('locations:remove-approved', { id })
    await refresh()
  }

  const addSource = async () => {
    setError(null)
    const res = await window.electronAPI.invoke('locations:add-source') as { error?: string; canceled?: boolean } | null
    if (res?.error) { setError(res.error); return }
    if (res?.canceled) return
    await refresh()
  }

  const removeSource = async (path: string) => {
    await window.electronAPI.invoke('locations:remove-source', { path })
    await refresh()
  }

  // ── Render ───────────────────────────────────────────────────────────────--

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Local Setup</h1>
        <p className="text-sm text-gray-400 mt-1">
          Point ClearPath at the folders and packs already on your machine. If it's here, the AI can use it.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      {/* Working folder */}
      <Section
        title="Working folder"
        hint="Where new sessions run by default — the AI reads files from here."
      >
        {health.defaultWorkingDir ? (
          <div className="flex items-center gap-3">
            <PathRow path={health.defaultWorkingDir.path} exists={health.defaultWorkingDir.exists} />
            <button onClick={() => void setWorkingFolder()} className={linkBtn}>Change</button>
            <button
              onClick={() => void resetWorkingFolder()}
              className={linkBtnDanger}
              title="Clear this and let sessions use the app's default launch folder"
            >
              Reset to default
            </button>
          </div>
        ) : (
          <EmptyRow
            label="Using the app's default folder — sessions run wherever ClearPath launched. Set a working folder to point the AI at your projects."
            cta="Choose a folder"
            onClick={() => void setWorkingFolder()}
          />
        )}
      </Section>

      {/* Approved folders */}
      <Section
        title="Approved folders"
        hint="Folders you've OK'd. Pick any of these per session under Customize → Folders this session can access."
        action={<button onClick={() => void addApproved()} className={linkBtn}>+ Add folder</button>}
      >
        {health.approvedFolders.length === 0 ? (
          <EmptyRow label="No approved folders yet." cta="Add a folder" onClick={() => void addApproved()} />
        ) : (
          <ul className="space-y-1.5">
            {health.approvedFolders.map((f) => (
              <li key={f.id} className="flex items-center gap-3">
                <PathRow path={f.path} label={f.label} exists={f.exists} />
                <button onClick={() => void removeApproved(f.id)} className={linkBtnDanger}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Extra source folders */}
      <Section
        title="Extra source folders"
        hint="Folders ClearPath scans for skills, agents, and plugins — e.g. a cloned pack like gstack or your team's internal repo."
        action={<button onClick={() => void addSource()} className={linkBtn}>+ Point to a folder</button>}
      >
        {health.sourceFolders.length === 0 ? (
          <EmptyRow
            label="Only the standard locations are scanned. Add a folder to include a pack installed elsewhere."
            cta="Point to a folder"
            onClick={() => void addSource()}
          />
        ) : (
          <ul className="space-y-1.5">
            {health.sourceFolders.map((s) => (
              <li key={s.path} className="flex items-center gap-3">
                <PathRow path={s.path} exists={s.exists} />
                <button onClick={() => void removeSource(s.path)} className={linkBtnDanger}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Discovered */}
      <Section
        title="Discovered"
        hint="What ClearPath found across the standard locations and your source folders."
        action={
          <button onClick={() => void refresh()} disabled={busy} className={linkBtn}>
            {busy ? 'Scanning…' : 'Rescan'}
          </button>
        }
      >
        <div className="space-y-2.5">
          <DiscoveryCard
            label="Skills"
            count={discovery.skills.count}
            locations={discovery.skills.locations}
            status="Available — pick which to use per session when you start one."
            manageLabel="Manage skills"
            onManage={() => navigate('/configure?tab=skills')}
            onOpen={(p) => void openPath(p)}
          />
          <DiscoveryCard
            label="Agents"
            count={discovery.agents.count}
            locations={discovery.agents.locations}
            status="Available — choose one per session, or set a default in Agents."
            manageLabel="Manage agents"
            onManage={() => navigate('/configure?tab=agents')}
            onOpen={(p) => void openPath(p)}
          />
          <DiscoveryCard
            label="Plugins"
            count={discovery.plugins.count}
            locations={discovery.plugins.locations}
            status="Found — only the ones you switch on in Plugins load into sessions."
            manageLabel="Manage plugins"
            onManage={() => navigate('/connect?tab=plugins')}
            onOpen={(p) => void openPath(p)}
          />
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Don't see your stuff?{' '}
          <button onClick={() => void addSource()} className="text-violet-400 hover:text-violet-300">
            Point ClearPath at the folder
          </button>{' '}
          where it's installed.
        </p>
      </Section>

      <p className="text-[11px] text-gray-600 leading-relaxed">
        Note: on macOS, access is granted when you pick a folder here. Folders inside your home directory work
        reliably; some system-protected locations stay off-limits by design.
      </p>
    </div>
  )
}

// ── Small presentational helpers ─────────────────────────────────────────────

const linkBtn = 'text-xs text-violet-400 hover:text-violet-300 font-medium flex-shrink-0'
const linkBtnDanger = 'text-xs text-gray-500 hover:text-red-400 flex-shrink-0'

function Section({ title, hint, action, children }: {
  title: string; hint?: string; action?: JSX.Element; children: React.ReactNode
}): JSX.Element {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
          {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function PathRow({ path, label, exists }: { path: string; label?: string; exists: boolean }): JSX.Element {
  return (
    <span className="flex-1 min-w-0">
      {label && <span className="block text-sm text-gray-200 font-medium truncate">{label}</span>}
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="text-xs text-gray-400 truncate" title={path}>{path}</span>
        {!exists && (
          <span className="text-[10px] text-amber-400 flex-shrink-0" title="This folder no longer exists">⚠ missing</span>
        )}
      </span>
    </span>
  )
}

function EmptyRow({ label, cta, onClick }: { label: string; cta: string; onClick: () => void }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-gray-700 bg-gray-900/40 px-3 py-3">
      <span className="text-xs text-gray-500">{label}</span>
      <button onClick={onClick} className={linkBtn}>{cta}</button>
    </div>
  )
}

function DiscoveryCard({ label, count, locations, status, manageLabel, onManage, onOpen }: {
  label: string
  count: number
  locations: string[]
  status: string
  manageLabel: string
  onManage: () => void
  onOpen: (path: string) => void
}): JSX.Element {
  const found = count > 0
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-lg font-semibold text-gray-100">{count}</span>
          <span className="text-xs text-gray-400">{label}</span>
        </div>
        <button onClick={onManage} className={linkBtn}>{manageLabel} →</button>
      </div>
      <p className="mt-0.5 text-[11px] text-gray-500">{found ? status : 'None found in the scanned locations.'}</p>
      {found && (
        <ul className="mt-2 space-y-1">
          {locations.map((loc) => (
            <li key={loc}>
              <button
                onClick={() => onOpen(loc)}
                title={`Open ${loc}`}
                className="group flex w-full items-center gap-1.5 text-left text-[11px] text-gray-400 hover:text-violet-300"
              >
                <span className="flex-shrink-0 text-gray-600 group-hover:text-violet-400">📁</span>
                <PathLabel path={loc} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Render a filesystem path so the meaningful tail (the actual folder name) is
 * always visible: dim the parent directory and let only that half truncate from
 * the left, while the basename stays bold and intact. Plain CSS `truncate` cuts
 * the end — exactly the part the user needs — so we split parent/basename.
 */
function PathLabel({ path }: { path: string }): JSX.Element {
  const norm = path.replace(/[\\/]+$/, '')
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'))
  const parent = idx > 0 ? norm.slice(0, idx + 1) : ''
  const base = idx >= 0 ? norm.slice(idx + 1) : norm
  return (
    <span className="flex min-w-0 items-center">
      {parent && (
        <span className="truncate text-gray-600" style={{ direction: 'rtl' }}>
          <span style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}>{parent}</span>
        </span>
      )}
      <span className="flex-shrink-0 font-medium text-gray-300">{base}</span>
    </span>
  )
}
