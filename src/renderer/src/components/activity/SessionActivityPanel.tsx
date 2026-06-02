import { useState, useEffect, useCallback, useMemo } from 'react'
import type { SessionActivityEntry, ActivityKind } from '../../../../shared/activity/types'

/**
 * Right-side drawer listing everything the session's agent touched — files it
 * read, files it wrote (artifacts), websites it fetched, commands it ran — fed by
 * the PermissionBroker's activity log. File outputs are one click away to open
 * (default app) or reveal (Finder/Explorer); URLs open in the browser.
 */
export default function SessionActivityPanel({
  sessionId, open, onClose,
}: { sessionId: string; open: boolean; onClose: () => void }): JSX.Element | null {
  const [items, setItems] = useState<SessionActivityEntry[]>([])

  const refresh = useCallback(() => {
    void (window.electronAPI.invoke('activity:get-session', { sessionId }) as Promise<SessionActivityEntry[]>)
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch(() => { /* ignore */ })
  }, [sessionId])

  useEffect(() => { if (open) refresh() }, [open, refresh])

  // Refetch when a turn ends (new activity likely arrived) — only while the
  // drawer is open, so a hidden/closed panel registers no background listener.
  useEffect(() => {
    if (!open) return
    const off = window.electronAPI.on('cli:turn-end', (d: { sessionId?: string }) => {
      if (d?.sessionId === sessionId) refresh()
    })
    return off
  }, [open, sessionId, refresh])

  const groups = useMemo(() => groupActivity(items), [items])
  // The prompts the user actually answered (or that timed out) — the auditable
  // decisions, newest first.
  const decisions = useMemo(
    () => items.filter((i) => i.decidedBy === 'user' || i.decidedBy === 'timeout').slice().reverse(),
    [items],
  )

  if (!open) return null

  const openFile = (p?: string) => p && void window.electronAPI.invoke('activity:open-file', { path: p })
  const revealFile = (p?: string) => p && void window.electronAPI.invoke('activity:reveal-file', { path: p })
  const openUrl = (u?: string) => u && void window.electronAPI.invoke('activity:open-url', { url: u })

  return (
    <div className="fixed inset-0 z-[900] flex justify-end" data-testid="session-activity-panel">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <aside className="relative w-[400px] max-w-[92vw] h-full bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-100">Files &amp; activity</h3>
            <p className="text-[11px] text-gray-500">What this session read, wrote, fetched, and ran</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="text-xs text-gray-400 hover:text-gray-200" title="Refresh">Refresh</button>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-200 text-lg leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
          {items.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-10">No activity yet. Files the agent reads or writes, sites it fetches, and commands it runs will appear here.</p>
          )}

          {/* Audit: the prompts you actually answered (or that timed out). */}
          {decisions.length > 0 && (
            <div>
              <div className="flex items-baseline gap-2 mb-1.5">
                <h4 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">🔐 Your decisions</h4>
                <span className="text-[10px] text-gray-600">{decisions.length}</span>
              </div>
              <div className="space-y-1">
                {decisions.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-950/50 border border-gray-800/60 text-xs">
                    <span className={`text-[11px] font-semibold flex-shrink-0 ${d.decision === 'allow' ? 'text-green-400' : 'text-red-400'}`}>
                      {d.decidedBy === 'timeout' ? '⏲ No answer' : d.decision === 'allow' ? '✓ Allowed' : '✗ Denied'}
                    </span>
                    <span className="text-[10px] text-gray-500 flex-shrink-0 max-w-[80px] truncate" title={d.toolName}>{d.toolName}</span>
                    <span className="text-gray-300 font-mono truncate flex-1" title={d.target}>{shortTarget(d.target) || '—'}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-1">Tool permissions you were asked to approve this session</p>
            </div>
          )}

          <Section title="Outputs" hint="Files the agent created or edited" entries={groups.write} icon="📄"
            actions={(e) => isFilePath(e.target) ? <FileActions onOpen={() => openFile(e.target)} onReveal={() => revealFile(e.target)} /> : null} />
          <Section title="Inputs" hint="Files the agent read" entries={groups.read} icon="📥"
            actions={(e) => isFilePath(e.target) ? <FileActions onOpen={() => openFile(e.target)} onReveal={() => revealFile(e.target)} /> : null} />
          <Section title="Web" hint="Pages the agent fetched" entries={groups.fetch} icon="🌐"
            actions={(e) => e.target ? <button onClick={() => openUrl(e.target)} className="text-[11px] text-violet-300 hover:text-violet-200">Open ↗</button> : null} />
          <Section title="Commands" hint="Shell commands the agent ran" entries={groups.shell} icon="⌘" actions={() => null} />
          <Section title="Other tools" hint="" entries={groups.tool} icon="🔧" actions={() => null} />
        </div>
      </aside>
    </div>
  )
}

function FileActions({ onOpen, onReveal }: { onOpen: () => void; onReveal: () => void }): JSX.Element {
  return (
    <span className="flex gap-2 flex-shrink-0">
      <button onClick={onOpen} className="text-[11px] text-violet-300 hover:text-violet-200">Open</button>
      <button onClick={onReveal} className="text-[11px] text-gray-400 hover:text-gray-200">Reveal</button>
    </span>
  )
}

function Section({
  title, hint, icon, entries, actions,
}: {
  title: string; hint: string; icon: string
  entries: SessionActivityEntry[]
  actions: (e: SessionActivityEntry) => JSX.Element | null
}): JSX.Element | null {
  if (entries.length === 0) return null
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <h4 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">{icon} {title}</h4>
        <span className="text-[10px] text-gray-600">{entries.length}</span>
      </div>
      <div className="space-y-1">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-950/50 border border-gray-800/60 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.decision === 'allow' ? 'bg-green-500/70' : 'bg-red-500/70'}`}
              title={e.decision === 'allow' ? 'Allowed' : 'Denied'} />
            <span className="text-[10px] text-gray-500 flex-shrink-0 max-w-[90px] truncate" title={`Tool: ${e.toolName} · ${e.decision === 'allow' ? 'allowed' : 'denied'}${e.decidedBy ? ` (${e.decidedBy === 'user' ? 'you chose' : e.decidedBy === 'grant' ? 'remembered' : e.decidedBy === 'timeout' ? 'no answer' : 'auto by policy'})` : ''}`}>{e.toolName}</span>
            {e.decidedBy === 'user' && <span className="text-[9px] text-violet-300 flex-shrink-0" title="You approved this prompt">• you</span>}
            <span className="text-gray-300 font-mono truncate flex-1" title={e.target}>{shortTarget(e.target) || '—'}</span>
            {actions(e)}
          </div>
        ))}
      </div>
      {hint && <p className="text-[10px] text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}

function shortTarget(t?: string): string {
  if (!t) return ''
  return t.length > 64 ? '…' + t.slice(-61) : t
}

/** A target we can actually open/reveal in the file manager (a path, not a URL). */
function isFilePath(t?: string): boolean {
  return !!t && !/^https?:\/\//i.test(t) && (t.includes('/') || t.includes('\\'))
}

interface Grouped { read: SessionActivityEntry[]; write: SessionActivityEntry[]; fetch: SessionActivityEntry[]; shell: SessionActivityEntry[]; tool: SessionActivityEntry[] }

function groupActivity(items: SessionActivityEntry[]): Grouped {
  const g: Grouped = { read: [], write: [], fetch: [], shell: [], tool: [] }
  for (const e of items) (g[e.kind as keyof Grouped] ?? g.tool).push(e)
  return g
}
