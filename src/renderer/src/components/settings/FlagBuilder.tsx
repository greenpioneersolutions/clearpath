import { useState } from 'react'
import type { FlagDef } from '../../types/settings'
import { getFlagsForCli, getCategoriesForCli } from './flagDefs'

interface Props {
  cli: 'copilot' | 'claude'
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  onReset: (key: string) => void
  onResetAll: () => void
}

export default function FlagBuilder({ cli, values, onChange, onReset, onResetAll }: Props): JSX.Element {
  const categories = getCategoriesForCli(cli)
  const [activeCategory, setActiveCategory] = useState(categories[0] ?? '')
  const allFlags = getFlagsForCli(cli)
  const categoryFlags = allFlags.filter((f) => f.category === activeCategory)

  const flagKey = (f: FlagDef) => `${f.cli}:${f.key}`
  const hasOverrides = Object.keys(values).some((k) => k.startsWith(`${cli}:`))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          CLI Flags — {cli === 'copilot' ? 'GitHub Copilot' : 'Claude Code'}
        </h3>
        {hasOverrides && (
          <button
            onClick={onResetAll}
            className="text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            Reset All
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeCategory === cat
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Flag controls */}
      <div className="space-y-2">
        {categoryFlags.map((flag) => {
          const key = flagKey(flag)
          const val = values[key]
          const isSet = val !== undefined && val !== null && val !== ''
          return (
            <FlagControl
              key={key}
              flag={flag}
              value={val}
              isSet={isSet}
              onChange={(v) => onChange(key, v)}
              onReset={() => onReset(key)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Individual flag control ──────────────────────────────────────────────────

function FlagControl({
  flag,
  value,
  isSet,
  onChange,
  onReset,
}: {
  flag: FlagDef
  value: unknown
  isSet: boolean
  onChange: (v: unknown) => void
  onReset: () => void
}): JSX.Element {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors ${
      isSet ? 'border-indigo-200 bg-indigo-50/50' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-800">{flag.label}</span>
          <code className="text-xs text-gray-400 font-mono">{flag.flag}</code>
        </div>
        <p className="text-xs text-gray-500">{flag.description}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {flag.type === 'boolean' && (
          <ToggleSwitch
            checked={!!value}
            onChange={(v) => onChange(v || undefined)}
          />
        )}

        {flag.type === 'string' && (
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value || undefined)}
            placeholder="..."
            className="w-48 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        )}

        {flag.type === 'number' && (
          <input
            type="number"
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="..."
            className="w-28 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        )}

        {flag.type === 'enum' && (
          <select
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="w-40 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Default</option>
            {flag.enumValues?.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}

        {flag.type === 'tags' && (
          <TagInput
            value={Array.isArray(value) ? value as string[] : []}
            onChange={(tags) => onChange(tags.length > 0 ? tags : undefined)}
          />
        )}

        {isSet && (
          <button
            onClick={onReset}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors p-1"
            title="Reset to default"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Toggle switch ────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ── Tag input ────────────────────────────────────────────────────────────────

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }): JSX.Element {
  const [input, setInput] = useState('')

  const add = () => {
    const val = input.trim()
    if (!val || value.includes(val)) return
    onChange([...value, val])
    setInput('')
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Add..."
          className="w-32 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button onClick={add} className="text-xs text-indigo-600 hover:text-indigo-800 px-1">+</button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {value.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700 font-mono">
              {tag}
              <button onClick={() => onChange(value.filter((t) => t !== tag))} className="hover:text-red-600">x</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
