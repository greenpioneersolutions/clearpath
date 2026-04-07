import { useCallback, useEffect, useState } from 'react'
import { AgentCard } from '../components/AgentCard'
import { AgentEditor } from '../components/AgentEditor'
import { AgentWizard } from '../components/AgentWizard'
import { ProfileManager } from '../components/ProfileManager'
import { StarterAgentWalkthrough } from '../components/StarterAgentWalkthrough'
import type { ActiveAgents, AgentDef, AgentListResult, AgentProfile } from '../types/ipc'

interface StarterAgent {
  id: string
  name: string
  tagline: string
  description: string
  category: 'spotlight' | 'default'
  handles: string[]
  systemPrompt: string
  associatedSkills: string[]
}

export default function Agents(): JSX.Element {
  const [agentList, setAgentList] = useState<AgentListResult>({ copilot: [], claude: [] })
  const [enabledIds, setEnabledIds] = useState<string[]>([])
  const [activeAgents, setActiveAgents] = useState<ActiveAgents>({ copilot: null, claude: null })
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [starterAgents, setStarterAgents] = useState<StarterAgent[]>([])
  const [loading, setLoading] = useState(true)

  const [editTarget, setEditTarget] = useState<AgentDef | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardCli, setWizardCli] = useState<'copilot' | 'claude'>('copilot')

  // Starter walkthrough state
  const [walkthroughAgent, setWalkthroughAgent] = useState<StarterAgent | null>(null)

  // ── Initial load ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [list, enabled, active, profs, starters] = await Promise.all([
      window.electronAPI.invoke('agent:list', {}) as Promise<AgentListResult>,
      window.electronAPI.invoke('agent:get-enabled') as Promise<string[]>,
      window.electronAPI.invoke('agent:get-active') as Promise<ActiveAgents>,
      window.electronAPI.invoke('agent:get-profiles') as Promise<AgentProfile[]>,
      window.electronAPI.invoke('starter-pack:get-visible-agents') as Promise<StarterAgent[]>,
    ])
    setAgentList(list)
    setEnabledIds(enabled)
    setActiveAgents(active)
    setProfiles(profs)
    setStarterAgents(Array.isArray(starters) ? starters : [])
    setLoading(false)
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

  // ── Determine active CLI (default to copilot) ────────────────────────────

  const activeCli: 'copilot' | 'claude' =
    activeAgents.claude && !activeAgents.copilot ? 'claude' : 'copilot'

  // ── All user agents (combined copilot + claude) ──────────────────────────

  const allUserAgents = [...agentList.copilot, ...agentList.claude]

  // ── Toggle handler ────────────────────────────────────────────────────────

  const handleToggle = (id: string, newEnabled: boolean) => {
    const next = newEnabled ? [...enabledIds, id] : enabledIds.filter((x) => x !== id)
    setEnabledIds(next)
    void window.electronAPI.invoke('agent:set-enabled', { ids: next })
  }

  // ── Active agent handler ──────────────────────────────────────────────────

  const handleSetActive = (cli: 'copilot' | 'claude', agentId: string | null) => {
    setActiveAgents((prev) => ({ ...prev, [cli]: agentId }))
    void window.electronAPI.invoke('agent:set-active', { cli, agentId })
  }

  // ── Edit handler ──────────────────────────────────────────────────────────

  const handleEdit = async (agent: AgentDef) => {
    if (agent.source === 'file') {
      setEditTarget(agent)
      return
    }
    if (!window.confirm(`"${agent.name}" is a built-in agent. We'll create a customizable copy that you can edit. Continue?`)) return
    try {
      const result = await window.electronAPI.invoke('agent:create', {
        def: {
          cli: agent.cli,
          name: `${agent.name} (Custom)`,
          description: agent.description,
          model: agent.model,
          tools: agent.tools,
          prompt: agent.prompt,
        },
      }) as { agentDef: AgentDef }
      await loadAll()
      setEditTarget(result.agentDef)
    } catch (e) {
      window.alert(`Failed to copy agent: ${e}`)
    }
  }

  // ── Delete handler ────────────────────────────────────────────────────────

  const handleDelete = (agent: AgentDef) => {
    if (!agent.filePath) return
    if (!window.confirm(`Delete agent "${agent.name}"? This will remove the file from disk.`)) return
    void window.electronAPI
      .invoke('agent:delete', { filePath: agent.filePath })
      .then(loadAll)
  }

  // ── Profile handlers ──────────────────────────────────────────────────────

  const handleSaveProfile = (name: string) => {
    void (
      window.electronAPI.invoke('agent:save-profile', { name, enabledAgentIds: enabledIds }) as Promise<AgentProfile>
    ).then((p) => setProfiles((prev) => {
      const existing = prev.findIndex((x) => x.name === name)
      return existing >= 0
        ? prev.map((x) => (x.name === name ? p : x))
        : [...prev, p]
    }))
  }

  const handleApplyProfile = (profileId: string) => {
    void (
      window.electronAPI.invoke('agent:apply-profile', { profileId }) as Promise<string[] | null>
    ).then((ids) => { if (ids) setEnabledIds(ids) })
  }

  const handleDeleteProfile = (profileId: string) => {
    void window.electronAPI
      .invoke('agent:delete-profile', { profileId })
      .then(() => setProfiles((prev) => prev.filter((p) => p.id !== profileId)))
  }

  // ── Check if a starter agent was already created ─────────────────────────

  const createdAgentNames = new Set(allUserAgents.map((a) => a.name.toLowerCase()))
  const isStarterCreated = (starter: StarterAgent) =>
    createdAgentNames.has(starter.name.toLowerCase())

  // ─────────────────────────────────────────────────────────────────────────

  const [view, setView] = useState<'agents' | 'profiles'>('agents')

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Create and manage agents for your CLI sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setWizardCli(activeCli); setWizardOpen(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <PlusIcon />
            Create Agent
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button onClick={() => setView('agents')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${view === 'agents' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            All Agents
          </button>
          <button onClick={() => setView('profiles')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${view === 'profiles' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            Agent Profiles ({profiles.length})
          </button>
        </nav>
      </div>

      {view === 'agents' && (
        <div className="space-y-8">
          {/* ── Starter Pack: Try These Agents ── */}
          {starterAgents.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-1">
                <SparkleIcon />
                <h2 className="text-sm font-semibold text-gray-900">Starter Pack</h2>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Recommended agents to get you started. Pick one and we'll walk you through creating it — click-click-done.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {starterAgents.map((agent) => {
                  const alreadyCreated = isStarterCreated(agent)
                  return (
                    <div
                      key={agent.id}
                      className={`relative bg-white border rounded-xl p-4 transition-all ${
                        alreadyCreated
                          ? 'border-green-200 bg-green-50/30'
                          : 'border-gray-200 hover:shadow-md hover:border-indigo-300 cursor-pointer'
                      }`}
                      onClick={() => { if (!alreadyCreated) setWalkthroughAgent(agent) }}
                    >
                      {/* Badge */}
                      {alreadyCreated ? (
                        <span className="absolute top-3 right-3 text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          Created
                        </span>
                      ) : agent.category === 'spotlight' ? (
                        <span className="absolute top-3 right-3 text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                          Spotlight
                        </span>
                      ) : null}

                      <div className="pr-16">
                        <h3 className="text-sm font-semibold text-gray-900 mb-0.5">{agent.name}</h3>
                        <p className="text-xs text-indigo-600 mb-1.5">{agent.tagline}</p>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-3">{agent.description}</p>

                      {!alreadyCreated ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setWalkthroughAgent(agent) }}
                          className="w-full text-xs font-medium px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Try This Agent
                        </button>
                      ) : (
                        <p className="text-xs text-green-600 text-center py-1.5">
                          Already in your agents
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Your Agents ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                Your Agents
              </h2>
              <button
                onClick={() => { setWizardCli(activeCli); setWizardOpen(true) }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
              >
                <PlusIcon small />
                Custom
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : allUserAgents.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
                <p className="text-sm text-gray-400 mb-2">No agents yet</p>
                <p className="text-xs text-gray-400 mb-4">
                  Pick one from the Starter Pack above, or create your own from scratch.
                </p>
                <button
                  onClick={() => { setWizardCli(activeCli); setWizardOpen(true) }}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Create from scratch
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {allUserAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    enabled={enabledIds.includes(agent.id)}
                    isActive={activeAgents[agent.cli] === agent.id}
                    onToggle={handleToggle}
                    onSetActive={(id) => handleSetActive(agent.cli, id)}
                    onEdit={(a) => void handleEdit(a)}
                    onDelete={agent.source === 'file' ? handleDelete : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {view === 'profiles' && (
        <div className="max-w-2xl">
          <ProfileManager
            profiles={profiles}
            enabledAgentIds={enabledIds}
            onApply={handleApplyProfile}
            onSave={handleSaveProfile}
            onDelete={handleDeleteProfile}
          />
        </div>
      )}

      {/* Modals */}
      <AgentEditor
        agent={editTarget}
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        onSaved={() => { setEditTarget(null); void loadAll() }}
      />

      <AgentWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        defaultCli={wizardCli}
        onCreated={(agent) => {
          setWizardOpen(false)
          setAgentList((prev) => ({
            ...prev,
            [agent.cli]: [...prev[agent.cli], agent],
          }))
          setEnabledIds((prev) => [...prev, agent.id])
          void window.electronAPI.invoke('agent:set-enabled', {
            ids: [...enabledIds, agent.id],
          })
        }}
      />

      {walkthroughAgent && (
        <StarterAgentWalkthrough
          agent={walkthroughAgent}
          activeCli={activeCli}
          isOpen={walkthroughAgent !== null}
          onClose={() => setWalkthroughAgent(null)}
          onCreated={(agent) => {
            setAgentList((prev) => ({
              ...prev,
              [agent.cli]: [...prev[agent.cli], agent],
            }))
            setEnabledIds((prev) => {
              const next = [...prev, agent.id]
              void window.electronAPI.invoke('agent:set-enabled', { ids: next })
              return next
            })
          }}
        />
      )}
    </div>
  )
}

// ── Icons ───────────────────────────────────────────────────────────────────

function PlusIcon({ small }: { small?: boolean }): JSX.Element {
  const sz = small ? 'h-3.5 w-3.5' : 'h-4 w-4'
  return (
    <svg className={sz} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}

function SparkleIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  )
}
