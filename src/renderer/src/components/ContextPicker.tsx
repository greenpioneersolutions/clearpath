import { useState, useEffect, useRef, useCallback } from 'react'
import type { PromptTemplate } from '../types/template'
import type { ContextProviderDeclaration, SelectedContextSource } from '../types/contextSources'
import type { BackendId } from '../../../shared/backends'
import { useFlag } from '../contexts/FeatureFlagContext'
import { NOTE_CATEGORY_COLORS_DARK } from '../lib/noteCategoryColors'

// ── Types reused from QuickCompose ────────────────────────────────────────────

interface NoteItem {
  id: string
  title: string
  content: string
  tags: string[]
  category: string
  pinned: boolean
  updatedAt: number
}

interface AgentItem {
  id: string
  name: string
}

interface SkillItem {
  id: string
  name: string
  description?: string
  cli?: 'copilot' | 'claude' | 'both'
}

export type ContextPickerTab = 'prompts' | 'notes' | 'playbooks' | 'files'

interface Props {
  cli: BackendId
  open: boolean
  onClose: () => void

  // Selected state (controlled from parent)
  selectedAgent?: string
  selectedSkill?: string
  selectedNoteIds: Set<string>
  selectedContextSources: SelectedContextSource[]

  // Selection callbacks
  onSelectAgent: (agent: string | undefined) => void
  onSelectSkill: (skill: string | undefined) => void
  onToggleNote: (id: string) => void
  onClearNotes: () => void
  onToggleContextSource: (source: SelectedContextSource) => void
  onRemoveContextSource: (providerId: string) => void

  // Optional template select (Quick playbook with variables → opens TemplateForm)
  onTemplateSelect?: (template: PromptTemplate) => void

  /** Initial tab to land on. */
  defaultTab?: ContextPickerTab
}

// Shared with the dedicated Notes page so the two surfaces stay in sync.
const CAT_COLORS = NOTE_CATEGORY_COLORS_DARK

/**
 * Unified tabbed context picker — replaces the per-feature dropdowns from QuickCompose.
 *
 * Tabs:
 *   • Prompts    — pre-configured prompt personas (was Agents)
 *   • Notes      — saved reference notes (was Memories)
 *   • Playbooks  — reusable prompt templates AND skills (Quick / Detailed)
 *   • Files      — connected context providers (extensions / integrations)
 *
 * Renders inline as a `bottom-full` popover anchored to its parent, so the consumer
 * is responsible for positioning the wrapping element.
 */
