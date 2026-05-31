// ── PermissionBroker ──────────────────────────────────────────────────────────
// A loopback HTTP server the bundled CLI permission clients (Claude MCP tool /
// Copilot permissionRequest hook) call for each tool decision. ClearPath runs
// each turn headless, so there is no interactive Allow/Deny in the CLI — the
// client POSTs here, we decide against the active Policy (auto-allow/deny) and,
// when needed, surface a GUI modal and block until the user answers.
//
// Security: bound to 127.0.0.1 only; each session has a random bearer token the
// client must present along with its sessionId.

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { randomUUID } from 'crypto'
import { log } from '../utils/logger'
import {
  permissionProfileForPolicy,
  classifyTool,
  toolMatchesBlocked,
  isFileBlocked,
  extractCommand,
  type ActivePolicy,
} from './permissionProfile'
import type { GrantsStore } from './grantsStore'
import type {
  PermissionDecision,
  PermissionRequest,
  GrantScope,
  ToolClass,
} from '../../shared/permissions/types'

export interface SessionMeta {
  name?: string
  cli?: string
  workspaceDir?: string
}

export interface BrokerDeps {
  getActivePolicy: () => Promise<ActivePolicy>
  getWebContents: () => { isDestroyed(): boolean; send(channel: string, payload: unknown): void } | null
  grants: GrantsStore
  getSessionMeta: (sessionId: string) => SessionMeta
  audit?: (entry: { actionType: 'tool-approval'; summary: string; details: string; sessionId?: string }) => void
  /** Decision used when the user never answers the modal. Default 'deny'. */
  timeoutMs?: number
}

interface PendingDecision {
  resolve: (outcome: { decision: PermissionDecision; reason: string }) => void
  timer: ReturnType<typeof setTimeout>
  request: PermissionRequest
  workspaceDir?: string
}

interface BrokerRequestBody {
  token?: string
  sessionId?: string
  cli?: string
  toolName?: string
  input?: unknown
}

export interface StaticDecision {
  decision: PermissionDecision | 'prompt'
  reason: string
}

const DEFAULT_TIMEOUT_MS = 120_000

export class PermissionBroker {
  private server: Server | null = null
  private port = 0
  private tokens = new Map<string, string>() // sessionId → token
  private pending = new Map<string, PendingDecision>() // requestId → pending
  private readonly timeoutMs: number

