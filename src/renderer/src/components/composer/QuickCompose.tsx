import { useState, useEffect, useRef, useCallback } from 'react'
import type { PromptTemplate } from '../../types/template'

export interface QuickComposeConfig {
  agent?: string
  delegate?: 'sub-agent' | 'background'
  repo?: string
  skill?: string
  fleet?: boolean
}

interface NoteItem {
  id: string; title: string; content: string; tags: string[]; category: string
  pinned: boolean; updatedAt: number
}

interface Props {
  config: QuickComposeConfig
  onConfigChange: (config: QuickComposeConfig) => void
  cli: 'copilot' | 'claude'
  onTemplateSelect?: (template: PromptTemplate) => void
  selectedNoteIds: Set<string>
  onToggleNote: (id: string) => void
  onClearNotes: () => void
}

const CAT_COLORS: Record<string, string> = {
  meeting: 'bg-blue-900/30 text-blue-400', conversation: 'bg-green-900/30 text-green-400',
  reference: 'bg-purple-900/30 text-purple-400', outcome: 'bg-amber-900/30 text-amber-400',
  idea: 'bg-pink-900/30 text-pink-400', custom: 'bg-gray-800 text-gray-400',
}

export default function QuickCompose({ config, onConfigChange, cli, onTemplateSelect, selectedNoteIds, onToggleNote, onClearNotes }: Props): JSX.Element {
  const [openPicker, setOpenPicker] = useState<'template' | 'agent' | 'memory' | null>(null)
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [search, setSearch] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close picker on outside click
  useEffect(() => {
    if (!openPicker) return
    const handle = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpenPicker(null)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [openPicker])

  // Load data for pickers
  useEffect(() => {
    if (openPicker === 'template') {
      void (window.electronAPI.invoke('templates:list', { search: search || undefined }) as Promise<PromptTemplate[]>).then(setTemplates)
    }
  }, [openPicker, search])

  useEffect(() => {
    if (openPicker === 'agent') {
      void (window.electronAPI.invoke('agent:list', {}) as Promise<{ copilot: Array<{ id: string; name: string }>; claude: Array<{ id: string; name: string }> }>)
        .then((r) => setAgents([...(r.copilot ?? []), ...(r.claude ?? [])]))
    }
  }, [openPicker, cli])

  const loadNotes = useCallback(async () => {
    const result = await window.electronAPI.invoke('notes:list', search ? { search } : undefined) as NoteItem[]
    setNotes(result)
  }, [search])

  useEffect(() => { if (openPicker === 'memory') void loadNotes() }, [openPicker, loadNotes])

  const toggle = (picker: typeof openPicker) => {
    setOpenPicker(openPicker === picker ? null : picker)
    setSearch('')
  }

  const removeBadge = (key: keyof QuickComposeConfig) => {
    const next = { ...config }
    delete next[key]
    onConfigChange(next)
  }

  const hasAnything = config.agent || config.skill || config.delegate || config.fleet || selectedNoteIds.size > 0

  return (
    <div className="border-t border-gray-800 bg-gray-900/80" ref={pickerRef}>
      {/* Active context badges — single row */}
      {hasAnything && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
          {config.agent && (
            <Badge icon="agent" label={config.agent} color="bg-green-900/40 text-green-400 border-green-700/50" onRemove={() => removeBadge('agent')} />
          )}
          {config.skill && (
            <Badge icon="skill" label={config.skill} color="bg-amber-900/40 text-amber-400 border-amber-700/50" onRemove={() => removeBadge('skill')} />
          )}
          {selectedNoteIds.size > 0 && (
            <Badge
              icon="memory"
              label={`${selectedNoteIds.size} memor${selectedNoteIds.size === 1 ? 'y' : 'ies'}`}
              color="bg-indigo-900/40 text-indigo-300 border-indigo-700/50"
              onRemove={onClearNotes}
            />
          )}
          {config.fleet && (
            <Badge icon="fleet" label="Fleet — parallel sub-agents" color="bg-cyan-900/40 text-cyan-300 border-cyan-700/50" onRemove={() => removeBadge('fleet')} />
          )}
          {config.delegate && (
            <Badge icon="delegate" label={config.delegate} color="bg-purple-900/40 text-purple-300 border-purple-700/50" onRemove={() => removeBadge('delegate')} />
          )}
        </div>
      )}

      {/* Toolbar — single row of icon buttons */}
      <div className="flex items-center gap-0.5 px-2 py-1 relative">
        <ToolbarButton
          icon={<TemplateIcon />}
          label="Templates"
          active={openPicker === 'template'}
          highlighted={false}
          onClick={() => toggle('template')}
        />
        <ToolbarButton
          icon={<AgentIcon />}
          label="Agent"
          active={openPicker === 'agent'}
          highlighted={!!config.agent}
          onClick={() => toggle('agent')}
        />
        <ToolbarButton
          icon={<MemoryIcon />}
          label="Memories"
          active={openPicker === 'memory'}
          highlighted={selectedNoteIds.size > 0}
          onClick={() => toggle('memory')}
        />
        {cli === 'copilot' && (
          <ToolbarButton
            icon={<FleetIcon />}
            label="Fleet"
            active={false}
            highlighted={!!config.fleet}
            onClick={() => onConfigChange({ ...config, fleet: !config.fleet })}
          />
        )}
        <ToolbarButton
          icon={<DelegateIcon />}
          label="Delegate"
          active={false}
          highlighted={!!config.delegate}
          onClick={() => onConfigChange({ ...config, delegate: config.delegate ? undefined : 'sub-agent' })}
        />
      </div>

      {/* Dropdown pickers */}
      {openPicker === 'template' && (
        <PickerDropdown>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="mx-2 mt-2 mb-1 bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 w-[calc(100%-1rem)]"
            autoFocus />
          <div className="max-h-48 overflow-y-auto">
            {templates.slice(0, 15).map((t) => (
              <button key={t.id} onClick={() => { setOpenPicker(null); onTemplateSelect?.(t) }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors">
                <span className="text-gray-200">{t.name}</span>
                {t.category && <span className="text-gray-500 ml-1.5">{t.category}</span>}
              </button>
            ))}
            {templates.length === 0 && <p className="text-xs text-gray-500 text-center py-4">No templates found</p>}
          </div>
        </PickerDropdown>
      )}

      {openPicker === 'agent' && (
        <PickerDropdown>
          <div className="max-h-48 overflow-y-auto">
            <button onClick={() => { onConfigChange({ ...config, agent: undefined }); setOpenPicker(null) }}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-800">No agent</button>
            {agents.map((a) => (
              <button key={a.id} onClick={() => { onConfigChange({ ...config, agent: a.name }); setOpenPicker(null) }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors ${config.agent === a.name ? 'text-green-400 bg-green-900/20' : 'text-gray-200'}`}>
                {a.name}
              </button>
            ))}
            {agents.length === 0 && <p className="text-xs text-gray-500 text-center py-4">No agents yet</p>}
          </div>
        </PickerDropdown>
      )}

      {openPicker === 'memory' && (
        <PickerDropdown>
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-300">Attach Memories</span>
            {selectedNoteIds.size > 0 && (
              <button onClick={onClearNotes} className="text-[10px] text-gray-500 hover:text-gray-300">Clear</button>
            )}
          </div>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="mx-2 mt-2 mb-1 bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-200 outline-none w-[calc(100%-1rem)]"
            autoFocus />
          <div className="max-h-52 overflow-y-auto">
            {notes.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">No memories yet</p>
            ) : notes.map((note) => {
              const sel = selectedNoteIds.has(note.id)
              return (
                <button key={note.id} onClick={() => onToggleNote(note.id)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-800/30 transition-colors ${sel ? 'bg-indigo-900/20' : 'hover:bg-gray-800/50'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'}`}>
                      {sel && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-gray-200 truncate block">{note.title}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded ${CAT_COLORS[note.category] ?? CAT_COLORS.custom}`}>{note.category}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </PickerDropdown>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PickerDropdown({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="absolute bottom-full left-0 right-0 mx-2 mb-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-40 overflow-hidden">
      {children}
    </div>
  )
}

function ToolbarButton({ icon, label, active, highlighted, onClick }: {
  icon: JSX.Element; label: string; active: boolean; highlighted: boolean; onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-colors ${
        active ? 'bg-gray-700 text-white' :
        highlighted ? 'text-indigo-400 hover:bg-gray-800' :
        'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
      }`}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function Badge({ icon, label, color, onRemove }: { icon: string; label: string; color: string; onRemove: () => void }): JSX.Element {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${color}`}>
      {icon === 'agent' && <AgentIcon small />}
      {icon === 'skill' && <SkillIcon />}
      {icon === 'memory' && <MemoryIcon small />}
      {icon === 'fleet' && <FleetIcon small />}
      {icon === 'delegate' && <DelegateIcon small />}
      {label}
      <button onClick={onRemove} className="hover:opacity-70 ml-0.5">&times;</button>
    </span>
  )
}

// ── Icons ───────────────────────────────────────────────────────────────────

function TemplateIcon(): JSX.Element {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
}
function AgentIcon({ small }: { small?: boolean }): JSX.Element {
  const sz = small ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
  return <svg className={sz} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
}
function MemoryIcon({ small }: { small?: boolean }): JSX.Element {
  const sz = small ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
  return <svg className={sz} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
}
function SkillIcon(): JSX.Element {
  return <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
}
function FleetIcon({ small }: { small?: boolean }): JSX.Element {
  const sz = small ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
  return <svg className={sz} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
}
function DelegateIcon({ small }: { small?: boolean }): JSX.Element {
  const sz = small ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
  return <svg className={sz} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
}
