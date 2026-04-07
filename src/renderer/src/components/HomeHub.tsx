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

interface ContextCounts {
  memories: number
  agents: number
  skills: number
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HomeHub(): JSX.Element {
  const navigate = useNavigate()
  const { brand } = useBranding()
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [setupComplete, setSetupComplete] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [prompt, setPrompt] = useState('')
  const [context, setContext] = useState<ContextCounts>({ memories: 0, agents: 0, skills: 0 })

  const load = useCallback(async () => {
    try {
      const [sessions, setup, notes, agents] = await Promise.all([
        window.electronAPI.invoke('cli:get-persisted-sessions') as Promise<RecentSession[]>,
        window.electronAPI.invoke('setup-wizard:is-complete') as Promise<{ complete: boolean }>,
        window.electronAPI.invoke('notes:list') as Promise<unknown[]>,
        window.electronAPI.invoke('agent:list') as Promise<{ copilot: unknown[]; claude: unknown[] }>,
      ])
      // Skills count fetched separately — handler requires workingDirectory
      let skillCount = 0
      try {
        const cwd = await window.electronAPI.invoke('app:get-cwd') as string
        const skills = await window.electronAPI.invoke('skills:list', { workingDirectory: cwd }) as unknown[]
        skillCount = (skills ?? []).length
      } catch { /* no skills */ }
      setRecentSessions((sessions ?? []).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)).slice(0, 3))
      setSetupComplete(setup.complete)
      setContext({
        memories: (notes ?? []).length,
        agents: ((agents?.copilot ?? []).length + (agents?.claude ?? []).length),
        skills: skillCount,
      })
    } catch { /* handlers not ready */ }

    const hour = new Date().getHours()
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening')
  }, [])

  useEffect(() => { void load() }, [load])

  const handleQuickStart = () => {
    navigate('/work', { state: { quickPrompt: prompt.trim() } })
  }

  const timeAgo = (ms: number): string => {
    const mins = Math.floor((Date.now() - ms) / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const hasContext = context.memories > 0 || context.agents > 0 || context.skills > 0

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-6 py-10 space-y-8 flex flex-col items-center min-h-full justify-center">

        {/* ── Logo + Greeting ────────────────────────────────────────────── */}
        <div className="text-center space-y-2 w-full">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: brand.colorPrimary }}>
              <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
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
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}</h1>
          <p className="text-sm text-gray-500">Type below to jump in, or pick an option.</p>
        </div>

        {/* ── Quick prompt input ─────────────────────────────────────────── */}
        <div className="relative w-full">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && prompt.trim()) handleQuickStart() }}
            placeholder="What do you need help with?"
            aria-label="Quick prompt"
            className="w-full bg-white border border-gray-200 rounded-2xl pl-5 pr-14 py-4 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
          />
          <button
            onClick={handleQuickStart}
            disabled={!prompt.trim()}
            aria-label="Start session"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl text-white flex items-center justify-center transition-colors disabled:opacity-30"
            style={{ backgroundColor: brand.colorButtonPrimary }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

        {/* ── Action Cards ──────────────────────────────────────────────── */}
        <div className="space-y-3 w-full">
          {/* Card 1: Ask a question or get guidance → Wizard pre-selects "question" option */}
          <button onClick={() => navigate('/work?tab=wizard&wizardOption=question')}
            className="w-full text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all group flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: brand.colorPrimary + '12' }}>
              <span className="text-xl">💬</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Ask a question or get guidance</h3>
              <p className="text-xs text-gray-500 mt-0.5">Need information, an explanation, or advice? The wizard walks you through it.</p>
            </div>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Card 2: Write or do something → Wizard context step (memories/agents/skills) */}
          <button onClick={() => navigate('/work?tab=wizard&wizardStep=context')}
            className="w-full text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all group flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: brand.colorAccent + '12' }}>
              <span className="text-xl">🎯</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Write or do something</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {hasContext
                  ? `Draft, build, or review — with ${context.memories > 0 ? `${context.memories} memories` : ''}${context.memories > 0 && context.agents > 0 ? ', ' : ''}${context.agents > 0 ? `${context.agents} agents` : ''}${(context.memories > 0 || context.agents > 0) && context.skills > 0 ? ', ' : ''}${context.skills > 0 ? `${context.skills} skills` : ''} ready to help.`
                  : 'Draft, build, or review with AI — add memories, agents, and skills to make it even smarter.'}
              </p>
            </div>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Card 3: Explore what I can do */}
          <button onClick={() => navigate('/learn')}
            className="w-full text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all group flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: brand.colorSecondary + '12' }}>
              <svg className="w-5 h-5" style={{ color: brand.colorSecondary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">Explore what I can do</h3>
              <p className="text-xs text-gray-500 mt-0.5">Browse guides, examples, and ideas for how AI can help with your day-to-day work.</p>
            </div>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Card 4: Set up my workspace */}
          <button onClick={() => navigate(setupComplete ? '/configure' : '/configure?tab=setup')}
            className="w-full text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all group flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">
                {setupComplete ? 'Customize my setup' : 'Set up my workspace'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {setupComplete
                  ? 'Fine-tune agents, skills, memories, and preferences to match your workflow.'
                  : 'Quick guided setup to connect your AI tools and personalize the experience.'}
              </p>
            </div>
            {!setupComplete && (
              <span className="text-[9px] px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: brand.colorPrimary + '15', color: brand.colorPrimary }}>
                Recommended
              </span>
            )}
            <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* ── Context nudge (when no memories/agents/skills exist) ───────── */}
        {!hasContext && (
          <div className="w-full bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Make the AI work smarter for you</h3>
              <p className="text-xs text-gray-500 mt-0.5">The more context you give it, the better the results. Start with any of these:</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => navigate('/configure?tab=memory')}
                className="text-left rounded-xl border border-gray-200 p-3 hover:border-gray-300 hover:shadow-sm transition-all group">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: brand.colorAccent + '12' }}>
                  <svg className="w-3.5 h-3.5" style={{ color: brand.colorAccent }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-gray-800">Add a memory</span>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">Meeting notes, project context, decisions</p>
              </button>
              <button onClick={() => navigate('/configure?tab=agents')}
                className="text-left rounded-xl border border-gray-200 p-3 hover:border-gray-300 hover:shadow-sm transition-all group">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: brand.colorPrimary + '12' }}>
                  <svg className="w-3.5 h-3.5" style={{ color: brand.colorPrimary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-gray-800">Create an agent</span>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">Communication coach, reviewer, analyst</p>
              </button>
              <button onClick={() => navigate('/configure?tab=skills')}
                className="text-left rounded-xl border border-gray-200 p-3 hover:border-gray-300 hover:shadow-sm transition-all group">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: brand.colorSecondary + '12' }}>
                  <svg className="w-3.5 h-3.5" style={{ color: brand.colorSecondary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-gray-800">Build a skill</span>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">Email drafts, research briefs, summaries</p>
              </button>
            </div>
          </div>
        )}

        {/* ── Recent sessions (only if they exist) ──────────────────────── */}
        {recentSessions.length > 0 && (
          <div className="space-y-2 pt-2 w-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Pick up where you left off</span>
              <button onClick={() => navigate('/work')} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">All sessions</button>
            </div>
            <div className="flex gap-2">
              {recentSessions.map((s) => (
                <button key={s.sessionId} onClick={() => navigate('/work', { state: { sessionId: s.sessionId } })}
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

      </div>
    </div>
  )
}
