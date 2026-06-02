import { describe, it, expect } from 'vitest'
import {
  permissionProfileForPolicy,
  classifyTool,
  fileMatchesPattern,
  isFileBlocked,
  toolMatchesBlocked,
  extractCommand,
  isNoiseTool,
  DEFAULT_BLOCKED_FILE_PATTERNS,
  type ActivePolicy,
} from './permissionProfile'

const policy = (id: string, rules: ActivePolicy['rules'] = {}): ActivePolicy => ({
  activePresetId: id,
  presetName: id.replace('policy-', ''),
  rules,
})

describe('permissionProfileForPolicy', () => {
  it('unrestricted allows every class', () => {
    const p = permissionProfileForPolicy(policy('policy-unrestricted'))
    expect(p.byClass).toEqual({ read: 'allow', edit: 'allow', shell: 'allow', fetch: 'allow', mcp: 'allow', other: 'allow' })
  })

  it('standard prompts for network (fetch) — not auto-allowed', () => {
    expect(permissionProfileForPolicy(policy('policy-standard')).byClass.fetch).toBe('prompt')
  })

  it('cautious prompts for every class (incl. reads)', () => {
    const p = permissionProfileForPolicy(policy('policy-cautious'))
    expect(new Set(Object.values(p.byClass))).toEqual(new Set(['prompt']))
  })

  it('standard auto-allows reads but prompts for edit/shell/mcp', () => {
    const p = permissionProfileForPolicy(policy('policy-standard'))
    expect(p.byClass.read).toBe('allow')
    expect(p.byClass.edit).toBe('prompt')
    expect(p.byClass.shell).toBe('prompt')
    expect(p.byClass.mcp).toBe('prompt')
  })

  it('custom preset infers from requiredPermissionMode: bypass → allow all', () => {
    const p = permissionProfileForPolicy(policy('my-custom', { requiredPermissionMode: 'bypassPermissions' }))
    expect(new Set(Object.values(p.byClass))).toEqual(new Set(['allow']))
  })

  it('custom preset infers from requiredPermissionMode: plan → reads only', () => {
    const p = permissionProfileForPolicy(policy('my-custom', { requiredPermissionMode: 'plan' }))
    expect(p.byClass.read).toBe('allow')
    expect(p.byClass.edit).toBe('deny')
    expect(p.byClass.shell).toBe('deny')
  })

  it('custom preset with no/default mode falls back to Standard-like (edits prompt, not auto-accepted)', () => {
    const p = permissionProfileForPolicy(policy('my-custom', { requiredPermissionMode: 'acceptEdits' }))
    expect(p.byClass.read).toBe('allow')
    expect(p.byClass.edit).toBe('prompt')
  })

  it('always merges the default secret-file patterns with policy ones', () => {
    const p = permissionProfileForPolicy(policy('policy-standard', { blockedFilePatterns: ['*.secret-custom'] }))
    expect(p.blockedFilePatterns).toContain('*.secret-custom')
    for (const def of DEFAULT_BLOCKED_FILE_PATTERNS) expect(p.blockedFilePatterns).toContain(def)
  })

  it('carries blockedTools through', () => {
    const p = permissionProfileForPolicy(policy('policy-standard', { blockedTools: ['shell(rm -rf:*)'] }))
    expect(p.blockedTools).toEqual(['shell(rm -rf:*)'])
  })
})

describe('classifyTool', () => {
  it('classifies Claude tool names', () => {
    expect(classifyTool('Read')).toBe('read')
    expect(classifyTool('Glob')).toBe('read')
    expect(classifyTool('Grep')).toBe('read')
    expect(classifyTool('Edit')).toBe('edit')
    expect(classifyTool('Write')).toBe('edit')
    expect(classifyTool('MultiEdit')).toBe('edit')
    expect(classifyTool('Bash')).toBe('shell')
    expect(classifyTool('mcp__github__create_issue')).toBe('mcp')
    expect(classifyTool('Task')).toBe('other')
  })

  it('classifies Copilot action-style names', () => {
    expect(classifyTool('shell')).toBe('shell')
    expect(classifyTool('shell(git status)')).toBe('shell')
    expect(classifyTool('write')).toBe('edit')
    expect(classifyTool('write(.github/x.md)')).toBe('edit')
    expect(classifyTool('read')).toBe('read')
    expect(classifyTool('MyMCP(create_issue)')).toBe('mcp')
  })

  it('defaults unknown to other and handles empty', () => {
    expect(classifyTool('SomethingNew')).toBe('other')
    expect(classifyTool('')).toBe('other')
  })
})

