import { useCallback, useEffect, useRef, useState } from 'react'
import type { McpStatus } from '../../../../shared/clearmemory/types'
import { mcpRepair, mcpStatus } from '../../lib/clearmemoryClient'
import { toast } from '../../lib/toast'

// ── Types mirror the Slice B IPC responses ──────────────────────────────────

type ServiceState = 'stopped' | 'starting' | 'ready' | 'crashed' | 'missing-binary'
type BinarySource = 'bundled' | 'path' | 'missing'

interface StatusPayload {
  tier: string
  memories: number
  diskBytes: number
  uptimeSeconds: number
  p95LatencyMs?: number
  httpPort: number
  mcpPort: number
  ready: boolean
  serviceStatus: ServiceState
  binarySource: BinarySource
  stderrTail?: string[]
}

interface InstallStatusPayload {
  installed: boolean
  source: BinarySource
  path?: string
  version?: string
  error?: string
  platformArch: string
}

interface StateChangePayload {
  state: ServiceState
}

const STATUS_POLL_MS = 5_000

const STATE_STYLES: Record<ServiceState, { label: string; dot: string; text: string }> = {
  stopped:         { label: 'Stopped',        dot: 'bg-gray-500',   text: 'text-gray-300' },
  starting:        { label: 'Starting…',      dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300' },
  ready:           { label: 'Ready',          dot: 'bg-teal-400',   text: 'text-teal-300' },
  crashed:         { label: 'Crashed',        dot: 'bg-red-500',    text: 'text-red-400' },
  'missing-binary':{ label: 'Not installed',  dot: 'bg-red-500',    text: 'text-red-400' },
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds < 1) return '—'
  const s = Math.floor(seconds)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export default function StatusDashboard(): JSX.Element {
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [install, setInstall] = useState<InstallStatusPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshingInstall, setRefreshingInstall] = useState(false)
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  const [mcpRepairing, setMcpRepairing] = useState(false)
  const mountedRef = useRef(true)

  const fetchStatus = useCallback(async () => {
    try {
      const result = (await window.electronAPI.invoke('clearmemory:status')) as StatusPayload
      if (!mountedRef.current) return
      setStatus(result)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const fetchInstall = useCallback(async () => {
    setRefreshingInstall(true)
    try {
      const result = (await window.electronAPI.invoke('clearmemory:install-status')) as InstallStatusPayload
      if (!mountedRef.current) return
      setInstall(result)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mountedRef.current) setRefreshingInstall(false)
    }
  }, [])

  const handleRestart = useCallback(async () => {
    try {
      await window.electronAPI.invoke('clearmemory:enable', { tier: 'offline' })
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [fetchStatus])

  const fetchMcp = useCallback(async () => {
    const r = await mcpStatus()
    if (!mountedRef.current) return
    if (r.ok) setMcp(r.data)
  }, [])

  const handleMcpRepair = useCallback(async () => {
    setMcpRepairing(true)
    try {
      const r = await mcpRepair()
      if (r.ok) {
        setMcp(r.data)
        const both = r.data.claude && r.data.copilot
        if (both) toast.success('Re-registered ClearMemory in Claude + Copilot MCP configs')
        else toast.info(`MCP re-register partial: claude=${r.data.claude} copilot=${r.data.copilot}`)
      } else {
        toast.error(r.error)
      }
    } finally {
      setMcpRepairing(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetchInstall()
    void fetchStatus()
    void fetchMcp()

    const interval = setInterval(() => { void fetchStatus() }, STATUS_POLL_MS)

    const unsub = window.electronAPI.on('clearmemory:state-change', (...args: unknown[]) => {
      const payload = args[0] as StateChangePayload | undefined
      if (!payload) return
      // State transitions often carry new info (crashed → stderr, ready → live
      // status) — re-poll immediately so the cards don't wait for the next tick.
      void fetchStatus()
      void fetchMcp()
    })

    return () => {
      mountedRef.current = false
      clearInterval(interval)
      unsub?.()
    }
  }, [fetchInstall, fetchStatus, fetchMcp])

  // Prefer the live service status; if we haven't received one yet, fall back
  // to the install probe (missing binary overrides a stale "stopped" default).
  let state: ServiceState
  if (status?.serviceStatus) {
    state = status.serviceStatus
  } else if (install?.source === 'missing') {
    state = 'missing-binary'
  } else {
    state = 'stopped'
  }
  const stateStyle = STATE_STYLES[state]

  const binaryVersion = install?.version ?? '—'
  const binarySource = status?.binarySource ?? install?.source ?? 'missing'
  const binaryPath = install?.path ?? ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">Live daemon status and health metrics.</p>
        <button
          onClick={() => { void fetchStatus() }}
          className="text-xs px-2.5 py-1 rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700"
        >
          Refresh
        </button>
      </div>

      {/* Error banner (transient IPC failures) */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/60 rounded-lg p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Missing-binary banner */}
      {state === 'missing-binary' && (
        <div className="bg-red-900/30 border border-red-700/60 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-red-200">ClearMemory binary not found</div>
              <p className="text-xs text-red-300/90 mt-1">
                Install it from a terminal, then re-check. The daemon will start automatically.
              </p>
            </div>
            <button
              onClick={() => { void fetchInstall(); void fetchStatus() }}
              disabled={refreshingInstall}
              className="text-xs px-3 py-1.5 rounded-md bg-red-800/50 hover:bg-red-800 border border-red-700 text-red-100 disabled:opacity-50"
            >
              {refreshingInstall ? 'Checking…' : 'Re-check'}
            </button>
          </div>
          <pre className="text-[11px] bg-black/40 border border-red-900/50 rounded p-2 text-red-100 font-mono">
cargo install clearmemory
          </pre>
        </div>
      )}

      {/* Crashed banner */}
      {state === 'crashed' && (
        <div className="bg-red-900/30 border border-red-700/60 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-red-200">Daemon crashed</div>
              <p className="text-xs text-red-300/90 mt-1">
                Auto-restart is in progress. You can also try a manual restart.
              </p>
            </div>
            <button
              onClick={() => { void handleRestart() }}
              className="text-xs px-3 py-1.5 rounded-md bg-red-800/50 hover:bg-red-800 border border-red-700 text-red-100"
            >
              Restart now
            </button>
          </div>
          {status?.stderrTail && status.stderrTail.length > 0 && (
            <pre className="text-[11px] bg-black/40 border border-red-900/50 rounded p-2 text-red-100 font-mono overflow-x-auto max-h-40">
              {status.stderrTail.join('\n')}
            </pre>
          )}
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Service">
          <div className={`flex items-center gap-2 ${stateStyle.text}`}>
            <span className={`w-2 h-2 rounded-full ${stateStyle.dot}`} />
            <span className="text-sm font-medium">{stateStyle.label}</span>
          </div>
          <Hint>Daemon process state</Hint>
        </Card>

        <Card label="Binary" title={binaryPath || undefined}>
          <div className="text-xl text-gray-200 font-mono truncate">{binaryVersion}</div>
          <Hint>
            {binarySource === 'bundled' && 'Bundled with app'}
            {binarySource === 'path' && 'From user PATH'}
            {binarySource === 'missing' && 'Not installed'}
          </Hint>
        </Card>

        <Card label="Memories">
          <div className="text-xl text-gray-200 font-mono">
            {status && status.ready ? status.memories.toLocaleString() : '—'}
          </div>
          <Hint>Total stored</Hint>
        </Card>

        <Card label="Disk">
          <div className="text-xl text-gray-200 font-mono">
            {status && status.ready ? formatBytes(status.diskBytes) : '—'}
          </div>
          <Hint>Used by data + indexes</Hint>
        </Card>

        <Card label="p95 Latency">
          <div className="text-xl text-gray-200 font-mono">
            {status?.p95LatencyMs != null ? `${status.p95LatencyMs} ms` : '—'}
          </div>
          <Hint>Recall round-trip</Hint>
        </Card>

        <Card label="HTTP port">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${state === 'ready' ? 'bg-teal-400' : 'bg-gray-600'}`} />
            <span className="text-xl text-gray-200 font-mono">{status?.httpPort ?? 8080}</span>
          </div>
          <Hint>127.0.0.1 only</Hint>
        </Card>

        <Card label="MCP port">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${state === 'ready' ? 'bg-teal-400' : 'bg-gray-600'}`} />
            <span className="text-xl text-gray-200 font-mono">{status?.mcpPort ?? 9700}</span>
          </div>
          <Hint>Model Context Protocol</Hint>
        </Card>

        <Card label="Uptime">
          <div className="text-xl text-gray-200 font-mono">
            {status && status.ready ? formatUptime(status.uptimeSeconds) : '—'}
          </div>
          <Hint>Since daemon start</Hint>
        </Card>
      </div>

      {/* MCP integration status */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-white">MCP integration</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              Auto-registers ClearMemory with Claude Code + Copilot CLI so both can call
              <code className="mx-1 text-gray-300">clearmemory_recall</code> / etc.
            </div>
          </div>
          <button
            onClick={() => { void handleMcpRepair() }}
            disabled={mcpRepairing}
            className="text-xs px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            {mcpRepairing ? 'Re-registering…' : 'Re-register MCP'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <McpCard name="Claude Code" registered={mcp?.claude ?? false} path="~/.claude/mcp.json" />
          <McpCard name="Copilot CLI" registered={mcp?.copilot ?? false} path="~/.copilot/mcp-config.json" />
        </div>
      </div>
    </div>
  )
}

function McpCard({
  name,
  registered,
  path,
}: {
  name: string
  registered: boolean
  path: string
}): JSX.Element {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-200">{name}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
          registered
            ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {registered ? 'Registered' : 'Missing'}
        </span>
      </div>
      <div className="text-[11px] text-gray-500 mt-1 font-mono truncate" title={path}>{path}</div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Card({
  label,
  title,
  children,
}: {
  label: string
  title?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div
      className="bg-gray-900 border border-gray-700 rounded-lg p-3"
      title={title}
    >
      <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="text-[10px] text-gray-600 mt-1">{children}</div>
}
