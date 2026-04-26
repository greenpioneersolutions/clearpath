/**
 * Copilot SDK adapter. GitHub doesn't ship a standalone Copilot SDK package —
 * the officially sanctioned "programmatic" entry point is `copilot --acp`,
 * which serves the Agent Client Protocol (JSON-RPC over stdio). This adapter
 * spawns that subprocess and decodes each JSON-RPC frame into a `ParsedOutput`.
 *
 * Why not GitHub Models REST: we need tool use, agent/skill behaviors, and
 * permission prompts — ACP surfaces all of those; the REST API does not.
 *
 * This adapter reuses `CopilotAdapter.buildArgs()` for the common flag shape;
 * we only layer `--acp` and override output parsing. `isInstalled()` still
 * requires the `copilot` binary on PATH (ACP runs in-process under it).
 */

import { spawn } from 'child_process'
import { log } from '../utils/logger'
import type { ChildProcess } from 'child_process'
import type { SessionOptions, ParsedOutput } from './types'
import type { ICLIAdapter, SessionHandle } from './types'
import { CopilotAdapter } from './CopilotAdapter'
import { resolveInShell, getScopedSpawnEnv } from '../utils/shellEnv'
import { getGitHubToken, probeGitHubToken } from '../auth/SdkAuthProbe'

// Strip all ANSI/VT100 escape sequences — keeps the text fallback readable
// when ACP emits plain-text diagnostics on stderr.
const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-9;]*[ -/]*[@-~])/g

export class CopilotSdkAdapter implements ICLIAdapter {
  readonly cliName = 'copilot-sdk'
  binaryPath = 'copilot'

  /** Delegate non-ACP fallback parsing to the CLI adapter so output is identical. */
  private readonly base = new CopilotAdapter()

  async isInstalled(): Promise<boolean> {
    // ACP is served by the copilot binary; we still need it on PATH.
    const resolved = await resolveInShell('copilot')
    if (!resolved) return false
    this.binaryPath = resolved
    return !!getGitHubToken()
  }

  async isAuthenticated(): Promise<boolean> {
    if (!(await this.isInstalled())) return false
    return probeGitHubToken()
  }

  buildArgs(options: SessionOptions): string[] {
    // Reuse the CLI adapter's argument builder, then prepend `--acp` so the
    // binary starts in ACP server mode. Skip `--prompt` — in ACP, prompts go
    // over JSON-RPC, not as a CLI arg.
    const clone: SessionOptions = { ...options, mode: 'interactive' }
    const args = this.base.buildArgs(clone)
    return ['--acp', ...args]
  }

  parseOutput(line: string): ParsedOutput {
    const trimmed = line.trim()
    if (!trimmed) return { type: 'text', content: '' }

    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>
        return this.parseJsonRpcFrame(obj, trimmed)
      } catch {
        // fall through
      }
    }

    // ACP occasionally emits plain-text diagnostics before the JSON-RPC stream
    // starts (e.g. "Connecting…"). Defer to the CLI parser for those.
    return this.base.parseOutput(trimmed.replace(ANSI_RE, ''))
  }

  /**
   * Translate a JSON-RPC 2.0 frame into the ParsedOutput union. We handle the
   * small set of ACP method names Copilot emits; anything unrecognised falls
   * through to a text frame so the user still sees something.
   */
  private parseJsonRpcFrame(obj: Record<string, unknown>, raw: string): ParsedOutput {
    // Result / error envelopes (responses to our requests)
    if (obj['error'] && typeof obj['error'] === 'object') {
      const err = obj['error'] as Record<string, unknown>
      return { type: 'error', content: String(err['message'] ?? raw), metadata: obj }
    }

    const method = obj['method'] as string | undefined
    const params = (obj['params'] ?? {}) as Record<string, unknown>

    switch (method) {
      case 'session/message':
      case 'agent/message':
      case 'message/stream': {
        const content = String(params['content'] ?? params['text'] ?? '')
        return { type: 'text', content, metadata: obj }
      }

      case 'session/toolUse':
      case 'agent/toolUse':
      case 'tool/call': {
        const name = String(params['name'] ?? params['tool'] ?? '')
        return { type: 'tool-use', content: name, metadata: obj }
      }

      case 'session/permissionRequest':
      case 'agent/permissionRequest':
      case 'permission/request': {
        const desc = String(params['description'] ?? params['message'] ?? raw)
        return { type: 'permission-request', content: desc, metadata: obj }
      }

      case 'session/thinking':
      case 'agent/thinking': {
        return { type: 'thinking', content: String(params['text'] ?? ''), metadata: obj }
      }

      case 'session/status':
      case 'agent/status': {
        return { type: 'status', content: String(params['status'] ?? ''), metadata: obj }
      }

      default: {
        // Unknown frame — surface as text so debugging is possible, but keep
        // the full frame in metadata.
        const content = String(params['content'] ?? params['text'] ?? obj['result'] ?? '')
        if (!content) return { type: 'status', content: method ?? 'unknown', metadata: obj }
        return { type: 'text', content, metadata: obj }
      }
    }
  }

  startSession(options: SessionOptions): SessionHandle {
    const args = this.buildArgs(options)
    log.info(`[CopilotSdkAdapter] spawning ${this.binaryPath} with args: ${args.join(' ')}`)
    const proc: ChildProcess = spawn(this.binaryPath, args, {
      cwd: options.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: getScopedSpawnEnv('copilot'),
    })

    // After spawn, send the first JSON-RPC `initialize` + prompt frame so the
    // ACP server starts the conversation. We build these minimally — ACP is
    // designed to be permissive about unknown fields.
    if (options.prompt && proc.stdin) {
      const initFrame = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          clientName: 'CoPilot Commander',
          clientVersion: '1.9.0',
          workingDirectory: options.workingDirectory,
        },
      })
      const promptFrame = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'prompt',
        params: { content: options.prompt, model: options.model },
      })
      try {
        proc.stdin.write(initFrame + '\n')
        proc.stdin.write(promptFrame + '\n')
      } catch (err) {
        log.warn('[CopilotSdkAdapter] failed to write initial ACP frames', err)
      }
    }

    return proc
  }

  sendInput(proc: SessionHandle, input: string): void {
    if (!proc.stdin) return
    const frame = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'prompt',
      params: { content: input },
    })
    try { proc.stdin.write(frame + '\n') } catch { /* broken pipe — session dying */ }
  }

  sendSlashCommand(proc: SessionHandle, command: string): void {
    if (!proc.stdin) return
    const frame = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'slashCommand',
      params: { command },
    })
    try { proc.stdin.write(frame + '\n') } catch { /* broken pipe */ }
  }
}