describe('fileMatchesPattern / isFileBlocked', () => {
  it('matches secret files by basename and full path', () => {
    expect(fileMatchesPattern('/proj/.env', '.env*')).toBe(true)
    expect(fileMatchesPattern('/proj/.env.local', '.env*')).toBe(true)
    expect(fileMatchesPattern('/proj/server.pem', '*.pem')).toBe(true)
    expect(fileMatchesPattern('/proj/src/index.ts', '.env*')).toBe(false)
  })

  it('isFileBlocked checks all patterns', () => {
    expect(isFileBlocked('/x/db_credentials.json', DEFAULT_BLOCKED_FILE_PATTERNS)).toBe(true)
    expect(isFileBlocked('/x/readme.md', DEFAULT_BLOCKED_FILE_PATTERNS)).toBe(false)
  })

  it('matches a path-segment pattern (config/production.*) inside a full path', () => {
    // Regression: previously anchored to ^...$ so the default never matched.
    expect(fileMatchesPattern('/proj/config/production.json', 'config/production.*')).toBe(true)
    expect(isFileBlocked('/proj/config/production.yml', DEFAULT_BLOCKED_FILE_PATTERNS)).toBe(true)
    expect(fileMatchesPattern('/proj/config/staging.json', 'config/production.*')).toBe(false)
  })
})

describe('toolMatchesBlocked', () => {
  it('matches a bare head pattern against all of that tool', () => {
    expect(toolMatchesBlocked('shell', { command: 'ls' }, ['shell'])).toBe(true)
    expect(toolMatchesBlocked('shell(ls)', {}, ['shell'])).toBe(true)
    expect(toolMatchesBlocked('Read', {}, ['shell'])).toBe(false)
  })

  it('matches an inner expr against the command in input (Claude Bash)', () => {
    expect(toolMatchesBlocked('Bash', { command: 'sudo rm -rf /' }, ['shell(rm -rf:*)'])).toBe(true)
    expect(toolMatchesBlocked('Bash', { command: 'ls -la' }, ['shell(rm -rf:*)'])).toBe(false)
  })

  it('matches an inner expr against the Copilot parenthetical name', () => {
    expect(toolMatchesBlocked('shell(sudo apt install)', {}, ['shell(sudo:*)'])).toBe(true)
  })
})

describe('extractCommand', () => {
  it('pulls command / path-ish fields', () => {
    expect(extractCommand({ command: 'git status' })).toBe('git status')
    expect(extractCommand({ file_path: '/a/b.txt' })).toBe('/a/b.txt')
    expect(extractCommand({ nope: 1 })).toBeUndefined()
    expect(extractCommand(null)).toBeUndefined()
  })

  it('pulls a url and ignores cwd metadata', () => {
    expect(extractCommand({ url: 'https://example.com', cwd: '/Users/me/proj' })).toBe('https://example.com')
    expect(extractCommand({ cwd: '/Users/me/proj', toolName: 'view' })).toBeUndefined()
  })

  it('finds the path inside a nested Copilot-style toolArgs object', () => {
    expect(extractCommand({ toolName: 'create', cwd: '/proj', toolArgs: { path: '/proj/OUT.md' } })).toBe('/proj/OUT.md')
  })

  it('scans for a path-like string when the key is unknown', () => {
    expect(extractCommand({ cwd: '/proj', some_weird_key: '/proj/weird/out.md' })).toBe('/proj/weird/out.md')
  })

  it('prefers the explicit target key over metadata', () => {
    expect(extractCommand({ cwd: '/proj', path: '/proj/real.md' })).toBe('/proj/real.md')
  })
})

describe('classifyTool — Copilot sub-command tool names', () => {
  it('classifies Copilot file ops + meta tools', () => {
    expect(classifyTool('create')).toBe('edit')
    expect(classifyTool('str_replace')).toBe('edit')
    expect(classifyTool('insert')).toBe('edit')
    expect(classifyTool('view')).toBe('read')
    expect(classifyTool('report_intent')).toBe('other')
  })

  it('classifies network tools as fetch (so Standard gates them)', () => {
    expect(classifyTool('fetch')).toBe('fetch')
    expect(classifyTool('web_fetch')).toBe('fetch')
    expect(classifyTool('WebFetch')).toBe('fetch')
    expect(classifyTool('WebSearch')).toBe('fetch')
    // and NOT misclassified as a local read
    expect(classifyTool('fetch')).not.toBe('read')
  })
})

describe('isNoiseTool', () => {
  it('flags intent/progress narration tools', () => {
    expect(isNoiseTool('report_intent')).toBe(true)
    expect(isNoiseTool('report_progress')).toBe(true)
    expect(isNoiseTool('update_plan')).toBe(true)
    expect(isNoiseTool('thinking')).toBe(true)
  })
  it('does NOT flag real action tools', () => {
    expect(isNoiseTool('create')).toBe(false)
    expect(isNoiseTool('view')).toBe(false)
    expect(isNoiseTool('Bash')).toBe(false)
  })
})
