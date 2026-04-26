import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useFeatureFlags } from '../../contexts/FeatureFlagContext'

type Tier = 'offline' | 'local_llm' | 'cloud'
type BinarySource = 'bundled' | 'path' | 'missing'

interface InitProgress {
  kind: 'log' | 'progress' | 'done' | 'error'
  message: string
  percent?: number
}

interface InstallStatusPayload {
  installed: boolean
  source: BinarySource
  path?: string
  version?: string
  error?: string
}

interface EnableResult {
  ok: boolean
  state?: string
  error?: string
}

/**
 * Gates the Clear Memory page on the `showClearMemory` feature flag.
 *
 * Slice B:
 *  - Installs a progress listener on `clearmemory:init-progress`.
 *  - Invokes `clearmemory:enable` which triggers `clearmemory init` (streamed)
 *    and then starts the daemon.
 *  - Only flips the feature flag on a successful start.
 *  - If the binary isn't present, shows an install CTA instead of the Enable
 *    button — the flag stays off until the user installs and re-checks.
 */
export default function EnableGate({ children }: { children: ReactNode }): JSX.Element {
  const { flags, setFlag } = useFeatureFlags()
  const [tier, setTier] = useState<Tier>('offline')
  const [install, setInstall] = useState<InstallStatusPayload | null>(null)
  const [checking, setChecking] = useState(true)
  const [enabling, setEnabling] = useState(false)
  const [progress, setProgress] = useState<InitProgress[]>([])
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mountedRef = useRef(true)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  const checkInstall = useCallback(async () => {
    setChecking(true)
    try {
      setError(null)
      const result = (await window.electronAPI.invoke('clearmemory:install-status')) as InstallStatusPayload
      if (!mountedRef.current) return
      setInstall(result)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mountedRef.current) setChecking(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void checkInstall()
    return () => { mountedRef.current = false }
  }, [checkInstall])

  // Subscribe to init-progress events whenever the component is alive —
  // cheap, and keeps us responsive if the daemon ever emits outside a click.
  useEffect(() => {
    const unsub = window.electronAPI.on('clearmemory:init-progress', (...args: unknown[]) => {
      const payload = args[0] as InitProgress | undefined
      if (!payload) return
      setProgress((prev) => {
        const next = [...prev, payload]
        // Cap at 200 lines so a chatty downloader doesn't balloon state.
        return next.length > 200 ? next.slice(next.length - 200) : next
      })
      if (payload.kind === 'progress' && typeof payload.percent === 'number') {
        setPercent(payload.percent)
      }
      if (payload.kind === 'error') {
        setError(payload.message)
      }
    })
    return () => { unsub?.() }
  }, [])

  // Autoscroll the log area to the latest line.
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [progress])

  if (flags.showClearMemory) return <>{children}</>

  const binaryMissing = install && install.source === 'missing'

  async function handleEnable(): Promise<void> {
    setEnabling(true)
    setError(null)
    setProgress([])
    setPercent(null)
    try {
      const result = (await window.electronAPI.invoke('clearmemory:enable', { tier })) as EnableResult
      if (!result.ok) {
        setError(result.error ?? 'Enable failed')
        return
      }
      // Only flip the flag after a successful start — otherwise a user who
      // hits a spawn error would be stuck with the Clear Memory pages visible
      // but no running daemon.
      setFlag('showClearMemory', true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mountedRef.current) setEnabling(false)
    }
  }

  // ── Install CTA ───────────────────────────────────────────────────────────
  if (binaryMissing) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-white">Install ClearMemory first</h2>
            <p className="text-sm text-gray-400 mt-2">
              Clear Memory runs a local daemon backed by the <code className="text-indigo-300">clearmemory</code> CLI.
              We couldn&apos;t find it on your system.
            </p>
          </div>

          <pre className="text-xs bg-black/40 border border-gray-700 rounded p-3 text-gray-200 font-mono overflow-x-auto">
cargo install clearmemory
          </pre>

          {install?.error && (
            <p className="text-xs text-gray-500">{install.error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { void checkInstall() }}
              disabled={checking}
              className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium transition-colors"
            >
              {checking ? 'Checking…' : 'Re-check'}
            </button>
          </div>

          <p className="text-[11px] text-gray-500 text-center">
            Once installed, come back here and we&apos;ll take care of the rest.
          </p>
        </div>
      </div>
    )
  }

  // ── Enable CTA ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Enable Clear Memory</h2>
          <p className="text-sm text-gray-400 mt-2">
            A local-first memory engine that stores every AI session verbatim and
            recalls relevant context across projects. Nothing leaves your machine.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
            <div className="text-gray-500 uppercase tracking-wide">Disk</div>
            <div className="text-gray-200 mt-1">~700 MB</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
            <div className="text-gray-500 uppercase tracking-wide">First download</div>
            <div className="text-gray-200 mt-1">~600 MB model</div>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Tier</div>
          <div className="space-y-2">
            {([
              { value: 'offline', label: 'Offline', hint: 'Embeddings only. Fastest, private.' },
              { value: 'local_llm', label: 'Local LLM', hint: 'Adds reflection via Ollama/LM Studio.' },
              { value: 'cloud', label: 'Cloud', hint: 'Optional cloud LLM for reflection.' },
            ] as const).map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  tier === opt.value
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="cm-tier"
                  value={opt.value}
                  checked={tier === opt.value}
                  onChange={() => setTier(opt.value)}
                  disabled={enabling}
                  className="mt-0.5 accent-indigo-500"
                />
                <div>
                  <div className="text-sm text-gray-200">{opt.label}</div>
                  <div className="text-xs text-gray-500">{opt.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Progress + log area */}
        {(enabling || progress.length > 0 || error) && (
          <div className="space-y-2">
            {percent != null && (
              <div>
                <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                  <span>Setting up…</span>
                  <span>{percent}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-900 border border-gray-700 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                  />
                </div>
              </div>
            )}
            {progress.length > 0 && (
              <div className="bg-black/40 border border-gray-700 rounded-md p-2 max-h-40 overflow-y-auto font-mono text-[11px] leading-relaxed">
                {progress.map((p, i) => (
                  <div
                    key={i}
                    className={
                      p.kind === 'error' ? 'text-red-400'
                      : p.kind === 'progress' ? 'text-indigo-300'
                      : p.kind === 'done' ? 'text-teal-300'
                      : 'text-gray-300'
                    }
                  >
                    {p.message}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
            {error && (
              <div className="bg-red-900/30 border border-red-700/60 rounded p-2 text-xs text-red-200">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => { void handleEnable() }}
            disabled={enabling || checking}
            className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium transition-colors"
          >
            {enabling ? 'Enabling…' : 'Enable Clear Memory'}
          </button>
          {error && !enabling && (
            <button
              onClick={() => { void handleEnable() }}
              className="px-4 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
            >
              Retry
            </button>
          )}
        </div>

        <p className="text-[11px] text-gray-500 text-center">
          You can disable this at any time from Configure &rsaquo; Feature flags.
        </p>
      </div>
    </div>
  )
}
