import { useState, useMemo, useEffect, useCallback } from 'react'
import type { PromptTemplate, TemplateVariable, HydratedTemplate, TemplatePatch } from '../../types/template'
import { isConfigVariable, isLaunchOnlyVariable } from '../../types/template'
import { hydrate, stripVariableTokens, isRequired, normalizeVariables } from '../../../../shared/templates/parse'
import type { BackendId } from '../../../../shared/backends'
import { providerOf } from '../../../../shared/backends'
import { MODEL_TIERS } from '../../data/modelTiers'

interface Props {
  template: PromptTemplate
  /** Which CLI the session uses — selects the model list and provider. */
  cli: BackendId
  /**
   * `launch` (new-session launchpad) honors the full patch, including
   * launch-only variable types. `session` (mid-session "+") applies only what
   * a live process allows and hides launch-only types.
   */
  context: 'launch' | 'session'
  onSubmit: (result: HydratedTemplate) => void
  onCancel: () => void
}

/** Per-variable working value. Only the fields relevant to the type are used. */
interface VarValue {
  text?: string
  paths?: string[]
  files?: { sourcePath: string; name: string; sizeBytes: number }[]
  refs?: { id: string; name: string }[]
}

interface AgentItem { id: string; name: string }
interface SkillItem { id: string; name: string }
interface NoteItem { id: string; title: string }
interface ApprovedFolder { id: string; label: string; path: string }

const emptyValue: VarValue = {}