export default function ContextPicker({
  cli,
  open,
  onClose,
  selectedAgent,
  selectedSkill,
  selectedNoteIds,
  selectedContextSources,
  onSelectAgent,
  onSelectSkill,
  onToggleNote,
  onClearNotes,
  onToggleContextSource,
  onRemoveContextSource,
  onTemplateSelect,
  defaultTab = 'prompts',
}: Props): JSX.Element | null {
  const showNotes = useFlag('showNotes')
  // When showNotes is off, the Notes tab cannot be the initial tab — fall
  // back to Prompts so deep-linked callers don't land on a hidden tab.
  const initialTab: ContextPickerTab = !showNotes && defaultTab === 'notes' ? 'prompts' : defaultTab
  const [tab, setTab] = useState<ContextPickerTab>(initialTab)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  // Data
  const [agents, setAgents] = useState<AgentItem[]>([])
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [contextProviders, setContextProviders] = useState<ContextProviderDeclaration[]>([])
  const [contextParams, setContextParams] = useState<Record<string, Record<string, string>>>({})

  // Reset tab + search when re-opened. If showNotes is off, the Notes tab
  // cannot be the initial tab — fall back to Prompts.
  useEffect(() => {
    if (open) {
      setTab(!showNotes && defaultTab === 'notes' ? 'prompts' : defaultTab)
      setSearch('')
    }
  }, [open, defaultTab, showNotes])

  // Outside click closes
  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open, onClose])

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || tab !== 'prompts') return
    void (window.electronAPI.invoke('agent:list', {}) as Promise<{
      copilot: AgentItem[]
      claude: AgentItem[]
    }>)
      .then((r) => setAgents([...(r.copilot ?? []), ...(r.claude ?? [])]))
      .catch(() => setAgents([]))
  }, [open, tab, cli])

  const loadNotes = useCallback(async () => {
    const result = (await window.electronAPI.invoke(
      'notes:list',
      search ? { search } : undefined,
    )) as NoteItem[]
    setNotes(result ?? [])
  }, [search])

  useEffect(() => {
    // notes:list IS NOT flag-gated on the main side — the IPC handlers stay
    // registered regardless of showNotes. We just don't fetch from the
    // renderer when the flag is off, so flipping the flag back on returns
    // the same data.
    if (!open || tab !== 'notes' || !showNotes) return
    void loadNotes()
  }, [open, tab, loadNotes, showNotes])

  // Playbooks = templates + skills (merged)
  useEffect(() => {
    if (!open || tab !== 'playbooks') return
    void (window.electronAPI.invoke('templates:list', {
      search: search || undefined,
    }) as Promise<PromptTemplate[]>)
      .then((r) => setTemplates(r ?? []))
      .catch(() => setTemplates([]))

    // skills:list takes a workingDirectory arg in main; use cwd as a sensible default
    void (window.electronAPI.invoke('skills:list', { workingDirectory: '.' }) as Promise<SkillItem[]>)
      .then((r) => setSkills(r ?? []))
      .catch(() => setSkills([]))
  }, [open, tab, search])

  useEffect(() => {
    if (!open || tab !== 'files') return
    void (window.electronAPI.invoke('context-sources:list') as Promise<ContextProviderDeclaration[]>)
      .then(setContextProviders)
      .catch(() => setContextProviders([]))
  }, [open, tab])

  if (!open) return null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={wrapRef}
      role="dialog"
      aria-label="Attach context"
      className="absolute bottom-full left-0 mb-2 w-[420px] max-w-[95vw] rounded-xl shadow-2xl z-50 overflow-hidden animate-fadeIn"
      style={{ backgroundColor: 'var(--brand-dark-card)', border: '1px solid var(--brand-dark-border)' }}
    >
      {/* Header / tabs */}
      <div className="flex items-center border-b border-gray-800">
        {(
          [
            ['prompts', 'Prompts'],
            ...(showNotes ? [['notes', 'Notes']] as const : []),
            ['playbooks', 'Playbooks'],
            ['files', 'Files'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key)
              setSearch('')
            }}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              tab === key
                ? 'text-white border-b-2 border-indigo-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search bar (not shown on Files — has its own UI) */}
      {tab !== 'files' && (
        <div className="px-2 pt-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab}...`}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
            autoFocus
          />
        </div>
      )}

      {/* Body */}
      <div className="max-h-[340px] overflow-y-auto">
        {tab === 'prompts' && (
          <PromptList
            agents={agents.filter((a) =>
              search ? a.name.toLowerCase().includes(search.toLowerCase()) : true,
            )}
            selected={selectedAgent}
            onSelect={(name) => {
              onSelectAgent(name)
              onClose()
            }}
          />
        )}

        {tab === 'notes' && (
          <NotesList
            notes={notes}
            selectedIds={selectedNoteIds}
            onToggle={onToggleNote}
            onClear={onClearNotes}
          />
        )}

        {tab === 'playbooks' && (
          <PlaybookList
            templates={templates}
            skills={skills.filter((s) =>
              search ? s.name.toLowerCase().includes(search.toLowerCase()) : true,
            )}
            selectedSkill={selectedSkill}
            onSelectTemplate={(t) => {
              onClose()
              onTemplateSelect?.(t)
            }}
            onSelectSkill={(name) => {
              onSelectSkill(name)
              onClose()
            }}
          />
        )}

        {tab === 'files' && (
          <FilesList
            providers={contextProviders}
            selected={selectedContextSources}
            onToggle={onToggleContextSource}
            onRemove={onRemoveContextSource}
            params={contextParams}
            onParamsChange={setContextParams}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

// ── Prompts ───────────────────────────────────────────────────────────────────

function PromptList({
  agents,
  selected,
  onSelect,
}: {
  agents: AgentItem[]
  selected?: string
  onSelect: (name: string | undefined) => void
}): JSX.Element {
  return (
    <div className="py-1">
      <button
        onClick={() => onSelect(undefined)}
        className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-800"
      >
        No prompt (default)
      </button>
      {agents.map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(a.name)}
          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors ${
            selected === a.name ? 'text-green-400 bg-green-900/20' : 'text-gray-200'
          }`}
        >
          {a.name}
        </button>
      ))}
      {agents.length === 0 && (
        <p className="text-xs text-gray-500 text-center py-6">
          No prompts yet. Create one in Configure → Prompts.
        </p>
      )}
    </div>
  )
}

// ── Notes ─────────────────────────────────────────────────────────────────────

function NotesList({
  notes,
  selectedIds,
  onToggle,
  onClear,
}: {
  notes: NoteItem[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
}): JSX.Element {
  return (
    <div>
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center justify-between">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
          {selectedIds.size} selected
        </span>
        {selectedIds.size > 0 && (
          <button onClick={onClear} className="text-[10px] text-gray-500 hover:text-gray-300">
            Clear
          </button>
        )}
      </div>
      {notes.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-6">
          No notes yet. Add one in Configure → Notes.
        </p>
      ) : (
        notes.map((note) => {
          const sel = selectedIds.has(note.id)
          return (
            <button
              key={note.id}
              onClick={() => onToggle(note.id)}
              className={`w-full text-left px-3 py-2 border-b border-gray-800/30 transition-colors ${
                sel ? 'bg-indigo-900/20' : 'hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    sel ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'
                  }`}
                >
                  {sel && (
                    <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-200 truncate block">{note.title}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded ${CAT_COLORS[note.category] ?? CAT_COLORS.custom}`}>
                    {note.category}
                  </span>
                </div>
              </div>
            </button>
          )
        })
      )}
    </div>
  )
}

// ── Playbooks (templates + skills merged) ─────────────────────────────────────

