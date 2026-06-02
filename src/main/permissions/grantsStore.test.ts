import { describe, it, expect, beforeEach } from 'vitest'
import { GrantsStore, grantKey, type GrantsBackend } from './grantsStore'
import type { ToolGrant } from '../../shared/permissions/types'

function fakeBackend(): GrantsBackend {
  let data: ToolGrant[] = []
  return { get: () => data, set: (g) => { data = g } }
}

describe('GrantsStore', () => {
  let store: GrantsStore
  beforeEach(() => { store = new GrantsStore(fakeBackend()) })

  it('returns undefined when no grant exists', () => {
    expect(store.find('claude', 'shell', 's1')).toBeUndefined()
  })

  it('records and finds a session-scoped grant only for that session', () => {
    store.record({ cli: 'claude', toolClass: 'shell', decision: 'allow', scope: 'session', sessionId: 's1', now: 1 })
    expect(store.find('claude', 'shell', 's1')).toBe('allow')
    expect(store.find('claude', 'shell', 's2')).toBeUndefined()
  })

  it('records and finds a workspace-scoped grant across sessions in that dir', () => {
    store.record({ cli: 'copilot', toolClass: 'edit', decision: 'allow', scope: 'workspace', workspaceDir: '/p', now: 1 })
    expect(store.find('copilot', 'edit', 'any', '/p')).toBe('allow')
    expect(store.find('copilot', 'edit', 'any', '/other')).toBeUndefined()
    expect(store.find('copilot', 'edit', 'any')).toBeUndefined()
  })

  it('prefers the narrower session grant over a workspace grant', () => {
    store.record({ cli: 'claude', toolClass: 'mcp', decision: 'deny', scope: 'workspace', workspaceDir: '/p', now: 1 })
    store.record({ cli: 'claude', toolClass: 'mcp', decision: 'allow', scope: 'session', sessionId: 's1', now: 2 })
    expect(store.find('claude', 'mcp', 's1', '/p')).toBe('allow')
  })

  it('replaces an existing grant for the same target instead of duplicating', () => {
    store.record({ cli: 'claude', toolClass: 'shell', decision: 'allow', scope: 'session', sessionId: 's1', now: 1 })
    store.record({ cli: 'claude', toolClass: 'shell', decision: 'deny', scope: 'session', sessionId: 's1', now: 2 })
    expect(store.find('claude', 'shell', 's1')).toBe('deny')
  })

  it('clearSession drops only that session’s grants', () => {
    store.record({ cli: 'claude', toolClass: 'shell', decision: 'allow', scope: 'session', sessionId: 's1', now: 1 })
    store.record({ cli: 'claude', toolClass: 'shell', decision: 'allow', scope: 'session', sessionId: 's2', now: 1 })
    store.record({ cli: 'claude', toolClass: 'edit', decision: 'allow', scope: 'workspace', workspaceDir: '/p', now: 1 })
    store.clearSession('s1')
    expect(store.find('claude', 'shell', 's1')).toBeUndefined()
    expect(store.find('claude', 'shell', 's2')).toBe('allow')
    expect(store.find('claude', 'edit', 'x', '/p')).toBe('allow')
  })

  it('grantKey composes cli + class', () => {
    expect(grantKey('claude', 'shell')).toBe('claude:shell')
  })
})
