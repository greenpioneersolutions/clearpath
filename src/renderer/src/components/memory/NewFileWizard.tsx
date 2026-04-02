import { useState } from 'react'

interface Template {
  id: string
  name: string
  description: string
  cli: 'copilot' | 'claude' | 'both'
  fileType: 'instructions' | 'agent' | 'skill' | 'command'
  suggestedName: (dir: string) => string
  content: string
}

const TEMPLATES: Template[] = [
  {
    id: 'claude-md',
    name: 'Project Instructions (CLAUDE.md)',
    description: 'Root-level instructions for Claude Code in this project',
    cli: 'claude',
    fileType: 'instructions',
    suggestedName: (dir) => `${dir}/CLAUDE.md`,
    content: `# Project Instructions

## Code Style
- Use TypeScript strict mode throughout
- Prefer functional components and React hooks
- Use descriptive, self-documenting variable names

## Testing
- Write unit tests for all utility functions
- Use integration tests for API endpoints and IPC handlers
- Maintain >80% code coverage

## Architecture
- Follow the existing adapter pattern for new CLI integrations
- Keep components small and focused on a single concern
- Separate UI state from business logic

## Communication Preferences
- Be concise and direct in responses
- Explain tradeoffs when making architectural recommendations
- Ask clarifying questions when requirements are ambiguous
`,
  },
  {
    id: 'claude-global',
    name: 'Global Instructions (~/.claude/CLAUDE.md)',
    description: 'Instructions that apply to all Claude Code projects',
    cli: 'claude',
    fileType: 'instructions',
    suggestedName: () => `~/.claude/CLAUDE.md`,
    content: `# Global Instructions

## Always
- Think step by step before implementing
- Consider edge cases and error handling
- Write clean, readable code that doesn't need comments

## Never
- Add unnecessary abstractions or over-engineer solutions
- Create files without being asked
- Guess at requirements — ask when unclear
`,
  },
  {
    id: 'claude-agent-review',
    name: 'Code Review Agent',
    description: 'Claude agent specialized in thorough code review',
    cli: 'claude',
    fileType: 'agent',
    suggestedName: (dir) => `${dir}/.claude/agents/code-review.md`,
    content: `---
name: Code Review
description: Performs thorough code review focused on security, performance, and maintainability
model: claude-sonnet-4-6
---

You are an expert code reviewer. When reviewing code:

1. **Security** — check for injection vulnerabilities, unsafe deserialization, credential exposure
2. **Performance** — identify N+1 queries, unnecessary re-renders, blocking operations
3. **Error handling** — verify all error paths are handled and errors are logged appropriately
4. **Test coverage** — assess whether the changes have adequate test coverage
5. **Code clarity** — flag overly complex logic that should be simplified

Provide specific, actionable feedback with file and line references. Prioritize issues by severity.
`,
  },
  {
    id: 'claude-agent-test',
    name: 'Testing Conventions Agent',
    description: 'Agent that enforces testing standards and writes tests',
    cli: 'claude',
    fileType: 'agent',
    suggestedName: (dir) => `${dir}/.claude/agents/testing.md`,
    content: `---
name: Testing
description: Writes and enforces testing standards for this project
model: claude-sonnet-4-6
---

You are a testing specialist. When writing or reviewing tests:

1. Use the project's existing test framework and patterns
2. Prefer integration tests over heavily mocked unit tests
3. Test behavior, not implementation details
4. Use descriptive test names that explain what is being verified
5. Include edge cases: null inputs, empty arrays, boundary values
6. Verify error paths, not just the happy path

Always run existing tests before and after changes to confirm nothing regressed.
`,
  },
  {
    id: 'claude-skill-pr',
    name: 'PR Description Skill',
    description: 'Generates well-structured pull request descriptions',
    cli: 'claude',
    fileType: 'skill',
    suggestedName: (dir) => `${dir}/.claude/skills/pr-description.md`,
    content: `---
name: pr-description
description: Generates a pull request description from staged changes
---

Analyze the git diff and staged changes, then generate a pull request description with these sections:

## Summary
- 2–4 bullet points describing what changed and why

## Changes Made
- Technical description of the implementation approach
- Any architecture decisions or tradeoffs

## Test Plan
- How to verify the changes work correctly
- Which test cases were added or updated

## Screenshots (if UI changes)
- Placeholder for before/after screenshots

Keep the tone professional and the description concise. Focus on the "why" more than the "what".
`,
  },
  {
    id: 'copilot-agents',
    name: 'Project Agents (AGENTS.md)',
    description: 'Custom agent definitions for GitHub Copilot CLI',
    cli: 'copilot',
    fileType: 'instructions',
    suggestedName: (dir) => `${dir}/AGENTS.md`,
    content: `# Project Agents

## Code Style
- Use TypeScript strict mode
- Follow existing naming conventions in this codebase
- Prefer explicit over implicit

## Architecture Guidelines
- All file system operations go through the main process via IPC
- Never directly import Node.js modules in renderer code
- Follow the existing adapter pattern when adding new CLIs

## Testing Requirements
- New features must have corresponding tests
- Run \`npm test\` before submitting changes

## Commit Conventions
- Use conventional commits format: type(scope): description
- Types: feat, fix, chore, docs, refactor, test
`,
  },
  {
    id: 'claude-rules-security',
    name: 'Security Rules',
    description: 'Path-specific security rules for Claude Code',
    cli: 'claude',
    fileType: 'rule',
    suggestedName: (dir) => `${dir}/.claude/rules/security.md`,
    content: `---
globs: ["src/main/**/*", "src/preload/**/*"]
---

# Security Rules for Main Process Code

When editing main process or preload scripts:

1. **Context isolation is mandatory** — never set contextIsolation: false
2. **Validate all IPC input** — treat renderer input as untrusted
3. **No shell injection** — never concatenate user strings into shell commands
4. **No nodeIntegration in renderer** — keep nodeIntegration: false
5. **Allowlist IPC channels** — only handle known, expected channel names

Flag any code that could create a security boundary violation.
`,
  },
]

