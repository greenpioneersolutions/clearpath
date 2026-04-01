import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import type { SessionOptions, SessionInfo } from './types'
import type { ActiveSession } from './types'
import { CopilotAdapter } from './CopilotAdapter'
import { ClaudeCodeAdapter } from './ClaudeCodeAdapter'

export class CLIManager {
  private readonly sessions = new Map<string, ActiveSession>()
  private readonly copilot = new CopilotAdapter()
  private readonly claude = new ClaudeCodeAdapter()

  /**
   * Lazily resolved so the window can be created after CLIManager is instantiated.
   * Returns null when the window has been closed.
   */
  private readonly getWebContents: () => WebContents | null

  constructor(getWebContents: () => WebContents | null) {
    this.getWebContents = getWebContents
  }

  async checkInstalled(): Promise<{ copilot: boolean; claude: boolean }> {
    const [copilot, claude] = await Promise.all([
      this.copilot.isInstalled(),
      this.claude.isInstalled(),
    ])
    return { copilot, claude }
  }

  async checkAuth(): Promise<{ copilot: boolean; claude: boolean }> {
    const [copilot, claude] = await Promise.all([
      this.copilot.isAuthenticated(),
      this.claude.isAuthenticated(),
    ])
    return { copilot, claude }
  }

  async startSession(options: SessionOptions): Promise<{ sessionId: string }> {
    const adapter = options.cli === 'copilot' ? this.copilot : this.claude
    const sessionId = randomUUID()

    const proc = adapter.startSession(options)

    const session: ActiveSession = {
      info: {
        sessionId,
        name: options.name,
        cli: options.cli,
        status: 'running',
        startedAt: Date.now(),
      },
      process: proc,
      adapter,
      buffer: '',
    }

    this.sessions.set(sessionId, session)

    // ── stdout → parse line-by-line → IPC events ───────────────────────────
    proc.stdout?.on('data', (chunk: Buffer) => {
      session.buffer += chunk.toString()

      // Split on \r\n, \r, or \n — TUI apps often use \r to overwrite lines
      const lines = session.buffer.split(/\r\n|\r|\n/)
      // Last element is a partial line (keep buffering)
      session.buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        const parsed = adapter.parseOutput(line)
        const wc = this.getWebContents()
        if (!wc || wc.isDestroyed()) continue

        if (parsed.type === 'permission-request') {
          wc.send('cli:permission-request', { sessionId, request: parsed })
        } else {
          wc.send('cli:output', { sessionId, output: parsed })
        }
      }
    })

    // ── stderr → forward as error events ──────────────────────────────────
    proc.stderr?.on('data', (chunk: Buffer) => {
      const wc = this.getWebContents()
      if (!wc || wc.isDestroyed()) return
      wc.send('cli:error', { sessionId, error: chunk.toString() })
    })

    // ── process exit ──────────────────────────────────────────────────────
    proc.on('exit', (code) => {
      // Flush any remaining buffer content
      if (session.buffer.trim()) {
        const parsed = adapter.parseOutput(session.buffer)
        session.buffer = ''
        const wc = this.getWebContents()
        if (wc && !wc.isDestroyed()) {
          wc.send('cli:output', { sessionId, output: parsed })
        }
      }

      session.info.status = 'stopped'
      const wc = this.getWebContents()
      if (wc && !wc.isDestroyed()) {
        wc.send('cli:exit', { sessionId, code: code ?? -1 })
      }
    })

    return { sessionId }
  }

  sendInput(sessionId: string, input: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.info.status !== 'running') return
    session.adapter.sendInput(session.process, input)
  }

  sendSlashCommand(sessionId: string, command: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.info.status !== 'running') return
    session.adapter.sendSlashCommand(session.process, command)
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.info.status !== 'running') return
    session.process.kill('SIGTERM')
    session.info.status = 'stopped'
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s.info }))
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId)?.info
  }
}
