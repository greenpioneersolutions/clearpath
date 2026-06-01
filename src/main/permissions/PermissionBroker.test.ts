import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PermissionBroker, decideStatic, redactPreview, type BrokerDeps } from './PermissionBroker'
import { permissionProfileForPolicy, type ActivePolicy } from './permissionProfile'
import { GrantsStore, type GrantsBackend } from './grantsStore'
import type { ToolGrant, PermissionRequest } from '../../shared/permissions/types'

vi.mock('../utils/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

const standard = (): ActivePolicy => ({ activePresetId: 'policy-standard', presetName: 'Standard', rules: {} })

describe('decideStatic', () => {
  const profile = (p: ActivePolicy) => permissionProfileForPolicy(p)

  it('auto-allows reads under Standard', () => {
    const r = decideStatic({ toolName: 'Read', toolClass: 'read', input: { file_path: '/p/a.md' }, profile: profile(standard()) })
    expect(r.decision).toBe('allow')
  })

  it('prompts for shell/edit under Standard', () => {
    expect(decideStatic({ toolName: 'Bash', toolClass: 'shell', input: { command: 'ls' }, profile: profile(standard()) }).decision).toBe('prompt')
    expect(decideStatic({ toolName: 'Edit', toolClass: 'edit', input: { file_path: '/p/a.ts' }, profile: profile(standard()) }).decision).toBe('prompt')
  })

  it('hard-denies a blocked tool regardless of class', () => {
    const p = profile({ activePresetId: 'policy-standard', presetName: 'Standard', rules: { blockedTools: ['shell(rm -rf:*)'] } })
    const r = decideStatic({ toolName: 'Bash', toolClass: 'shell', input: { command: 'rm -rf /tmp/x' }, profile: p })
    expect(r.decision).toBe('deny')
    expect(r.reason).toMatch(/blocked by policy/)
  })

  it('hard-denies a read of a protected file (.env) even though reads are allowed', () => {
    const r = decideStatic({ toolName: 'Read', toolClass: 'read', input: { file_path: '/proj/.env' }, profile: profile(standard()) })
    expect(r.decision).toBe('deny')
    expect(r.reason).toMatch(/protected file/)
  })
})

describe('redactPreview', () => {
  it('redacts token/secret assignments and bounds length', () => {
    expect(redactPreview({ command: 'export TOKEN=abc123' })).toContain('***')
    expect(redactPreview('x'.repeat(300)).length).toBeLessThanOrEqual(160)
    expect(redactPreview(null)).toBe('')
  })

  it('redacts JSON-quoted secrets and Bearer headers (no leak to UI/audit)', () => {
    const json = redactPreview('{"token":"sk-secret-abc","x":1}')
    expect(json).not.toContain('sk-secret-abc')
    expect(json).toContain('***')
    const hdr = redactPreview('Authorization: Bearer eyJhbGci.tok.en')
    expect(hdr).not.toContain('eyJhbGci.tok.en')
    expect(hdr).toContain('***')
    expect(redactPreview('api_key=AKIA12345')).toContain('***')
    expect(redactPreview('api_key=AKIA12345')).not.toContain('AKIA12345')
  })
})

describe('PermissionBroker (HTTP)', () => {
  let broker: PermissionBroker
  let url: string
  let emitted: PermissionRequest[]
  let policy: ActivePolicy
  let grantsData: ToolGrant[]

  let recorded: Array<{ toolName: string; target?: string; kind: string; decision: string }>

  function deps(): BrokerDeps {
    const backend: GrantsBackend = { get: () => grantsData, set: (g) => { grantsData = g } }
    return {
      getActivePolicy: async () => policy,
      getWebContents: () => ({ isDestroyed: () => false, send: (_c, payload) => { emitted.push((payload as { request: PermissionRequest }).request) } }),
      grants: new GrantsStore(backend),
      getSessionMeta: () => ({ name: 'S', cli: 'claude', workspaceDir: '/p' }),
      audit: vi.fn(),
      recordActivity: (e) => recorded.push(e as typeof recorded[number]),
      timeoutMs: 200,
    }
  }

  beforeEach(async () => {
    emitted = []
    recorded = []
    policy = standard()
    grantsData = []
    broker = new PermissionBroker(deps())
    const started = await broker.start()
    url = started.url
  })
  afterEach(() => broker.stop())

  async function post(body: unknown): Promise<{ decision: string; reason: string }> {
    const res = await fetch(`${url}/permission`, { method: 'POST', body: JSON.stringify(body) })
    return res.json() as Promise<{ decision: string; reason: string }>
  }

  it('rejects a request with a bad/missing token', async () => {
    const r = await post({ sessionId: 's1', token: 'wrong', cli: 'claude', toolName: 'Read', input: {} })
    expect(r.decision).toBe('deny')
    expect(r.reason).toBe('unauthorized')
  })

  it('auto-allows a read under Standard with a valid token', async () => {
    const token = broker.tokenForSession('s1')
    const r = await post({ sessionId: 's1', token, cli: 'claude', toolName: 'Read', input: { file_path: '/p/a.md' } })
    expect(r.decision).toBe('allow')
    expect(emitted).toHaveLength(0)
  })

  it('prompts the user for shell, then resolves with the user’s decision', async () => {
    const token = broker.tokenForSession('s1')
    const p = post({ sessionId: 's1', token, cli: 'claude', toolName: 'Bash', input: { command: 'npm test' } })
    // Wait for the modal request to be emitted, then answer it.
    await vi.waitFor(() => expect(emitted).toHaveLength(1))
    expect(broker.listPending()).toHaveLength(1)
    broker.respond(emitted[0].requestId, 'allow')
    expect(await p).toMatchObject({ decision: 'allow' })
  })

  it('remembers a session-scoped grant so the next shell call is auto-allowed', async () => {
    const token = broker.tokenForSession('s1')
    const p1 = post({ sessionId: 's1', token, cli: 'claude', toolName: 'Bash', input: { command: 'npm test' } })
    await vi.waitFor(() => expect(emitted).toHaveLength(1))
    broker.respond(emitted[0].requestId, 'allow', 'session')
    await p1
    // Second shell call: no new modal, auto-allowed by the remembered grant.
    const r2 = await post({ sessionId: 's1', token, cli: 'claude', toolName: 'Bash', input: { command: 'npm run build' } })
    expect(r2.decision).toBe('allow')
    expect(emitted).toHaveLength(1) // no second prompt
  })

  it('defaults to deny when the user never answers (timeout)', async () => {
    const token = broker.tokenForSession('s1')
    const r = await post({ sessionId: 's1', token, cli: 'claude', toolName: 'Bash', input: { command: 'rm x' } })
    expect(r.decision).toBe('deny')
  })

  it('records a real tool with its target but skips noise (report_intent)', async () => {
    const token = broker.tokenForSession('s1')
    await post({ sessionId: 's1', token, cli: 'copilot', toolName: 'view', input: { path: '/p/README.md' } })
    await post({ sessionId: 's1', token, cli: 'copilot', toolName: 'report_intent', input: { message: 'reading' } })
    const targets = recorded.map((r) => r.toolName)
    expect(targets).toContain('view')
    expect(targets).not.toContain('report_intent')
    const view = recorded.find((r) => r.toolName === 'view')
    expect(view?.target).toBe('/p/README.md')
    expect(view?.kind).toBe('read')
  })

  it('records the user’s prompt answer as decidedBy:user (auditable)', async () => {
    const token = broker.tokenForSession('s1')
    const p = post({ sessionId: 's1', token, cli: 'claude', toolName: 'Write', input: { file_path: '/p/out.md' } })
    await vi.waitFor(() => expect(emitted).toHaveLength(1))
    broker.respond(emitted[0].requestId, 'allow')
    await p
    const w = recorded.find((r) => r.toolName === 'Write') as { decidedBy?: string; decision: string } | undefined
    expect(w?.decision).toBe('allow')
    expect(w?.decidedBy).toBe('user')
  })

  it('records a policy auto-allow as decidedBy:policy', async () => {
    const token = broker.tokenForSession('s1')
    await post({ sessionId: 's1', token, cli: 'claude', toolName: 'Read', input: { file_path: '/p/a.md' } })
    const r = recorded.find((x) => x.toolName === 'Read') as { decidedBy?: string } | undefined
    expect(r?.decidedBy).toBe('policy')
  })

  it('releaseSession drops the token so further calls are unauthorized', async () => {
    const token = broker.tokenForSession('s1')
    broker.releaseSession('s1')
    const r = await post({ sessionId: 's1', token, cli: 'claude', toolName: 'Read', input: {} })
    expect(r.decision).toBe('deny')
    expect(r.reason).toBe('unauthorized')
  })
})
