import { useState, useEffect, useCallback } from 'react'

interface Category {
  key: string
  label: string
  placeholder: string
}

const CATEGORIES: Category[] = [
  {
    key: 'Code Style',
    label: 'Code Style',
    placeholder: 'e.g. Use TypeScript strict mode, prefer functional components, use descriptive variable names…',
  },
  {
    key: 'Testing',
    label: 'Testing',
    placeholder: 'e.g. Write unit tests for all utility functions, use integration tests for API endpoints…',
  },
  {
    key: 'Architecture',
    label: 'Architecture',
    placeholder: 'e.g. Follow existing patterns, keep components small and focused, separate UI from business logic…',
  },
  {
    key: 'Communication Preferences',
    label: 'Communication Preferences',
    placeholder: 'e.g. Be concise and direct, explain tradeoffs when making recommendations…',
  },
  {
    key: 'Review Guidelines',
    label: 'Review Guidelines',
    placeholder: 'e.g. Check for security vulnerabilities, identify performance issues, verify error handling…',
  },
]

function parseSections(md: string): Record<string, string> {
  const result: Record<string, string> = {}
  // Split on ## headings
  const parts = md.split(/^## /m)
  for (const part of parts.slice(1)) {
    const newline = part.indexOf('\n')
    if (newline === -1) continue
    const heading = part.slice(0, newline).trim()
    const body = part.slice(newline + 1).trim()
    result[heading] = body
  }
  return result
}

function buildMarkdown(
  existing: string,
  sections: Record<string, string>,
): string {
  // Preserve any content before the first ## heading
  const headerMatch = existing.match(/^([\s\S]*?)(?=^## |\z)/m)
  const header = headerMatch ? headerMatch[1].trimEnd() : ''

  const sectionParts = Object.entries(sections)
    .filter(([, body]) => body.trim())
    .map(([heading, body]) => `## ${heading}\n${body.trim()}`)

  return [header, ...sectionParts].filter(Boolean).join('\n\n') + '\n'
}

interface Props {
  cli: 'copilot' | 'claude'
  workingDirectory: string
}

export default function InstructionsEditor({ cli, workingDirectory }: Props): JSX.Element {
  const [sections, setSections] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState('')
  const [filePath, setFilePath] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const targetFile = cli === 'claude'
    ? `${workingDirectory}/CLAUDE.md`
    : `${workingDirectory}/AGENTS.md`

  const load = useCallback(async () => {
    setFilePath(targetFile)
    const result = await window.electronAPI.invoke('memory:read-file', { path: targetFile }) as
      | { content: string }
      | { error: string }

    const raw = 'content' in result ? result.content : ''
    setOriginal(raw)
    setSections(parseSections(raw))
  }, [targetFile])

  useEffect(() => { void load() }, [load])

  const handleChange = (key: string, value: string) => {
    setSections((prev) => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    setSaveMsg('')
    const md = buildMarkdown(original, sections)
    const result = await window.electronAPI.invoke('memory:write-file', {
      path: filePath,
      content: md,
    }) as { success?: boolean; error?: string }
    setSaving(false)
    if (result.error) {
      setSaveMsg(`Error: ${result.error}`)
    } else {
      setSaveMsg('Saved')
      setOriginal(md)
      setTimeout(() => setSaveMsg(''), 2000)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-400">
            Editing:{' '}
            <span className="font-mono text-gray-300 text-xs">{filePath}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            Instructions are written as markdown sections to the{' '}
            {cli === 'claude' ? 'CLAUDE.md' : 'AGENTS.md'} file.
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-xs ${saveMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {saveMsg}
            </span>
          )}
          <button
            onClick={() => void save()}
            disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors"
          >
            {saving ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {CATEGORIES.map((cat) => (
          <div key={cat.key} className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-300">{cat.label}</label>
            <textarea
              value={sections[cat.key] ?? ''}
              onChange={(e) => handleChange(cat.key, e.target.value)}
              placeholder={cat.placeholder}
              rows={4}
              className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-y font-mono"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
