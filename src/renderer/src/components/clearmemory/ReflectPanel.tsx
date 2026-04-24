import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { ClearMemoryTier, Stream } from '../../../../shared/clearmemory/types'
import { configGet, reflect, streamsList } from '../../lib/clearmemoryClient'
import { toast } from '../../lib/toast'

// ── ReflectPanel ─────────────────────────────────────────────────────────────
// Reflect synthesizes an answer across the stored memories. Upstream behaviour
// at this slice:
//   - Offline tier: CLI prints "Reflect requires Tier 2 or higher." and exits.
//   - Tier 2+    : CLI prints a placeholder "Reflect: <query>". Full synthesis
//                 is still being built upstream.
// We reflect (heh) that in the UI — the tier gate disables the form, and a
// small note warns the user about the still-maturing backend.

export default function ReflectPanel(): JSX.Element {
  const [tier, setTier] = useState<ClearMemoryTier | null>(null)
  const [tierError, setTierError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [stream, setStream] = useState('')
  const [streams, setStreams] = useState<Stream[]>([])

  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [outputError, setOutputError] = useState<string | null>(null)

  // Load current tier so we know whether to enable the form.
  useEffect(() => {
    void (async () => {
      const r = await configGet()
      if (!r.ok) {
        setTierError(r.error)
        return
      }
      setTier(r.data.tier)
    })()
  }, [])

  // Load stream list for the optional picker.
  useEffect(() => {
    void (async () => {
      const r = await streamsList()
      if (r.ok) setStreams(r.data.streams)
    })()
  }, [])

  const tierMeetsRequirement = tier === 'local_llm' || tier === 'cloud'

  const onSubmit = useCallback(async () => {
    const trimmed = query.trim()
    if (trimmed.length === 0) return
    setBusy(true)
    setOutput(null)
    setOutputError(null)
    try {
      const r = await reflect(trimmed, stream || undefined)
      if (!r.ok) {
        setOutputError(r.error)
        toast.error(r.error)
        return
      }
      setOutput(r.data.output || '(empty response from CLI)')
    } finally {
      setBusy(false)
    }
  }, [query, stream])

  if (tierError) {
    return (
      <div className="bg-red-900/30 border border-red-700/60 rounded-xl p-4 text-sm text-red-200">
        Failed to determine tier: {tierError}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Reflect — synthesize across your memories
          </h3>
          <p className="text-sm text-gray-400 mt-0.5">
            Requires Tier 2 (Local LLM) or higher so a model is available to compose the answer.
          </p>
        </div>
        {tier && (
          <span className={`text-[11px] px-2 py-1 rounded-full border ${
            tierMeetsRequirement
              ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            Tier: {tier}
          </span>
        )}
      </div>

      {!tierMeetsRequirement ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="text-sm font-medium text-amber-300">Reflect requires Tier 2+</div>
          <p className="text-sm text-gray-400 mt-2">
            You're running the offline tier, which stores and retrieves memories but doesn't
            include a language model for synthesis. Switch your tier to
            <span className="mx-1 font-mono text-gray-200">local_llm</span>
            or
            <span className="mx-1 font-mono text-gray-200">cloud</span>
            in the Config tab to enable Reflect.
          </p>
        </div>
      ) : (
        <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Query
            </label>
            <textarea
              rows={3}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What have I learned about session persistence?"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Stream (optional)
            </label>
            <select
              value={stream}
              onChange={(e) => setStream(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
            >
              <option value="">All streams</option>
              {streams.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => { void onSubmit() }}
            disabled={busy || query.trim().length === 0}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {busy ? 'Synthesizing…' : 'Synthesize'}
          </button>

          <div className="text-[11px] text-gray-500 italic">
            Upstream reflection is in active development — output quality will improve as the backend matures.
          </div>

          {outputError && (
            <div className="bg-red-900/30 border border-red-700/60 rounded-lg p-3 text-sm text-red-200">
              {outputError}
            </div>
          )}

          {output !== null && !outputError && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 prose prose-invert prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
              >
                {output}
              </ReactMarkdown>
            </div>
          )}
        </fieldset>
      )}
    </div>
  )
}