interface Props {
  workingDirectory: string
  onCreated: (path: string) => void
  onCancel: () => void
}

export default function NewFileWizard({ workingDirectory, onCreated, onCancel }: Props): JSX.Element {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [customPath, setCustomPath] = useState('')
  const [content, setContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [cliFilter, setCliFilter] = useState<'all' | 'copilot' | 'claude'>('all')

  const selectTemplate = (t: Template) => {
    setSelectedTemplate(t)
    setCustomPath(t.suggestedName(workingDirectory))
    setContent(t.content)
    setError('')
  }

  const create = async () => {
    if (!customPath.trim()) { setError('File path is required'); return }
    setCreating(true)
    setError('')
    const result = await window.electronAPI.invoke('memory:write-file', {
      path: customPath.trim(),
      content,
    }) as { success?: boolean; error?: string }
    setCreating(false)
    if (result.error) {
      setError(result.error)
    } else {
      onCreated(customPath.trim())
    }
  }

  const filtered = TEMPLATES.filter(
    (t) => cliFilter === 'all' || t.cli === cliFilter || t.cli === 'both',
  )

  if (selectedTemplate) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedTemplate(null)}
            className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
          >
            ← Back
          </button>
          <h3 className="text-sm font-medium text-gray-200">{selectedTemplate.name}</h3>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 font-medium">File path</label>
          <input
            type="text"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 font-medium">Content (editable)</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-indigo-500 resize-y"
          />
        </div>

        {error && <div className="text-xs text-red-400">{error}</div>}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void create()}
            disabled={creating}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors"
          >
            {creating ? 'Creating…' : 'Create File'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-200">Choose a Template</h3>
        <div className="flex gap-1.5">
          {(['all', 'claude', 'copilot'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setCliFilter(f)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                cliFilter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {f === 'all' ? 'All' : f === 'claude' ? 'Claude' : 'Copilot'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTemplate(t)}
            className="text-left bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-indigo-600 rounded-lg px-4 py-3 transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-gray-200">{t.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.description}</div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                  t.cli === 'claude'
                    ? 'bg-orange-500/20 text-orange-300'
                    : t.cli === 'copilot'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-gray-600 text-gray-400'
                }`}
              >
                {t.cli}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="pt-1">
        <button
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
