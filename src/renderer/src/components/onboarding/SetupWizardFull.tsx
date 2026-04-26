import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { InstallModal } from '../InstallModal'
import type { AuthState, AuthStatus } from '../../types/ipc'

interface SetupState {
  cliInstalled: boolean
  authenticated: boolean
  agentCreated: boolean
  skillCreated: boolean
  memoryCreated: boolean
  triedWizard: boolean
  completedAt: number | null
}

type Step = 'welcome' | 'cli' | 'auth' | 'memory' | 'done'

const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'welcome', label: 'Welcome', icon: '👋' },
  { key: 'cli', label: 'CLI Tools', icon: '⚙️' },
  { key: 'auth', label: 'Authentication', icon: '🔑' },
  { key: 'memory', label: 'Your First Note', icon: '📝' },
  { key: 'done', label: 'All Set!', icon: '✅' },
]

// ── Component ────────────────────────────────────────────────────────────────

export default function SetupWizardFull(): JSX.Element {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [setupState, setSetupState] = useState<SetupState | null>(null)
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [loading, setLoading] = useState(true)

  // Memory creation form
  const [memTitle, setMemTitle] = useState('')
  const [memCategory, setMemCategory] = useState('meeting')
  const [memContent, setMemContent] = useState('')
  const [memSaving, setMemSaving] = useState(false)

  // Login state
  const [loginOutput, setLoginOutput] = useState<string[]>([])
  const [loginStatus, setLoginStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle')

  // Install modal state — replaces the old "copy-paste this npm command" strings
  const [installTarget, setInstallTarget] = useState<'copilot' | 'claude' | null>(null)

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
    else if (state.memoryCreated) setStep('done')
    else if (state.authenticated) setStep('memory')
    else if (state.cliInstalled) setStep('auth')
    setLoading(false)
  }, [])

  useEffect(() => { void loadState() }, [loadState])

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
          A few quick steps to get you running. We'll connect your CLI tools, save your first note,
          and you'll be ready to use the AI in seconds.
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
              A friendly home for the AI tools that help you work faster. We'll get your CLI connected
              and capture your first note — then you can explore prompts and playbooks at your own pace.
            </p>
            <p className="text-xs text-gray-400">Takes about 3 minutes. Leave and come back anytime.</p>
            <button onClick={() => setStep('cli')}
              className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors text-sm">
              Let's Get Started
            </button>
          </div>
        )}

        {/* ── CLI + SDK Installation (2x2 grid, per backend) ───────────────── */}
        {step === 'cli' && authState && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Step 1: Choose how to connect</h2>
              <p className="text-sm text-gray-500 mt-1">
                CoPilot Commander supports two ways to reach each AI provider — pick the installed CLI or the programmatic SDK (API key). At least one backend must be ready to continue.
              </p>
            </div>

            {/* Copilot row */}
            <div>
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">GitHub Copilot</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Copilot CLI */}
                <BackendCard
                  label="Copilot CLI"
                  status={authState.copilot.cli}
                  readyText="Installed"
                  installLabel="Install CLI"
                  onInstall={() => setInstallTarget('copilot')}
                />
                {/* Copilot SDK */}
                <BackendCard
                  label="Copilot SDK"
                  status={authState.copilot.sdk}
                  readyText="Token set · Ready"
                  tokenHint="Set GH_TOKEN / GITHUB_TOKEN in Settings → Environment"
                  showTokenHint
                />
              </div>
            </div>

            {/* Claude row */}
            <div>
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Claude</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Claude CLI */}
                <BackendCard
                  label="Claude CLI"
                  status={authState.claude.cli}
                  readyText="Installed"
                  installLabel="Install CLI"
                  onInstall={() => setInstallTarget('claude')}
                />
                {/* Claude SDK */}
                <BackendCard
                  label="Claude SDK"
                  status={authState.claude.sdk}
                  readyText="API key set · Ready"
                  tokenHint="Set ANTHROPIC_API_KEY in Settings → Environment"
                  showTokenHint
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => void refreshAuth()}
                className="px-4 py-2 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Re-check Installation
              </button>
              {(authState.copilot.cli.installed || authState.claude.cli.installed ||
                authState.copilot.sdk.installed || authState.claude.sdk.installed) && (
                <button onClick={() => { void updateStep({ cliInstalled: true }); setStep('auth') }}
                  className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors">
                  Next: Authentication
                </button>
              )}
            </div>

            {!authState.copilot.cli.installed && !authState.claude.cli.installed &&
             !authState.copilot.sdk.installed && !authState.claude.sdk.installed && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
                Install a CLI above, or set an API key (GH_TOKEN for Copilot SDK, ANTHROPIC_API_KEY for Claude SDK) under Settings → Environment.
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
                  setStep('memory')
                }}
                  className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors">
                  Next: Save Your First Note
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Memory Creation ──────────────────────────────────────────────── */}
        {step === 'memory' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Step 3: Create Your First Note</h2>
              <p className="text-sm text-gray-500 mt-1">
                Notes are the context that makes your prompts truly powerful. When you save a note, your prompt can reference it
                later — so instead of re-explaining the same meeting, project, or decision, the AI already knows what happened.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-base">
                  📝
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Why notes matter</h3>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    You save a note once and then use it over and over. Capture a meeting, and your prompt
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
              <button onClick={() => setStep('auth')} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Back</button>
              <button
                onClick={async () => {
                  if (!memTitle.trim() || !memContent.trim()) return
                  setMemSaving(true)
                  await window.electronAPI.invoke('notes:create', {
                    title: memTitle.trim(), content: memContent.trim(), category: memCategory, tags: [],
                  })
                  await updateStep({ memoryCreated: true })
                  setMemSaving(false)
                  setStep('done')
                }}
                disabled={memSaving || !memTitle.trim() || !memContent.trim()}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                {memSaving ? 'Saving...' : 'Save Note & Finish'}
              </button>
              <button onClick={() => { void updateStep({ memoryCreated: true }); setStep('done') }}
                className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Skip for now</button>
            </div>
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="text-center max-w-lg mx-auto py-8 space-y-6">
            <div className="text-5xl">🎉</div>
            <h2 className="text-xl font-bold text-gray-900">You're All Set!</h2>
            <p className="text-sm text-gray-600">
              You're ready to go. Try a quick chat below — and explore prompts and playbooks
              from the Configure page whenever you want to add more context for the AI.
            </p>

            <div className="grid grid-cols-3 gap-3 text-center max-w-sm mx-auto">
              {[
                { label: 'CLI Connected', done: setupState?.authenticated, icon: '🔑' },
                { label: 'Note Saved', done: setupState?.memoryCreated, icon: '📝' },
                { label: 'Ready', done: true, icon: '✨' },
              ].map(({ label, done, icon }) => (
                <div key={label} className={`rounded-xl p-4 border ${done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <span className="text-2xl">{icon}</span>
                  <p className="text-xs font-medium text-gray-700 mt-1">{label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-center gap-3 pt-4">
              <button onClick={() => {
                void updateStep({ triedWizard: true, completedAt: Date.now() })
                navigate('/work')
              }}
                className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors text-sm">
                Try It Now — Start a Chat
              </button>
              <p className="text-xs text-gray-400 max-w-sm">
                Jumps you to the Work page so you can start chatting with the AI right away.
              </p>
            </div>
          </div>
        )}
      </div>

      {installTarget !== null && (
        <InstallModal
          cli={installTarget}
          isOpen
          onClose={() => {
            setInstallTarget(null)
            void refreshAuth()
          }}
          onInstalled={() => {
            // Chain straight into login after install completes
            const cli = installTarget
            setInstallTarget(null)
            void refreshAuth().then(() => {
              if (cli) void startLogin(cli)
            })
          }}
        />
      )}
    </div>
  )
}

// ── BackendCard helper ───────────────────────────────────────────────────────
// Renders a status tile for one of the 4 backends. CLI variants get an Install
// button when not installed; SDK variants get a "token hint" pointing users to
// the env-vars settings page.

interface BackendCardProps {
  label: string
  status: AuthStatus
  readyText: string
  installLabel?: string
  onInstall?: () => void
  tokenHint?: string
  showTokenHint?: boolean
}

function BackendCard({
  label, status, readyText, installLabel, onInstall, tokenHint, showTokenHint,
}: BackendCardProps): JSX.Element {
  const ready = status.installed
  return (
    <div className={`border rounded-xl p-5 space-y-3 ${ready ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${ready ? 'bg-green-500' : 'bg-gray-300'}`} />
        <h4 className="text-sm font-semibold text-gray-800">{label}</h4>
      </div>
      {ready ? (
        <div className="space-y-1">
          <p className="text-xs text-green-700">{readyText}</p>
          {status.binaryPath && <p className="text-[10px] text-gray-400 font-mono truncate">{status.binaryPath}</p>}
          {status.version && <p className="text-[10px] text-gray-400">v{status.version}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Not ready</p>
          {onInstall && (
            <button
              onClick={onInstall}
              className="w-full px-4 py-2 bg-[#5B4FC4] text-white rounded-lg text-xs font-medium hover:bg-[#4a3fb3] transition-colors"
            >
              {installLabel ?? 'Install'}
            </button>
          )}
          {showTokenHint && tokenHint && (
            <p className="text-[10px] text-gray-500 leading-relaxed">{tokenHint}</p>
          )}
        </div>
      )}
    </div>
  )
}