export default function TemplateForm({ template, cli, context, onSubmit, onCancel }: Props): JSX.Element {
  // Defensive: normalize so a legacy string[] (e.g. unmigrated stored data)
  // can never crash the typed pickers. Main normalizes on read, so this is a
  // belt-and-suspenders fallback.
  const allVars = useMemo(() => normalizeVariables(template.variables), [template.variables])

  // Launch-only variable types are dropped entirely mid-session — a live
  // process can't change its agent or permission mode.
  const fields = useMemo(
    () => allVars.filter((v) => context === 'launch' || !isLaunchOnlyVariable(v.type)),
    [allVars, context],
  )

  const [values, setValues] = useState<Record<string, VarValue>>(() => {
    const init: Record<string, VarValue> = {}
    for (const v of normalizeVariables(template.variables)) {
      init[v.name] = v.default ? { text: v.default } : {}
    }
    return init
  })

  const setVar = useCallback((name: string, next: VarValue) => {
    setValues((prev) => ({ ...prev, [name]: next }))
  }, [])

  // ── Picker data (loaded only for the variable types this template uses) ──────
  const needs = useMemo(() => new Set(fields.map((v) => v.type)), [fields])
  const provider = providerOf(cli)
  const modelTiers = useMemo(() => MODEL_TIERS[provider] ?? [], [provider])

  const [agents, setAgents] = useState<AgentItem[]>([])
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [folders, setFolders] = useState<ApprovedFolder[]>([])

  useEffect(() => {
    if (!needs.has('agent')) return
    void (window.electronAPI.invoke('agent:list', {}) as Promise<{ copilot: AgentItem[]; claude: AgentItem[] }>)
      .then((r) => setAgents([...(r.copilot ?? []), ...(r.claude ?? [])]))
      .catch(() => setAgents([]))
  }, [needs])

  useEffect(() => {
    if (!needs.has('skill')) return
    void (window.electronAPI.invoke('skills:list', { workingDirectory: '.' }) as Promise<SkillItem[]>)
      .then((r) => setSkills(r ?? []))
      .catch(() => setSkills([]))
  }, [needs])

  useEffect(() => {
    if (!needs.has('note')) return
    void (window.electronAPI.invoke('notes:list', undefined) as Promise<NoteItem[]>)
      .then((r) => setNotes(r ?? []))
      .catch(() => setNotes([]))
  }, [needs])

  const loadFolders = useCallback(async () => {
    const list = (await window.electronAPI.invoke('locations:list-approved')) as ApprovedFolder[] | null
    setFolders(list ?? [])
  }, [])

  useEffect(() => {
    if (!needs.has('directory')) return
    void loadFolders()
  }, [needs, loadFolders])

  // ── Hydration → { prompt, patch } ────────────────────────────────────────────
  const result = useMemo<HydratedTemplate>(() => {
    const inlineMap: Record<string, string> = {}
    const patch: TemplatePatch = {}

    for (const v of fields) {
      const val = values[v.name] ?? emptyValue
      switch (v.type) {
        case 'text':
        case 'longtext':
        case 'select':
          inlineMap[v.name] = val.text ?? ''
          break
        case 'directory':
          inlineMap[v.name] = (val.paths ?? []).join(', ')
          if ((val.paths ?? []).length > 0) {
            patch.additionalDirs = [...(patch.additionalDirs ?? []), ...(val.paths ?? [])]
          }
          break
        case 'file':
          // Files are referenced by the framing bundle (Slice 29), not inlined
          // by path — the token reads naturally with the file name(s).
          inlineMap[v.name] = (val.files ?? []).map((f) => f.name).join(', ')
          if ((val.files ?? []).length > 0) {
            patch.pickedFiles = [...(patch.pickedFiles ?? []), ...(val.files ?? [])]
          }
          break
        case 'model':
          if (val.text) patch.model = val.text
          break
        case 'agent':
          if (val.text) patch.agent = val.text
          break
        case 'permissionMode':
          if (val.text) patch.permissionMode = val.text
          break
        case 'skill':
          if ((val.refs ?? []).length > 0) patch.attachedSkills = [...(patch.attachedSkills ?? []), ...(val.refs ?? [])]
          break
        case 'note':
          if ((val.refs ?? []).length > 0) patch.attachedNotes = [...(patch.attachedNotes ?? []), ...(val.refs ?? []).map((r) => r.id)]
          break
      }
    }

    const configNames = fields.filter((v) => isConfigVariable(v.type)).map((v) => v.name)
    const prompt = hydrate(stripVariableTokens(template.body, configNames), inlineMap)
    return { prompt, patch }
  }, [fields, values, template.body])

  // ── "All required satisfied?" — never requires a field this context drops ────
  const satisfied = (v: TemplateVariable): boolean => {
    const val = values[v.name] ?? emptyValue
    switch (v.type) {
      case 'directory': return (val.paths ?? []).length > 0
      case 'file': return (val.files ?? []).length > 0
      case 'skill':
      case 'note': return (val.refs ?? []).length > 0
      default: return !!val.text?.trim()
    }
  }
  const allFilled = fields.every((v) => !isRequired(v) || satisfied(v))

  const handleSubmit = () => {
    onSubmit(result)
    void window.electronAPI.invoke('templates:record-usage', { id: template.id })
  }

  const labelFor = (v: TemplateVariable): string =>
    v.label || v.name.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
          <div className="flex gap-2 mt-2 text-xs text-gray-400">
            <span className="bg-gray-100 px-1.5 py-0.5 rounded">{template.category}</span>
            {template.recommendedModel && <span>model: {template.recommendedModel}</span>}
            {template.recommendedPermissionMode && <span>mode: {template.recommendedPermissionMode}</span>}
          </div>
        </div>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>

      {/* Variable inputs */}
      {fields.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide">Fill in Variables</h4>
          {fields.map((v) => (
            <VariableField
              key={v.name}
              variable={v}
              label={labelFor(v)}
              value={values[v.name] ?? emptyValue}
              onChange={(next) => setVar(v.name, next)}
              modelTiers={modelTiers}
              agents={agents}
              skills={skills}
              notes={notes}
              folders={folders}
              onAddFolder={async () => {
                const res = (await window.electronAPI.invoke('locations:add-approved')) as { canceled?: boolean } | null
                if (res && !res.canceled) await loadFolders()
              }}
            />
          ))}
          {context === 'session' && allVars.some((v) => isLaunchOnlyVariable(v.type)) && (
            <p className="text-[11px] text-gray-400">
              This template also sets agent / permission options — those apply only when starting a new session.
            </p>
          )}
        </div>
      )}

      {/* Preview */}
      <div>
        <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">Preview</h4>
        <div className="bg-gray-900 rounded-lg px-4 py-3 max-h-48 overflow-y-auto">
          <pre className="text-sm text-gray-200 font-mono whitespace-pre-wrap">{result.prompt}</pre>
        </div>
        <PatchSummary patch={result.patch} />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={!allFilled}
          className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {context === 'launch' ? 'Use Template' : 'Send to Active Session'}
        </button>
      </div>
    </div>
  )
}

