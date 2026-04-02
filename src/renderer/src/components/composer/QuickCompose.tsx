import { useState, useEffect } from 'react'
import type { PromptTemplate } from '../../types/template'

export interface QuickComposeConfig {
  agent?: string
  delegate?: 'sub-agent' | 'background'
  repo?: string
  skill?: string
}

interface Props {
  config: QuickComposeConfig
  onConfigChange: (config: QuickComposeConfig) => void
  cli: 'copilot' | 'claude'
  onTemplateSelect?: (template: PromptTemplate) => void
}

export default function QuickCompose({ config, onConfigChange, cli, onTemplateSelect }: Props): JSX.Element {
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [tplSearch, setTplSearch] = useState('')

  useEffect(() => {
    if (showTemplatePicker) {
      void (window.electronAPI.invoke('templates:list', { search: tplSearch || undefined }) as Promise<PromptTemplate[]>)
        .then(setTemplates)
    }
  }, [showTemplatePicker, tplSearch])

  useEffect(() => {
    if (showAgentPicker) {
      void (window.electronAPI.invoke('agent:list', {}) as Promise<{ copilot: Array<{ id: string; name: string }>; claude: Array<{ id: string; name: string }> }>)
        .then((result) => setAgents(result[cli] ?? []))
    }
  }, [showAgentPicker, cli])

  const hasBadges = config.agent || config.delegate || config.repo || config.skill
  const removeBadge = (key: keyof QuickComposeConfig) => {
    const next = { ...config }
    delete next[key]
    onConfigChange(next)
  }

  return (
    <div className="border-t border-gray-800 bg-gray-900/80">
      {/* Active badges */}
      {hasBadges && (
        <div className="flex items-center gap-1.5 px-3 pt-2 flex-wrap">
          {config.agent && (
            <Badge label={`Agent: ${config.agent}`} color="bg-indigo-900/50 text-indigo-300 border-indigo-700/50" onRemove={() => removeBadge('agent')} />
          )}
          {config.delegate && (
            <Badge label={`Delegate: ${config.delegate}`} color="bg-purple-900/50 text-purple-300 border-purple-700/50" onRemove={() => removeBadge('delegate')} />
          )}
          {config.repo && (
            <Badge label={`Repo: ${config.repo}`} color="bg-green-900/50 text-green-300 border-green-700/50" onRemove={() => removeBadge('repo')} />
          )}
          {config.skill && (
            <Badge label={`Skill: ${config.skill}`} color="bg-yellow-900/50 text-yellow-300 border-yellow-700/50" onRemove={() => removeBadge('skill')} />
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1">
        {/* Template picker */}
        <div className="relative">
          <button onClick={() => { setShowTemplatePicker(!showTemplatePicker); setShowAgentPicker(false) }}
            className={`p-1.5 rounded text-xs transition-colors ${showTemplatePicker ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
            title="Insert Template">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </button>
          {showTemplatePicker && (
            <div className="absolute bottom-full left-0 mb-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 max-h-64 overflow-hidden flex flex-col">
              <input type="text" value={tplSearch} onChange={(e) => setTplSearch(e.target.value)}
                placeholder="Search templates..."
                className="m-2 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 outline-none" />
              <div className="overflow-y-auto flex-1">
                {templates.slice(0, 15).map((t) => (
                  <button key={t.id} onClick={() => { setShowTemplatePicker(false); onTemplateSelect?.(t) }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 transition-colors">
                    <span className="text-gray-200">{t.name}</span>
                    <span className="text-gray-500 ml-1.5">{t.category}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Agent picker */}
        <div className="relative">
          <button onClick={() => { setShowAgentPicker(!showAgentPicker); setShowTemplatePicker(false) }}
            className={`p-1.5 rounded text-xs transition-colors ${config.agent ? 'bg-indigo-900/50 text-indigo-300' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
            title="Attach Agent">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </button>
          {showAgentPicker && (
            <div className="absolute bottom-full left-0 mb-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
              <button onClick={() => { onConfigChange({ ...config, agent: undefined }); setShowAgentPicker(false) }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700">Default (no agent)</button>
              {agents.map((a) => (
                <button key={a.id} onClick={() => { onConfigChange({ ...config, agent: a.name }); setShowAgentPicker(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700">{a.name}</button>
              ))}
            </div>
          )}
        </div>

        {/* Delegate toggle */}
        <button
          onClick={() => onConfigChange({ ...config, delegate: config.delegate ? undefined : 'sub-agent' })}
          className={`p-1.5 rounded text-xs transition-colors ${config.delegate ? 'bg-purple-900/50 text-purple-300' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
          title="Delegate this prompt"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
        </button>
      </div>
    </div>
  )
}

function Badge({ label, color, onRemove }: { label: string; color: string; onRemove: () => void }): JSX.Element {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${color}`}>
      {label}
      <button onClick={onRemove} className="hover:opacity-70 ml-0.5 text-[8px]">x</button>
    </span>
  )
}
