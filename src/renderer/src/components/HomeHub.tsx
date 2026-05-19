import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBranding } from '../contexts/BrandingContext'
import ExtensionSlot from './extensions/ExtensionSlot'
import HomeQuickStartBar, { type QuickStartSubmit } from './home/HomeQuickStartBar'
import TryAnExampleModal from './home/TryAnExampleModal'

interface RecentSession {
  sessionId: string
  cli: string
  name?: string
  startedAt: number
  endedAt?: number
}

export default function HomeHub(): JSX.Element {
  const navigate = useNavigate()
  const { brand } = useBranding()
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  // `null` here means "we haven't heard back from the probe yet" — used
  // purely to decide whether to render the setup-nudge card. The rest of
  // the home is NOT gated on this state. A first-time user lands on the
  // full surface immediately and is free to try the input, browse examples,
  // and explore Learn before deciding to set anything up.
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [greeting, setGreeting] = useState('')
  const [exampleOpen, setExampleOpen] = useState(false)
  const [injectedPrompt, setInjectedPrompt] = useState('')
  // Bumped each time an example is picked so HomeQuickStartBar remounts with
  // the new seed, even if the user picks the same example twice in a row.
  const [injectNonce, setInjectNonce] = useState(0)

  const load = useCallback(async () => {
    // Setup probe is best-effort — if it fails, we simply don't show the
    // nudge. No early returns; the home renders the full surface either way.
    try {
      const setup = await window.electronAPI.invoke('setup-wizard:is-complete') as { complete: boolean }
      setSetupComplete(setup.complete)
    } catch {
      setSetupComplete(true)
    }

    try {
      const sessions = await window.electronAPI.invoke('cli:get-persisted-sessions') as RecentSession[]
      setRecentSessions((sessions ?? []).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)).slice(0, 3))
    } catch { /* no sessions */ }

    const hour = new Date().getHours()
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening')
  }, [])

  useEffect(() => { void load() }, [load])

  const handleQuickStart = (opts: QuickStartSubmit) => {
    navigate('/work', {
      state: {
        quickPrompt: opts.prompt,
        quickPromptCli: opts.cli,
        quickPromptModel: opts.model,
        quickPromptAgent: opts.agent,
        quickPromptAttachedAgent: opts.attachedAgent,
        // Forward the explicit "no agent" signal so Work can pass it to
        // cli:start-session — otherwise the server overrides with its default.
        quickPromptNoAgent: opts.noAgent,
      },
    })
  }

  const handleExamplePick = (prompt: string) => {
    setInjectedPrompt(prompt)
    setInjectNonce((n) => n + 1)
  }

  const timeAgo = (ms: number): string => {
    const mins = Math.floor((Date.now() - ms) / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  // The home renders the full surface on every visit. No setup gate — a
  // first-time user can immediately try the input, browse examples, browse
  // the Learn area, and customize. When the setup probe confirms the user
  // hasn't run the wizard yet, a non-blocking nudge card surfaces near the
  // top so the option is one click away without being mandatory.
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 pt-12 pb-16 space-y-6">

        <div className="text-center space-y-2">
          <div className="flex justify-center mb-3">
            <BrandLogo brand={brand} size={56} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}</h1>
          <p className="text-sm text-gray-500">Type what you need — I&apos;ll pick the right AI helper and get started.</p>
        </div>

        {/* Setup nudge — non-blocking. Only renders once the probe has
            confirmed setup is incomplete; never appears while the probe is
            still in-flight (so it doesn&apos;t flash on returning users). */}
        {setupComplete === false && (
          <button
            data-testid="home-setup-nudge"
            onClick={() => navigate('/configure?tab=setup')}
            className="w-full text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all group flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: brand.colorPrimary + '15' }}>
              <svg className="w-5 h-5" style={{ color: brand.colorPrimary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Let&apos;s get you set up</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: brand.colorPrimary + '15', color: brand.colorPrimary }}>
                  Recommended
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Connect your AI tools when you&apos;re ready — takes about 2 minutes. You can keep exploring without it.</p>
            </div>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        <HomeQuickStartBar
          key={injectNonce}
          initialPrompt={injectedPrompt}
          onSubmit={handleQuickStart}
          colorButtonPrimary={brand.colorButtonPrimary}
        />

        <div className="space-y-3">
          <button
            onClick={() => setExampleOpen(true)}
            className="w-full text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all group flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: brand.colorPrimary + '12' }}>
              <span className="text-xl">💡</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Try an example</h3>
              <p className="text-xs text-gray-500 mt-0.5">Pick from common workflows — see what AI can do for you.</p>
            </div>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/learn')}
              className="text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all group flex items-center gap-4"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: brand.colorSecondary + '12' }}>
                <svg className="w-5 h-5" style={{ color: brand.colorSecondary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Browse what I can do</h3>
                <p className="text-xs text-gray-500 mt-0.5">Guides, examples, and ideas for how AI can help.</p>
              </div>
            </button>

            <button
              onClick={() => navigate('/configure')}
              className="text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all group flex items-center gap-4"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Customize my setup</h3>
                <p className="text-xs text-gray-500 mt-0.5">Fine-tune agents, skills, and preferences.</p>
              </div>
            </button>
          </div>
        </div>

        {recentSessions.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">Pick up where you left off</span>
              <button onClick={() => navigate('/work')} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">All sessions</button>
            </div>
            <div className="flex gap-2">
              {recentSessions.map((s) => (
                <button
                  key={s.sessionId}
                  onClick={() => navigate('/work', { state: { sessionId: s.sessionId } })}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-left hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.endedAt ? 'bg-gray-300' : 'bg-green-400'}`} />
                    <span className="text-xs font-medium text-gray-800 truncate">{s.name ?? 'Untitled'}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400">{s.cli === 'copilot' ? 'Copilot' : 'Claude'}</span>
                    <span className="text-[10px] text-gray-400">{timeAgo(s.startedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <ExtensionSlot slotName="home:widgets" className="mt-6" />
      </div>

      <TryAnExampleModal
        isOpen={exampleOpen}
        onClose={() => setExampleOpen(false)}
        onPick={handleExamplePick}
      />
    </div>
  )
}

// ── Brand logo ────────────────────────────────────────────────────────────────

interface BrandLogoProps {
  brand: { colorPrimary: string; colorAccentLight: string }
  size: number
  withShadow?: boolean
}

function BrandLogo({ brand, size, withShadow = false }: BrandLogoProps): JSX.Element {
  const inner = Math.round(size * 0.57)
  return (
    <div
      className={`rounded-2xl flex items-center justify-center ${withShadow ? 'shadow-lg' : ''}`}
      style={{ width: size, height: size, backgroundColor: brand.colorPrimary }}
    >
      <svg width={inner} height={inner} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="13" stroke="#fff" strokeWidth="1" opacity="0.15"/>
        <g opacity="0.35">
          <line x1="20" y1="7" x2="20" y2="10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="20" y1="30" x2="20" y2="33" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="7" y1="20" x2="10" y2="20" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="30" y1="20" x2="33" y2="20" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
        </g>
        <path d="M20 20 L30 10" fill="none" stroke={brand.colorAccentLight} strokeWidth="1.5" strokeLinecap="round" opacity="0.85"/>
        <g transform="translate(20,20) rotate(-45)">
          <polygon points="0,-11 2.5,-2 0,-4 -2.5,-2" fill="#fff"/>
        </g>
        <circle cx="20" cy="20" r="3" fill={brand.colorPrimary} stroke="#fff" strokeWidth="1.5"/>
        <circle cx="20" cy="20" r="1.5" fill={brand.colorAccentLight}/>
      </svg>
    </div>
  )
}