// ── A single typed field ────────────────────────────────────────────────────

function VariableField({
  variable, label, value, onChange, modelTiers, agents, skills, notes, folders, onAddFolder,
}: {
  variable: TemplateVariable
  label: string
  value: VarValue
  onChange: (v: VarValue) => void
  modelTiers: { group: string; models: string[] }[]
  agents: AgentItem[]
  skills: SkillItem[]
  notes: NoteItem[]
  folders: ApprovedFolder[]
  onAddFolder: () => void
}): JSX.Element {
  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

  const header = (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
      {!isRequired(variable) && <span className="text-gray-400 font-normal"> (optional)</span>}
    </label>
  )

  const toggleRef = (list: { id: string; name: string }[], item: { id: string; name: string }, multiple?: boolean) => {
    const exists = list.some((r) => r.id === item.id)
    if (exists) return list.filter((r) => r.id !== item.id)
    return multiple ? [...list, item] : [item]
  }

  switch (variable.type) {
    case 'longtext':
      return (
        <div>{header}
          <textarea value={value.text ?? ''} rows={3} placeholder={label.toLowerCase()}
            onChange={(e) => onChange({ text: e.target.value })} className={`${inputCls} resize-y`} />
        </div>
      )

    case 'select':
      return (
        <div>{header}
          <select value={value.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} className={inputCls}>
            <option value="">Choose…</option>
            {(variable.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )

    case 'model':
      return (
        <div>{header}
          <select value={value.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} className={inputCls}>
            <option value="">Default</option>
            {modelTiers.map((tier) => (
              <optgroup key={tier.group} label={tier.group}>
                {tier.models.map((m) => <option key={m} value={m}>{m}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      )

    case 'permissionMode':
      return (
        <div>{header}
          <select value={value.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} className={inputCls}>
            <option value="">Default (ask me)</option>
            <option value="plan">Plan</option>
            <option value="acceptEdits">Accept edits</option>
            <option value="auto">Auto-approve</option>
            <option value="bypassPermissions">Full autonomy</option>
          </select>
        </div>
      )

    case 'agent':
      return (
        <div>{header}
          {/* Agent is launch-only; the launchpad keys on the agent ID. */}
          <select value={value.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} className={inputCls}>
            <option value="">No agent (default)</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )

    case 'skill':
      return (
        <div>{header}
          <CheckList
            items={skills.map((s) => ({ id: s.id, name: s.name }))}
            selected={value.refs ?? []}
            emptyHint="No skills yet. Add one in Configure → Skills."
            onToggle={(item) => onChange({ refs: toggleRef(value.refs ?? [], item, variable.multiple) })}
          />
        </div>
      )

    case 'note':
      return (
        <div>{header}
          <CheckList
            items={notes.map((n) => ({ id: n.id, name: n.title }))}
            selected={value.refs ?? []}
            emptyHint="No notes yet. Add one in Notes."
            onToggle={(item) => onChange({ refs: toggleRef(value.refs ?? [], item, variable.multiple ?? true) })}
          />
        </div>
      )

    case 'directory':
      return (
        <div>{header}
          <CheckList
            items={folders.map((f) => ({ id: f.path, name: f.label || f.path }))}
            selected={(value.paths ?? []).map((p) => ({ id: p, name: p }))}
            emptyHint="No approved folders yet."
            onToggle={(item) => {
              const cur = value.paths ?? []
              const exists = cur.includes(item.id)
              const next = exists ? cur.filter((p) => p !== item.id) : (variable.multiple ? [...cur, item.id] : [item.id])
              onChange({ paths: next })
            }}
          />
          <button type="button" onClick={onAddFolder} className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-500">
            + Add a folder…
          </button>
        </div>
      )

    case 'file':
      return (
        <div>{header}
          <div className="space-y-1.5">
            {(value.files ?? []).map((f) => (
              <div key={f.sourcePath} className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                <span className="truncate flex-1">{f.name}</span>
                <button type="button" onClick={() => onChange({ files: (value.files ?? []).filter((x) => x.sourcePath !== f.sourcePath) })}
                  className="text-gray-400 hover:text-gray-600">×</button>
              </div>
            ))}
            <button type="button"
              onClick={async () => {
                const res = (await window.electronAPI.invoke('files:pick')) as
                  { canceled?: boolean; files?: { sourcePath: string; name: string; sizeBytes: number }[] } | null
                if (!res || res.canceled || !res.files) return
                const picked = res.files.map((f) => ({ sourcePath: f.sourcePath, name: f.name, sizeBytes: f.sizeBytes }))
                const cur = value.files ?? []
                const merged = variable.multiple
                  ? [...cur, ...picked.filter((p) => !cur.some((c) => c.sourcePath === p.sourcePath))]
                  : picked.slice(0, 1)
                onChange({ files: merged })
              }}
              className="text-xs text-indigo-600 hover:text-indigo-500">
              + Add file{variable.multiple ? 's' : ''}…
            </button>
          </div>
        </div>
      )

    case 'text':
    default:
      return (
        <div>{header}
          <input type="text" value={value.text ?? ''} placeholder={label.toLowerCase()}
            onChange={(e) => onChange({ text: e.target.value })} className={inputCls} />
        </div>
      )
  }
}

// ── Reusable multi/single check list (skills, notes, directories) ─────────────

function CheckList({
  items, selected, onToggle, emptyHint,
}: {
  items: { id: string; name: string }[]
  selected: { id: string; name: string }[]
  onToggle: (item: { id: string; name: string }) => void
  emptyHint: string
}): JSX.Element {
  if (items.length === 0) return <p className="text-xs text-gray-400 py-1">{emptyHint}</p>
  return (
    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
      {items.map((item) => {
        const sel = selected.some((s) => s.id === item.id)
        return (
          <button key={item.id} type="button" onClick={() => onToggle(item)}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${sel ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-700'}`}>
            <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${sel ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
              {sel && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </span>
            <span className="truncate">{item.name}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Small summary of what the patch will configure ────────────────────────────

function PatchSummary({ patch }: { patch: TemplatePatch }): JSX.Element | null {
  const parts: string[] = []
  if (patch.model) parts.push(`model: ${patch.model}`)
  if (patch.agent) parts.push(`agent: ${patch.agent}`)
  if (patch.permissionMode) parts.push(`mode: ${patch.permissionMode}`)
  if (patch.attachedSkills?.length) parts.push(`${patch.attachedSkills.length} skill${patch.attachedSkills.length === 1 ? '' : 's'}`)
  if (patch.attachedNotes?.length) parts.push(`${patch.attachedNotes.length} note${patch.attachedNotes.length === 1 ? '' : 's'}`)
  if (patch.pickedFiles?.length) parts.push(`${patch.pickedFiles.length} file${patch.pickedFiles.length === 1 ? '' : 's'}`)
  if (patch.additionalDirs?.length) parts.push(`${patch.additionalDirs.length} folder${patch.additionalDirs.length === 1 ? '' : 's'}`)
  if (parts.length === 0) return null
  return <p className="text-[11px] text-gray-500 mt-1.5">Will configure: {parts.join(' · ')}</p>
}
