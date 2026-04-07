import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface AuthStatus {
  installed: boolean
  authenticated: boolean
  binaryPath?: string
  version?: string
}

interface AuthState {
  copilot: AuthStatus
  claude: AuthStatus
}

interface SetupState {
  cliInstalled: boolean
  authenticated: boolean
  agentCreated: boolean
  skillCreated: boolean
  memoryCreated: boolean
  triedWizard: boolean
  completedAt: number | null
}

type Step = 'welcome' | 'cli' | 'auth' | 'agent' | 'skill' | 'memory' | 'tryit' | 'done'

const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'welcome', label: 'Welcome', icon: '👋' },
  { key: 'cli', label: 'CLI Tools', icon: '⚙️' },
  { key: 'auth', label: 'Authentication', icon: '🔑' },
  { key: 'agent', label: 'Your Agent', icon: '🤖' },
  { key: 'skill', label: 'Your Skill', icon: '⚡' },
  { key: 'memory', label: 'Your Memory', icon: '📝' },
  { key: 'tryit', label: 'Try It Out', icon: '🚀' },
  { key: 'done', label: 'All Set!', icon: '✅' },
]

// ── Component ────────────────────────────────────────────────────────────────

export default function SetupWizardFull(): JSX.Element {
  const [step, setStep] = useState<Step>('welcome')
  const [setupState, setSetupState] = useState<SetupState | null>(null)
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [loading, setLoading] = useState(true)

  // Agent creation form — pre-filled from Communication Coach starter
  const [agentName, setAgentName] = useState('Communication Coach')
  const [agentDesc, setAgentDesc] = useState('')
  const [agentPrompt, setAgentPrompt] = useState('')
  const [agentCli, setAgentCli] = useState<'copilot' | 'claude'>('copilot')
  const [agentSaving, setAgentSaving] = useState(false)
  const [agentLoaded, setAgentLoaded] = useState(false)

  // Skill creation form — pre-filled from Audience & Tone Rewrite starter
  const [skillName, setSkillName] = useState('Audience & Tone Rewrite')
  const [skillDesc, setSkillDesc] = useState('')
  const [skillBody, setSkillBody] = useState('')
  const [skillCli, setSkillCli] = useState<'copilot' | 'claude'>('copilot')
  const [skillSaving, setSkillSaving] = useState(false)
  const [skillLoaded, setSkillLoaded] = useState(false)

  // Memory creation form
  const [memTitle, setMemTitle] = useState('')
  const [memCategory, setMemCategory] = useState('meeting')
  const [memContent, setMemContent] = useState('')
  const [memSaving, setMemSaving] = useState(false)

  // Login state
  const [loginOutput, setLoginOutput] = useState<string[]>([])
  const [loginStatus, setLoginStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle')

  const loadState = useCallback(async () => {
    setLoading(true)
    const [state, auth] = await Promise.all([
      window.electronAPI.invoke('setup-wizard:get-state') as Promise<SetupState>,
      window.electronAPI.invoke('auth:get-status') as Promise<AuthState>,
    ])
    setSetupState(state)
    setAuthState(auth)
    // Jump to the first incomplete step
    if (state.completedAt) setStep('done')
    else if (state.triedWizard) setStep('done')
    else if (state.memoryCreated) setStep('tryit')
    else if (state.skillCreated) setStep('memory')
    else if (state.agentCreated) setStep('skill')
    else if (state.authenticated) setStep('agent')
    else if (state.cliInstalled) setStep('auth')
    setLoading(false)
  }, [])

  useEffect(() => { void loadState() }, [loadState])

  // Pre-fill agent and skill from starter pack
  useEffect(() => {
    if (agentLoaded && skillLoaded) return
    void (async () => {
      const [agentDef, skillDef] = await Promise.all([
        window.electronAPI.invoke('starter-pack:get-agent', { id: 'communication-coach' }) as Promise<{ name: string; description: string; systemPrompt: string } | null>,
        window.electronAPI.invoke('starter-pack:get-skill', { id: 'audience-tone-rewrite' }) as Promise<{ name: string; description: string; skillPrompt: string } | null>,
      ])
      if (agentDef && !agentLoaded) {
        setAgentName(agentDef.name)
        setAgentDesc(agentDef.description)
        setAgentPrompt(agentDef.systemPrompt)
        setAgentLoaded(true)
      }
      if (skillDef && !skillLoaded) {
        setSkillName(skillDef.name)
        setSkillDesc(skillDef.description)
        setSkillBody(skillDef.skillPrompt)
        setSkillLoaded(true)
      }
    })()
  }, [agentLoaded, skillLoaded])

  // Listen for login events
  useEffect(() => {
    const unsub1 = window.electronAPI.on('auth:login-output', (data: { line: string }) => {
      setLoginOutput((prev) => [...prev.slice(-50), data.line])
    })
    const unsub2 = window.electronAPI.on('auth:login-complete', (data: { success: boolean }) => {
      setLoginStatus(data.success ? 'success' : 'failed')
      if (data.success) void refreshAuth()
    })
    return () => { unsub1(); unsub2() }
  }, [])

  const updateStep = async (updates: Partial<SetupState>) => {
    const result = await window.electronAPI.invoke('setup-wizard:update-step', updates) as SetupState
    setSetupState(result)
    return result
  }

  const refreshAuth = async () => {
    const auth = await window.electronAPI.invoke('auth:refresh') as AuthState
    setAuthState(auth)
    if (auth.copilot.authenticated || auth.claude.authenticated) {
      await updateStep({ authenticated: true })
    }
    if (auth.copilot.installed || auth.claude.installed) {
      await updateStep({ cliInstalled: true })
    }
  }

  const startLogin = async (cli: 'copilot' | 'claude') => {
    setLoginOutput([])
    setLoginStatus('running')
    await window.electronAPI.invoke('auth:login-start', { cli })
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step)

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading setup wizard...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Setup Wizard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Let's get you set up step by step. We'll install your tools, create your first agent, skill, and memory,
          then bring them all together in a live session.
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1">
            <button
              onClick={() => setStep(s.key)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition-all ${
                i < stepIndex ? 'bg-green-500 text-white' :
                i === stepIndex ? 'bg-indigo-600 text-white ring-2 ring-indigo-300' :
                'bg-gray-200 text-gray-500'
              }`}
              title={s.label}
            >
              {i < stepIndex ? '✓' : s.icon}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 rounded ${i < stepIndex ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 min-h-[400px]">

        {/* ── Welcome ──────────────────────────────────────────────────────── */}
        {step === 'welcome' && (
          <div className="text-center max-w-lg mx-auto py-8 space-y-6">
            <div className="text-5xl">👋</div>
            <h2 className="text-xl font-bold text-gray-900">Welcome to CoPilot Commander</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We're going to walk you through everything you need to get started.
              By the end, you'll have your CLI tools installed, your first AI agent that matches your communication style,
              a skill based on your expertise, and a saved memory — all working together.
            </p>
            <p className="text-xs text-gray-400">This takes about 5-10 minutes. You can leave and come back at any time.</p>
            <button onClick={() => setStep('cli')}
              className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors text-sm">
              Let's Get Started
            </button>
          </div>
        )}

        {/* ── CLI Installation ──────────────────────────────────────────────── */}
        {step === 'cli' && authState && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Step 1: CLI Tools</h2>
              <p className="text-sm text-gray-500 mt-1">CoPilot Commander needs at least one CLI tool installed to work.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Copilot */}
              <div className={`border rounded-xl p-5 space-y-3 ${authState.copilot.installed ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${authState.copilot.installed ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <h3 className="text-sm font-semibold text-gray-800">GitHub Copilot CLI</h3>
                </div>
                {authState.copilot.installed ? (
                  <div className="space-y-1">
                    <p className="text-xs text-green-700">Installed</p>
                    {authState.copilot.binaryPath && <p className="text-[10px] text-gray-400 font-mono truncate">{authState.copilot.binaryPath}</p>}
                    {authState.copilot.version && <p className="text-[10px] text-gray-400">v{authState.copilot.version}</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Not installed yet</p>
                    <div className="bg-gray-900 rounded-lg px-3 py-2">
                      <code className="text-xs text-green-400">npm install -g @github/copilot</code>
                    </div>
                    <p className="text-[10px] text-gray-400">Or via Homebrew: <code className="bg-gray-100 px-1 rounded">brew install copilot-cli</code></p>
                  </div>
                )}
              </div>

              {/* Claude */}
              <div className={`border rounded-xl p-5 space-y-3 ${authState.claude.installed ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${authState.claude.installed ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <h3 className="text-sm font-semibold text-gray-800">Claude Code CLI</h3>
                </div>
                {authState.claude.installed ? (
                  <div className="space-y-1">
                    <p className="text-xs text-green-700">Installed</p>
                    {authState.claude.binaryPath && <p className="text-[10px] text-gray-400 font-mono truncate">{authState.claude.binaryPath}</p>}
                    {authState.claude.version && <p className="text-[10px] text-gray-400">v{authState.claude.version}</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Not installed yet</p>
                    <div className="bg-gray-900 rounded-lg px-3 py-2">
                      <code className="text-xs text-green-400">npm install -g @anthropic-ai/claude-code</code>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => void refreshAuth()}
                className="px-4 py-2 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Re-check Installation
              </button>
              {(authState.copilot.installed || authState.claude.installed) && (
                <button onClick={() => { void updateStep({ cliInstalled: true }); setStep('auth') }}
                  className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors">
                  Next: Authentication
                </button>
              )}
            </div>

            {!authState.copilot.installed && !authState.claude.installed && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
                Install at least one CLI tool above, then click "Re-check Installation" to continue.
                You'll need Node.js 22+ installed first.
              </div>
            )}
          </div>
        )}

        {/* ── Authentication ───────────────────────────────────────────────── */}
        {step === 'auth' && authState && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Step 2: Authentication</h2>
              <p className="text-sm text-gray-500 mt-1">Sign in to the CLI tools you have installed.</p>
            </div>

            <div className="space-y-4">
              {authState.copilot.installed && (
                <div className={`border rounded-xl p-5 ${authState.copilot.authenticated ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${authState.copilot.authenticated ? 'bg-green-500' : 'bg-amber-400'}`} />
                      <h3 className="text-sm font-semibold text-gray-800">GitHub Copilot</h3>
                      {authState.copilot.authenticated && <span className="text-xs text-green-600">Connected</span>}
                    </div>
                    {!authState.copilot.authenticated && (
                      <button onClick={() => void startLogin('copilot')} disabled={loginStatus === 'running'}
                        className="px-4 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
                        Sign In with GitHub
                      </button>
                    )}
                  </div>
                  {!authState.copilot.authenticated && (
                    <p className="text-[10px] text-gray-400 mt-2">
                      This will open a GitHub device code flow. You'll get a code to enter at github.com/login/device.
                    </p>
                  )}
                </div>
              )}

              {authState.claude.installed && (
                <div className={`border rounded-xl p-5 ${authState.claude.authenticated ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${authState.claude.authenticated ? 'bg-green-500' : 'bg-amber-400'}`} />
                      <h3 className="text-sm font-semibold text-gray-800">Claude Code</h3>
                      {authState.claude.authenticated && <span className="text-xs text-green-600">Connected</span>}
                    </div>
                    {!authState.claude.authenticated && (
                      <button onClick={() => void startLogin('claude')} disabled={loginStatus === 'running'}
                        className="px-4 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-400 disabled:opacity-40 transition-colors">
                        Sign In with Anthropic
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Login terminal output */}
              {loginOutput.length > 0 && (
                <div className="bg-gray-900 rounded-lg px-4 py-3 max-h-40 overflow-y-auto">
                  {loginOutput.map((line, i) => (
                    <p key={i} className="text-[11px] text-gray-300 font-mono leading-relaxed">{line}</p>
                  ))}
                  {loginStatus === 'running' && <span className="inline-block w-2 h-3 bg-green-400 animate-pulse" />}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setStep('cli')} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Back</button>
              <button onClick={() => void refreshAuth()}
                className="px-4 py-2 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Re-check Auth
              </button>
              {(authState.copilot.authenticated || authState.claude.authenticated) && (
                <button onClick={() => {
                  void updateStep({ authenticated: true })
                  setAgentCli(authState!.copilot.authenticated ? 'copilot' : 'claude')
                  setSkillCli(authState!.copilot.authenticated ? 'copilot' : 'claude')
                  setStep('agent')
                }}
                  className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors">
                  Next: Create Your Agent
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Agent Creation ───────────────────────────────────────────────── */}
        {step === 'agent' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Step 3: Set Up Your First Agent</h2>
              <p className="text-sm text-gray-500 mt-1">
                Agents are specialized AI assistants with a clear focus. We recommend starting with a <strong>Communication Coach</strong> — an agent
                that helps you draft emails, prepare for difficult conversations, write stakeholder updates, and communicate with confidence.
              </p>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-base">
                  🤖
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Why a Communication Coach?</h3>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Communication is the single skill every professional uses daily. A Communication Coach agent knows your style,
                    your audience, and your goals — so instead of staring at a blank email for 10 minutes, you get a polished draft
                    in seconds. It's the quickest way to see the power of a personalized agent.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Agent Name</label>
                <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea value={agentDesc} onChange={(e) => setAgentDesc(e.target.value)} rows={2}
                  placeholder="What this agent does..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              {authState && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">CLI Target</label>
                  <div className="flex gap-2">
                    {authState.copilot.authenticated && (
                      <button onClick={() => setAgentCli('copilot')}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${agentCli === 'copilot' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                        GitHub Copilot
                      </button>
                    )}
                    {authState.claude.authenticated && (
                      <button onClick={() => setAgentCli('claude')}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${agentCli === 'claude' ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                        Claude Code
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-600">
                  This agent comes pre-loaded with a full Communication Coach system prompt from our Starter Pack.
                  It's ready to use as-is — just create it and go. You can customize the prompt anytime from the <strong>Agents</strong> page.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setStep('auth')} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Back</button>
              <button
                onClick={async () => {
                  if (!agentName.trim()) return
                  setAgentSaving(true)
                  await window.electronAPI.invoke('agent:create', {
                    def: {
                      cli: agentCli,
                      name: agentName.trim(),
                      description: agentDesc.trim() || 'Communication Coach from Starter Pack',
                      prompt: agentPrompt,
                    },
                  })
                  await updateStep({ agentCreated: true })
                  setAgentSaving(false)
                  setStep('skill')
                }}
                disabled={agentSaving || !agentName.trim()}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                {agentSaving ? 'Creating...' : 'Create Agent & Continue'}
              </button>
              <button onClick={() => { void updateStep({ agentCreated: true }); setStep('skill') }}
                className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Skip for now</button>
            </div>
          </div>
        )}

        {/* ── Skill Creation ───────────────────────────────────────────────── */}
        {step === 'skill' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Step 4: Pair It with a Skill</h2>
              <p className="text-sm text-gray-500 mt-1">
                Skills teach agents <em>how</em> to do specific tasks. We recommend pairing your Communication Coach
                with the <strong>Audience & Tone Rewrite</strong> skill — it helps rewrite any message for a specific
                audience and tone, so your communication always lands the right way.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-base">
                  ⚡
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Why this skill?</h3>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Every time you write something for a different audience — an executive summary, a team update,
                    a client email — the tone, detail level, and structure need to change. This skill handles that automatically.
                    Give it your rough draft, tell it who's reading, and it produces a calibrated rewrite with an explanation of what changed.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Skill Name</label>
                <input type="text" value={skillName} onChange={(e) => setSkillName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={skillDesc} onChange={(e) => setSkillDesc(e.target.value)}
                  placeholder="What this skill does"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-600">
                  This skill comes pre-loaded with a full Audience & Tone Rewrite prompt from our Starter Pack.
                  It's ready to use as-is. You can edit the prompt anytime from the <strong>Skills</strong> page.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setStep('agent')} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Back</button>
              <button
                onClick={async () => {
                  if (!skillName.trim() || !skillBody.trim()) return
                  setSkillSaving(true)
                  const cwd = await window.electronAPI.invoke('app:get-cwd') as string
                  await window.electronAPI.invoke('skills:save', {
                    name: skillName.trim(), description: skillDesc.trim(), body: skillBody.trim(),
                    scope: 'global', cli: skillCli, workingDirectory: cwd,
                  })
                  await updateStep({ skillCreated: true })
                  setSkillSaving(false)
                  setStep('memory')
                }}
                disabled={skillSaving || !skillName.trim() || !skillBody.trim()}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                {skillSaving ? 'Saving...' : 'Create Skill & Continue'}
              </button>
              <button onClick={() => { void updateStep({ skillCreated: true }); setStep('memory') }}
                className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Skip for now</button>
            </div>
          </div>
        )}

        {/* ── Memory Creation ──────────────────────────────────────────────── */}
        {step === 'memory' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Step 5: Create Your First Memory</h2>
              <p className="text-sm text-gray-500 mt-1">
                Memories are the context that makes your agents truly powerful. When you save a memory, your agent can reference it
                later — so instead of re-explaining the same meeting, project, or decision, the AI already knows what happened.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-base">
                  📝
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Why memory matters</h3>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    You save a memory once and then use it over and over. Capture a meeting, and your agent
                    can draft the follow-up emails, track the action items, and reference the decisions weeks later.
                    That's the power: save it once, never re-explain it.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Pick a category to get started — what do you want to capture?</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'meeting', label: 'A Meeting', desc: 'Meeting notes, decisions made, action items to follow up on', icon: '🗓️', placeholder: 'Paste or type your meeting notes here. Include who attended, what was decided, and what needs to happen next.' },
                  { id: 'conversation', label: 'A Conversation', desc: 'Something you need to communicate or take action on', icon: '💬', placeholder: 'Describe the conversation — who it was with, what was discussed, and what action you need to take.' },
                  { id: 'reference', label: 'A Reference', desc: 'Something you want to come back to later — a newsletter, a report, research', icon: '📌', placeholder: 'Paste the reference material here — an article summary, report findings, or notes you want to revisit.' },
                  { id: 'outcome', label: 'An Outcome', desc: 'A decision or result you need to drive or track', icon: '🎯', placeholder: 'Describe the outcome — what decision was made, what the expected result is, and what you need to do next.' },
                  { id: 'idea', label: 'An Idea', desc: 'Something you\'re developing that you want to refine', icon: '💡', placeholder: 'Write out your idea — even rough notes are fine. You can ask your agent to help refine it later.' },
                ] as const).map((cat) => (
                  <button key={cat.id}
                    onClick={() => {
                      setMemCategory(cat.id)
                      if (!memTitle) setMemTitle('')
                      if (!memContent) setMemContent('')
                    }}
                    className={`text-left px-4 py-3 border rounded-xl transition-all ${
                      memCategory === cat.id
                        ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{cat.icon}</span>
                      <span className="text-xs font-medium text-gray-800">{cat.label}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">{cat.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                <input type="text" value={memTitle} onChange={(e) => setMemTitle(e.target.value)}
                  placeholder={memCategory === 'meeting' ? 'e.g., Q1 Planning Meeting Notes'
                    : memCategory === 'conversation' ? 'e.g., Follow-up with Sarah re: project timeline'
                    : memCategory === 'reference' ? 'e.g., Industry Report Key Findings'
                    : memCategory === 'outcome' ? 'e.g., Budget Approval Decision'
                    : 'e.g., New onboarding flow idea'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Content</label>
                <textarea value={memContent} onChange={(e) => setMemContent(e.target.value)} rows={8}
                  placeholder={
                    memCategory === 'meeting' ? 'Paste or type your meeting notes here. Include who attended, what was decided, and what needs to happen next.'
                    : memCategory === 'conversation' ? 'Describe the conversation — who it was with, what was discussed, and what action you need to take.'
                    : memCategory === 'reference' ? 'Paste the reference material here — an article summary, report findings, or notes you want to revisit.'
                    : memCategory === 'outcome' ? 'Describe the outcome — what decision was made, what the expected result is, and what you need to do next.'
                    : 'Write out your idea — even rough notes are fine. You can ask your agent to help refine it later.'
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setStep('skill')} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Back</button>
              <button
                onClick={async () => {
                  if (!memTitle.trim() || !memContent.trim()) return
                  setMemSaving(true)
                  await window.electronAPI.invoke('notes:create', {
                    title: memTitle.trim(), content: memContent.trim(), category: memCategory, tags: [],
                  })
                  await updateStep({ memoryCreated: true })
                  setMemSaving(false)
                  setStep('tryit')
                }}
                disabled={memSaving || !memTitle.trim() || !memContent.trim()}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                {memSaving ? 'Saving...' : 'Save Memory & Continue'}
              </button>
              <button onClick={() => { void updateStep({ memoryCreated: true }); setStep('tryit') }}
                className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Skip for now</button>
            </div>
          </div>
        )}

        {/* ── Try It Out ───────────────────────────────────────────────────── */}
        {step === 'tryit' && (
          <div className="text-center max-w-lg mx-auto py-8 space-y-6">
            <div className="text-5xl">🚀</div>
            <h2 className="text-xl font-bold text-gray-900">Bring It All Together</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Your agent, skill, and memory are all set up. Now let's use them together!
              Head to the <strong>Work</strong> page and use the <strong>Session Wizard</strong>.
              Choose "Use Context" and you'll see all three available to select.
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-left space-y-3">
              <p className="text-xs font-semibold text-gray-700">Here's what to do:</p>
              <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside">
                <li>Go to the <strong>Work</strong> tab in the sidebar</li>
                <li>Click <strong>Wizard</strong> at the top to start a guided session</li>
                <li>Choose <strong>Use Context</strong></li>
                <li>Select your memory, agent, and skill from the tabs</li>
                <li>Write a prompt — for example: <em>"Based on my meeting notes, draft a follow-up email to the team"</em></li>
                <li>Launch the session and see them all work together!</li>
              </ol>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setStep('memory')} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Back</button>
              <button onClick={() => { void updateStep({ triedWizard: true }); setStep('done') }}
                className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors text-sm">
                I'm Ready — Complete Setup
              </button>
            </div>
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="text-center max-w-lg mx-auto py-8 space-y-6">
            <div className="text-5xl">🎉</div>
            <h2 className="text-xl font-bold text-gray-900">You're All Set!</h2>
            <p className="text-sm text-gray-600">
              Setup is complete. You have everything you need to start working with AI assistants.
            </p>

            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Agent', done: setupState?.agentCreated, icon: '🤖' },
                { label: 'Skill', done: setupState?.skillCreated, icon: '⚡' },
                { label: 'Memory', done: setupState?.memoryCreated, icon: '📝' },
              ].map(({ label, done, icon }) => (
                <div key={label} className={`rounded-xl p-4 border ${done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <span className="text-2xl">{icon}</span>
                  <p className="text-xs font-medium text-gray-700 mt-1">{label}</p>
                  <p className={`text-[10px] mt-0.5 ${done ? 'text-green-600' : 'text-gray-400'}`}>
                    {done ? 'Created' : 'Skipped'}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-3 pt-4">
              <button onClick={() => setStep('welcome')}
                className="px-4 py-2 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Restart Wizard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
