import { useCallback, useEffect, useState } from 'react'
import { AgentCard } from '../components/AgentCard'
import { AgentEditor } from '../components/AgentEditor'
import { AgentWizard } from '../components/AgentWizard'
import { ProfileManager } from '../components/ProfileManager'
import type { ActiveAgents, AgentDef, AgentListResult, AgentProfile } from '../types/ipc'

export default function Agents(): JSX.Element {
  const [agentList, setAgentList] = useState<AgentListResult>({ copilot: [], claude: [] })
  const [enabledIds, setEnabledIds] = useState<string[]>([])
  const [activeAgents, setActiveAgents] = useState<ActiveAgents>({ copilot: null, claude: null })
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [loading, setLoading] = useState(true)

  const [editTarget, setEditTarget] = useState<AgentDef | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardCli, setWizardCli] = useState<'copilot' | 'claude'>('copilot')

  // ── Initial load ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [list, enabled, active, profs] = await Promise.all([
      window.electronAPI.invoke('agent:list', {}) as Promise<AgentListResult>,
      window.electronAPI.invoke('agent:get-enabled') as Promise<string[]>,
      window.electronAPI.invoke('agent:get-active') as Promise<ActiveAgents>,
      window.electronAPI.invoke('agent:get-profiles') as Promise<AgentProfile[]>,
    ])
    setAgentList(list)
    setEnabledIds(enabled)
    setActiveAgents(active)
    setProfiles(profs)
    setLoading(false)
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

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

  // ── Edit handler — copies built-in agents to custom files first ────────────

  const handleEdit = async (agent: AgentDef) => {
    if (agent.source === 'file') {
      // Already a custom agent — just open editor
      setEditTarget(agent)
      return
    }
    // Built-in agent: create a copy as a custom file so it's editable
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
      // Reload and open the new copy in the editor
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

  // ─────────────────────────────────────────────────────────────────────────

  const [view, setView] = useState<'agents' | 'profiles'>('agents')

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage built-in and custom agents for your CLI sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWizardOpen(true)}
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
          <AgentSection
            title="GitHub Copilot Agents"
            cli="copilot"
            agents={agentList.copilot}
            enabledIds={enabledIds}
            activeAgentId={activeAgents.copilot}
            loading={loading}
            onToggle={handleToggle}
            onSetActive={(id) => handleSetActive('copilot', id)}
            onEdit={(agent) => void handleEdit(agent)}
            onDelete={handleDelete}
            onCreateCustom={() => { setWizardCli('copilot'); setWizardOpen(true) }}
          />

          <AgentSection
            title="Claude Code Agents"
            cli="claude"
            agents={agentList.claude}
            enabledIds={enabledIds}
            activeAgentId={activeAgents.claude}
            loading={loading}
            onToggle={handleToggle}
            onSetActive={(id) => handleSetActive('claude', id)}
            onEdit={(agent) => void handleEdit(agent)}
            onDelete={handleDelete}
            onCreateCustom={() => { setWizardCli('claude'); setWizardOpen(true) }}
          />
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
          // Auto-enable the new agent
          setEnabledIds((prev) => [...prev, agent.id])
          void window.electronAPI.invoke('agent:set-enabled', {
            ids: [...enabledIds, agent.id],
          })
        }}
      />
    </div>
  )
}

// ── AgentSection ─────────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  cli: 'copilot' | 'claude'
  agents: AgentDef[]
  enabledIds: string[]
  activeAgentId: string | null
  loading: boolean
  onToggle: (id: string, enabled: boolean) => void
  onSetActive: (id: string | null) => void
  onEdit: (agent: AgentDef) => void
  onDelete: (agent: AgentDef) => void
  onCreateCustom: () => void
}

function AgentSection({
  title,
  cli,
  agents,
  enabledIds,
  activeAgentId,
  loading,
  onToggle,
  onSetActive,
  onEdit,
  onDelete,
  onCreateCustom,
}: SectionProps): JSX.Element {
  const color = cli === 'copilot' ? 'text-indigo-600' : 'text-orange-600'

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-sm font-semibold uppercase tracking-wide ${color}`}>{title}</h2>
        <button
          onClick={onCreateCustom}
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
      ) : agents.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400 mb-3">No agents found</p>
          <button
            onClick={onCreateCustom}
            className="text-sm text-indigo-600 hover:underline"
          >
            Create your first agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              enabled={enabledIds.includes(agent.id)}
              isActive={activeAgentId === agent.id}
              onToggle={onToggle}
              onSetActive={onSetActive}
              onEdit={onEdit}
              onDelete={agent.source === 'file' ? onDelete : undefined}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function PlusIcon({ small }: { small?: boolean }): JSX.Element {
  const sz = small ? 'h-3.5 w-3.5' : 'h-4 w-4'
  return (
    <svg className={sz} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}
