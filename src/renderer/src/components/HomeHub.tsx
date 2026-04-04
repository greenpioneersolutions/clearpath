import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBranding } from '../contexts/BrandingContext'

// ── Types ────────────────────────────────────────────────────────────────────

interface RecentSession {
  sessionId: string
  cli: string
  name?: string
  startedAt: number
  endedAt?: number
}

interface SetupState {
  completedAt: number | null
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HomeHub(): JSX.Element {
  const navigate = useNavigate()
  const { brand } = useBranding()
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [setupComplete, setSetupComplete] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [copilotOk, setCopilotOk] = useState(false)
  const [claudeOk, setClaudeOk] = useState(false)
  const [greeting, setGreeting] = useState('')

  const load = useCallback(async () => {
    try {
      const [sessions, setup, auth] = await Promise.all([
        window.electronAPI.invoke('cli:get-persisted-sessions') as Promise<RecentSession[]>,
        window.electronAPI.invoke('setup-wizard:is-complete') as Promise<{ complete: boolean }>,
        window.electronAPI.invoke('auth:get-status') as Promise<{ copilot: { authenticated: boolean }; claude: { authenticated: boolean } }>,
      ])
      setRecentSessions((sessions ?? []).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)).slice(0, 3))
      setSetupComplete(setup.complete)
      setCopilotOk(auth.copilot.authenticated)
      setClaudeOk(auth.claude.authenticated)
    } catch { /* handlers not ready */ }

    const hour = new Date().getHours()
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening')
  }, [])

  useEffect(() => { void load() }, [load])

  const handleQuickStart = () => {
    // Navigate to Work page — it will pick up from there
    navigate('/work')
  }

  const timeAgo = (ms: number): string => {
    const mins = Math.floor((Date.now() - ms) / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-full px-6 py-10">
      <div className="w-full max-w-2xl space-y-10">

        {/* ── Greeting ──────────────────────────────────────────────────────── */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">{greeting}</h1>
          <p className="text-sm text-gray-500">What would you like to do?</p>
        </div>

        {/* ── Quick prompt ───────────────────────────────────────────────────── */}
        <div className="relative">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && prompt.trim()) handleQuickStart() }}
            placeholder="Ask anything — describe a task, question, or idea..."
            className="w-full bg-white border border-gray-200 rounded-2xl pl-5 pr-14 py-4 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
            style={{ focusRingColor: brand.colorButtonPrimary } as React.CSSProperties}
          />
          <button
            onClick={handleQuickStart}
            disabled={!prompt.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl text-white flex items-center justify-center transition-colors disabled:opacity-30"
            style={{ backgroundColor: brand.colorButtonPrimary }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

        {/* ── Action cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Card 1: Guided Session */}
          <button onClick={() => navigate('/work')}
            className="group text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: brand.colorPrimary + '15' }}>
              <svg className="w-5 h-5" style={{ color: brand.colorPrimary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Start a Session</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Open a new AI session. Use the wizard for guided prompts or go freestyle.
            </p>
          </button>

          {/* Card 2: Continue Recent */}
          <button onClick={() => navigate('/work')}
            className="group text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: brand.colorAccent + '15' }}>
              <svg className="w-5 h-5" style={{ color: brand.colorAccent }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Continue Recent Work</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              {recentSessions.length > 0
                ? `Pick up where you left off — ${recentSessions.length} recent session${recentSessions.length !== 1 ? 's' : ''}.`
                : 'No recent sessions yet. Start one above!'}
            </p>
          </button>

          {/* Card 3: Learn */}
          <button onClick={() => navigate('/learn')}
            className="group text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: brand.colorSecondary + '15' }}>
              <svg className="w-5 h-5" style={{ color: brand.colorSecondary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Learn & Explore</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Step-by-step guides and learning tracks tailored to your role.
            </p>
          </button>

          {/* Card 4: Configure */}
          <button onClick={() => navigate('/configure')}
            className="group text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-gray-100">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Settings & Setup</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              {setupComplete ? 'Agents, skills, integrations, and preferences.' : 'Finish your setup and configure your workspace.'}
            </p>
          </button>
        </div>

        {/* ── Recent sessions strip ─────────────────────────────────────────── */}
        {recentSessions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Recent sessions</span>
              <button onClick={() => navigate('/work')} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">View all</button>
            </div>
            <div className="flex gap-2">
              {recentSessions.map((s) => (
                <button key={s.sessionId} onClick={() => navigate('/work')}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-left hover:border-gray-300 hover:shadow-sm transition-all">
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

        {/* ── Setup nudge (only if not complete) ────────────────────────────── */}
        {!setupComplete && (
          <button onClick={() => navigate('/configure')}
            className="w-full text-left rounded-2xl px-5 py-4 flex items-center gap-4 transition-all hover:shadow-md"
            style={{ backgroundColor: brand.colorPrimary + '08', borderColor: brand.colorPrimary + '20', borderWidth: 1 }}>
            <div className="text-2xl flex-shrink-0">🚀</div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-gray-800">Finish your setup</span>
              <p className="text-[10px] text-gray-500 mt-0.5">Complete the Setup Wizard to get the most out of your AI tools.</p>
            </div>
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* ── Status strip ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-4 text-[10px] text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${copilotOk ? 'bg-green-400' : 'bg-gray-300'}`} />
            Copilot {copilotOk ? 'connected' : 'offline'}
          </div>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${claudeOk ? 'bg-green-400' : 'bg-gray-300'}`} />
            Claude {claudeOk ? 'connected' : 'offline'}
          </div>
        </div>
      </div>
    </div>
  )
}
