import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildClaudeMcpConfig,
  ensureCopilotHook,
  removeCopilotHook,
  resolvePermissionResource,
  CLAUDE_PERMISSION_SERVER,
  CLAUDE_PERMISSION_TOOL,
} from './cliIntegration'

const env = { BROKER_URL: 'http://127.0.0.1:5000', BROKER_TOKEN: 'tok', BROKER_SESSION: 's1' }

describe('resolvePermissionResource', () => {
  it('resolves under resources/permission (dev) via the electron mock', () => {
    const p = resolvePermissionResource('claude-mcp-server.mjs')
    expect(p).toMatch(/resources[/\\]permission[/\\]claude-mcp-server\.mjs$/)
  })
})

describe('buildClaudeMcpConfig', () => {
  it('adds the permission server with the broker env to an empty config', () => {
    const out = JSON.parse(buildClaudeMcpConfig(undefined, '/x/server.mjs', env))
    expect(out.mcpServers[CLAUDE_PERMISSION_SERVER]).toEqual({
      command: 'node', args: ['/x/server.mjs'], env,
    })
  })

  it('merges into an existing JSON config without dropping other servers', () => {
    const existing = JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } }, other: true })
    const out = JSON.parse(buildClaudeMcpConfig(existing, '/x/server.mjs', env))
    expect(out.mcpServers.github).toEqual({ command: 'gh-mcp' })
    expect(out.mcpServers[CLAUDE_PERMISSION_SERVER].args).toEqual(['/x/server.mjs'])
    expect(out.other).toBe(true)
  })

  it('tolerates a garbage existing value', () => {
    const out = JSON.parse(buildClaudeMcpConfig('not json', '/x/server.mjs', env))
    expect(out.mcpServers[CLAUDE_PERMISSION_SERVER]).toBeDefined()
  })

  it('exposes the canonical permission tool name', () => {
    expect(CLAUDE_PERMISSION_TOOL).toBe('mcp__clearpath_permission__permission_prompt')
  })
})

describe('Copilot hook merge', () => {
  let dir: string
  let settingsPath: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cp-hook-')); settingsPath = join(dir, 'settings.json') })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('creates settings.json with exactly one ClearPath preToolUse hook', () => {
    ensureCopilotHook('/x/hook.mjs', settingsPath)
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(s.version).toBe(1)
    expect(s.hooks.preToolUse).toHaveLength(1)
    expect(s.hooks.preToolUse[0].bash).toBe("node '/x/hook.mjs'")
    expect(s.hooks.preToolUse[0].name).toBe('clearpath-permission')
  })

  it('is idempotent — re-running does not duplicate the hook', () => {
    ensureCopilotHook('/x/hook.mjs', settingsPath)
    ensureCopilotHook('/x/hook2.mjs', settingsPath)
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(s.hooks.preToolUse).toHaveLength(1)
    expect(s.hooks.preToolUse[0].bash).toBe("node '/x/hook2.mjs'")
  })

  it('preserves the user’s other hooks and top-level keys', () => {
    writeFileSync(settingsPath, JSON.stringify({
      version: 1,
      protectedBranches: ['main'],
      hooks: { permissionRequest: [{ x: 1 }], preToolUse: [{ type: 'command', bash: 'user-thing', name: 'mine' }] },
    }))
    ensureCopilotHook('/x/hook.mjs', settingsPath)
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(s.protectedBranches).toEqual(['main'])
    expect(s.hooks.permissionRequest).toEqual([{ x: 1 }])
    const names = s.hooks.preToolUse.map((h: { name?: string }) => h.name)
    expect(names).toContain('mine')
    expect(names).toContain('clearpath-permission')
  })

  it('removeCopilotHook drops only our entry', () => {
    writeFileSync(settingsPath, JSON.stringify({
      hooks: { preToolUse: [{ name: 'mine', bash: 'x' }] },
    }))
    ensureCopilotHook('/x/hook.mjs', settingsPath)
    removeCopilotHook(settingsPath)
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(s.hooks.preToolUse).toEqual([{ name: 'mine', bash: 'x' }])
  })

  it('removeCopilotHook removes the empty preToolUse array entirely', () => {
    ensureCopilotHook('/x/hook.mjs', settingsPath)
    removeCopilotHook(settingsPath)
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(s.hooks.preToolUse).toBeUndefined()
  })

  it('migrates a stale permissionRequest entry from the prior version to preToolUse', () => {
    writeFileSync(settingsPath, JSON.stringify({
      hooks: { permissionRequest: [{ name: 'clearpath-permission', bash: "node '/old.mjs'" }, { name: 'mine', bash: 'x' }] },
    }))
    ensureCopilotHook('/x/hook.mjs', settingsPath)
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'))
    // our stale entry removed from permissionRequest, user's kept
    expect(s.hooks.permissionRequest).toEqual([{ name: 'mine', bash: 'x' }])
    // and our hook now lives under preToolUse
    expect(s.hooks.preToolUse.map((h: { name?: string }) => h.name)).toEqual(['clearpath-permission'])
  })

  it('removeCopilotHook is a no-op when settings.json is absent', () => {
    expect(() => removeCopilotHook(join(dir, 'nope.json'))).not.toThrow()
    expect(existsSync(join(dir, 'nope.json'))).toBe(false)
  })
})