function PlaybookList({
  templates,
  skills,
  selectedSkill,
  onSelectTemplate,
  onSelectSkill,
}: {
  templates: PromptTemplate[]
  skills: SkillItem[]
  selectedSkill?: string
  onSelectTemplate: (t: PromptTemplate) => void
  onSelectSkill: (name: string | undefined) => void
}): JSX.Element {
  if (templates.length === 0 && skills.length === 0) {
    return (
      <p className="text-xs text-gray-500 text-center py-6">
        No playbooks yet. Build one in Configure → Playbooks.
      </p>
    )
  }
  return (
    <div>
      {templates.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-900/50">
            Quick (fill-in)
          </div>
          {templates.slice(0, 25).map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTemplate(t)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">Quick</span>
              <span className="text-gray-200 truncate">{t.name}</span>
              {t.category && <span className="text-gray-500 ml-auto">{t.category}</span>}
            </button>
          ))}
        </>
      )}
      {skills.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-900/50">
            Detailed
          </div>
          {skills.slice(0, 25).map((s) => {
            const sel = selectedSkill === s.name
            return (
              <button
                key={s.id}
                onClick={() => onSelectSkill(sel ? undefined : s.name)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors flex items-center gap-2 ${
                  sel ? 'bg-amber-900/20 text-amber-300' : 'text-gray-200'
                }`}
              >
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">Detailed</span>
                <span className="truncate">{s.name}</span>
                {sel && (
                  <svg className="w-3 h-3 text-amber-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── Files (context providers) ─────────────────────────────────────────────────

function FilesList({
  providers,
  selected,
  onToggle,
  onRemove,
  params,
  onParamsChange,
  onClose,
}: {
  providers: ContextProviderDeclaration[]
  selected: SelectedContextSource[]
  onToggle: (source: SelectedContextSource) => void
  onRemove: (providerId: string) => void
  params: Record<string, Record<string, string>>
  onParamsChange: (next: Record<string, Record<string, string>>) => void
  onClose: () => void
}): JSX.Element {
  if (providers.length === 0) {
    return (
      <p className="text-xs text-gray-500 text-center py-6">
        No connected sources. Add a connection in Connect → Integrations.
      </p>
    )
  }
  return (
    <div>
      {(['extension', 'integration'] as const).map((sourceType) => {
        const group = providers.filter((p) => p.source === sourceType)
        if (group.length === 0) return null
        return (
          <div key={sourceType}>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-900/50">
              {sourceType === 'extension' ? 'Extensions' : 'Integrations'}
            </div>
            {group.map((provider) => {
              const isSelected = selected.some((s) => s.providerId === provider.id)
              const isConnected = provider.connected
              const p = params[provider.id] ?? {}

              return (
                <div
                  key={provider.id}
                  className={`border-b border-gray-800/30 ${!isConnected ? 'opacity-40' : ''}`}
                >
                  <button
                    onClick={() => {
                      if (!isConnected) return
                      if (provider.parameters.length === 0) {
                        if (isSelected) {
                          onRemove(provider.id)
                        } else {
                          onToggle({
                            providerId: provider.id,
                            label: provider.label,
                            icon: provider.icon,
                            params: {},
                            paramSummary: '',
                          })
                        }
                      } else {
                        onParamsChange({ ...params, [provider.id]: params[provider.id] ?? {} })
                      }
                    }}
                    disabled={!isConnected}
                    className={`w-full text-left px-3 py-2 transition-colors ${
                      isSelected ? 'bg-teal-900/20' : 'hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-teal-600 border-teal-600' : 'border-gray-600'
                        }`}
                      >
                        {isSelected && (
                          <svg
                            className="w-2 h-2 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-200">{provider.label}</span>
                          <span className="text-[9px] text-gray-500">{provider.sourceName}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 truncate">{provider.description}</p>
                      </div>
                      {!isConnected && <span className="text-[9px] text-gray-600">Not connected</span>}
                    </div>
                  </button>

                  {isConnected && provider.parameters.length > 0 && params[provider.id] !== undefined && (
                    <div className="px-3 pb-2 space-y-1.5">
                      {provider.parameters.map((param) => (
                        <input
                          key={param.id}
                          type="text"
                          value={p[param.id] ?? ''}
                          onChange={(e) => {
                            onParamsChange({
                              ...params,
                              [provider.id]: { ...(params[provider.id] ?? {}), [param.id]: e.target.value },
                            })
                          }}
                          placeholder={param.placeholder ?? param.label}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-teal-500"
                        />
                      ))}
                      <button
                        onClick={() => {
                          const missing = provider.parameters.filter((pp) => pp.required && !p[pp.id]?.trim())
                          if (missing.length > 0) return
                          const summary = provider.parameters.map((pp) => p[pp.id] ?? '').filter(Boolean).join('/')
                          if (isSelected) onRemove(provider.id)
                          onToggle({
                            providerId: provider.id,
                            label: provider.label,
                            icon: provider.icon,
                            params: p,
                            paramSummary: summary,
                          })
                          onClose()
                        }}
                        className="w-full bg-teal-700 hover:bg-teal-600 text-white text-xs py-1 rounded transition-colors"
                      >
                        {isSelected ? 'Update' : 'Add'} Source
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