  constructor(private deps: BrokerDeps) {
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** Start listening on an ephemeral loopback port. Idempotent. */
  async start(): Promise<{ url: string; port: number }> {
    if (this.server) return { url: this.url(), port: this.port }
    await new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => void this.handle(req, res))
      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        this.port = typeof addr === 'object' && addr ? addr.port : 0
        this.server = server
        log.info(`[PermissionBroker] listening on ${this.url()}`)
        resolve()
      })
    })
    return { url: this.url(), port: this.port }
  }

  stop(): void {
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.resolve({ decision: 'deny', reason: 'app closing' }) }
    this.pending.clear()
    this.server?.close()
    this.server = null
  }

  url(): string { return `http://127.0.0.1:${this.port}` }

  /** Mint (or reuse) the bearer token for a session. */
  tokenForSession(sessionId: string): string {
    let t = this.tokens.get(sessionId)
    if (!t) { t = randomUUID(); this.tokens.set(sessionId, t) }
    return t
  }

  /** Drop a session's token + any session-scoped grants + pending requests. */
  releaseSession(sessionId: string): void {
    this.tokens.delete(sessionId)
    this.deps.grants.clearSession(sessionId)
    for (const [id, p] of this.pending) {
      if (p.request.sessionId === sessionId) { clearTimeout(p.timer); p.resolve({ decision: 'deny', reason: 'session ended' }); this.pending.delete(id) }
    }
  }

  /** Renderer → broker: resolve a pending request (optionally remembering it). */
  respond(requestId: string, decision: PermissionDecision, remember?: GrantScope, now = Date.now()): boolean {
    const p = this.pending.get(requestId)
    if (!p) return false
    clearTimeout(p.timer)
    this.pending.delete(requestId)
    if (remember && remember !== 'once') {
      this.deps.grants.record({
        cli: p.request.cli,
        toolClass: p.request.toolClass,
        decision,
        scope: remember,
        sessionId: p.request.sessionId,
        workspaceDir: p.workspaceDir,
        now,
      })
    }
    this.audit(p.request, decision, remember ? `user (${remember})` : 'user')
    p.resolve({ decision, reason: remember ? `user (${remember})` : 'user decision' })
    return true
  }

  /** Currently-pending requests (for a renderer that mounts mid-flight). */
  listPending(): PermissionRequest[] {
    return Array.from(this.pending.values()).map((p) => p.request)
  }

  // ── HTTP ────────────────────────────────────────────────────────────────────

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST' || (req.url ?? '') !== '/permission') {
      res.writeHead(404).end(); return
    }
    let body: BrokerRequestBody
    try {
      body = JSON.parse(await readBody(req)) as BrokerRequestBody
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ decision: 'deny', reason: 'bad request' }))
      return
    }
    const { token, sessionId } = body
    if (!sessionId || !token || this.tokens.get(sessionId) !== token) {
      res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ decision: 'deny', reason: 'unauthorized' }))
      return
    }
    const decision = await this.decide(body)
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(decision))
  }

  // ── Decision flow ─────────────────────────────────────────────────────────────

  private async decide(body: BrokerRequestBody): Promise<{ decision: PermissionDecision; reason: string }> {
    const sessionId = body.sessionId as string
    const meta = this.deps.getSessionMeta(sessionId)
    const cli = (body.cli || meta.cli || 'copilot').toLowerCase()
    const toolName = body.toolName ?? ''
    const toolClass = classifyTool(toolName)
    const policy = await this.deps.getActivePolicy()
    const profile = permissionProfileForPolicy(policy)

    const stat = decideStatic({ toolName, toolClass, input: body.input, profile })
    if (stat.decision !== 'prompt') {
      this.auditByName(toolName, sessionId, stat.decision, `policy:${policy.presetName}`)
      return { decision: stat.decision, reason: stat.reason }
    }

    // Class default is "prompt" — first honour any remembered grant.
    const remembered = this.deps.grants.find(cli, toolClass, sessionId, meta.workspaceDir)
    if (remembered) {
      this.auditByName(toolName, sessionId, remembered, 'grant')
      return { decision: remembered, reason: 'remembered choice' }
    }

    // Surface a modal and block until the user answers (or timeout → deny).
    return this.prompt({ sessionId, cli, toolName, toolClass, input: body.input, meta, policyName: policy.presetName })
  }

  private prompt(args: {
    sessionId: string; cli: string; toolName: string; toolClass: ToolClass
    input: unknown; meta: SessionMeta; policyName: string
  }): Promise<{ decision: PermissionDecision; reason: string }> {
    const request: PermissionRequest = {
      requestId: randomUUID(),
      sessionId: args.sessionId,
      cli: args.cli,
      sessionName: args.meta.name,
      toolName: args.toolName,
      toolClass: args.toolClass,
      inputPreview: redactPreview(args.input),
      policyName: args.policyName,
      timestamp: Date.now(),
    }
    return new Promise<{ decision: PermissionDecision; reason: string }>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId)
        this.audit(request, 'deny', 'timeout')
        resolve({ decision: 'deny', reason: 'no response — timed out' })
      }, this.timeoutMs)
      this.pending.set(request.requestId, { resolve, timer, request, workspaceDir: args.meta.workspaceDir })
      const wc = this.deps.getWebContents()
      if (wc && !wc.isDestroyed()) wc.send('cli:permission-request', { request })
    })
  }

  private audit(request: PermissionRequest, decision: PermissionDecision, by: string): void {
    this.deps.audit?.({
      actionType: 'tool-approval',
      summary: `${decision === 'allow' ? 'Allowed' : 'Denied'} ${request.toolName} (${by})`,
      details: `cli=${request.cli} class=${request.toolClass} input=${request.inputPreview}`,
      sessionId: request.sessionId,
    })
  }

  private auditByName(toolName: string, sessionId: string, decision: PermissionDecision, by: string): void {
    this.deps.audit?.({
      actionType: 'tool-approval',
      summary: `${decision === 'allow' ? 'Allowed' : 'Denied'} ${toolName} (${by})`,
      details: `auto by ${by}`,
      sessionId,
    })
  }
}

/**
 * The non-interactive part of the decision: hard rules (blocked tools / files)
 * then the class default. Returns 'prompt' when the user must be asked. Pure +
 * exported for unit testing.
 */
export function decideStatic(args: {
  toolName: string
  toolClass: ToolClass
  input: unknown
  profile: ReturnType<typeof permissionProfileForPolicy>
}): StaticDecision {
  const { toolName, toolClass, input, profile } = args

  if (toolMatchesBlocked(toolName, input, profile.blockedTools)) {
    return { decision: 'deny', reason: 'blocked by policy (tool)' }
  }
  // File-touching tools (read/edit/shell): deny if the target path is protected.
  if (toolClass === 'read' || toolClass === 'edit' || toolClass === 'shell') {
    const target = extractCommand(input)
    if (target && isFileBlocked(target, profile.blockedFilePatterns)) {
      return { decision: 'deny', reason: 'blocked by policy (protected file)' }
    }
  }
  const behavior = profile.byClass[toolClass]
  if (behavior === 'allow') return { decision: 'allow', reason: `policy allows ${toolClass}` }
  if (behavior === 'deny') return { decision: 'deny', reason: `policy denies ${toolClass}` }
  return { decision: 'prompt', reason: `policy prompts for ${toolClass}` }
}

/** One-line, length-bounded, secret-redacted preview of a tool input. */
export function redactPreview(input: unknown): string {
  if (input == null) return ''
  let s: string
  if (typeof input === 'string') s = input
  else {
    const cmd = extractCommand(input)
    s = cmd ?? safeStringify(input)
  }
  s = s.replace(/\s+/g, ' ').trim()
  // Redact obvious token/key assignments.
  s = s.replace(/((?:token|key|secret|password|pwd|authorization|bearer)\s*[=:]\s*)\S+/gi, '$1***')
  return s.length > 160 ? s.slice(0, 157) + '…' : s
}

function safeStringify(o: unknown): string {
  try { return JSON.stringify(o) } catch { return String(o) }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 1_000_000) { reject(new Error('body too large')); req.destroy() }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}
