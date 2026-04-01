import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ChildProcess } from 'child_process'
import type { SessionOptions, ParsedOutput } from './types'
import type { ICLIAdapter } from './types'
import { resolveInShell, getSpawnEnv } from '../utils/shellEnv'

// Matches Claude Code permission prompts: "Do you want to allow: X? [y/n]"
const PERMISSION_LINE_RE = /\ballow\b.+\?\s*\[y\/n\]/i
// Strip all ANSI/VT100 escape sequences (colors, cursor movement, screen control, etc.)
const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-9;]*[ -/]*[@-~])/g

export class ClaudeCodeAdapter implements ICLIAdapter {
  readonly cliName = 'claude'
  binaryPath = 'claude'

  async isInstalled(): Promise<boolean> {
    const resolved = await resolveInShell('claude')
    if (resolved) { this.binaryPath = resolved; return true }
    return false
  }

  async isAuthenticated(): Promise<boolean> {
    if (process.env['ANTHROPIC_API_KEY']) return true
    const claudeDir = join(homedir(), '.claude')
    return (
      existsSync(join(claudeDir, '.credentials.json')) ||
      existsSync(join(claudeDir, 'auth.json'))
    )
  }

  buildArgs(options: SessionOptions): string[] {
    const args: string[] = []

    // ── Mode ──────────────────────────────────────────────────────────────────
    if (options.mode === 'prompt') args.push('--print')

    // ── Session management ────────────────────────────────────────────────────
    if (options.sessionId) {
      args.push('--session-id', options.sessionId)
    } else if (options.resume) {
      args.push('--resume', options.resume)
    } else if (options.continue) {
      args.push('--continue')
    }
    if (options.forkSession) args.push('--fork-session')
    if (options.noSessionPersistence) args.push('--no-session-persistence')
    if (options.remote) args.push('--remote')
    if (options.teleport) args.push('--teleport')
    if (options.name) args.push('--name', options.name)
    if (options.fromPr) args.push('--from-pr', options.fromPr)

    // ── Model ─────────────────────────────────────────────────────────────────
    if (options.model) args.push('--model', options.model)
    if (options.fallbackModel) args.push('--fallback-model', options.fallbackModel)
    if (options.betas) args.push('--betas', options.betas)

    // ── Permissions ───────────────────────────────────────────────────────────
    if (options.permissionMode) args.push('--permission-mode', options.permissionMode)
    if (options.allowedTools?.length) {
      args.push('--allowedTools', options.allowedTools.join(','))
    }
    if (options.disallowedTools?.length) {
      args.push('--disallowedTools', options.disallowedTools.join(','))
    }
    if (options.tools !== undefined) args.push('--tools', options.tools)
    if (options.permissionPromptTool) {
      args.push('--permission-prompt-tool', options.permissionPromptTool)
    }

    // ── Output / format ───────────────────────────────────────────────────────
    if (options.outputFormat) args.push('--output-format', options.outputFormat)
    if (options.inputFormat) args.push('--input-format', options.inputFormat)
    if (options.includePartialMessages) args.push('--include-partial-messages')
    if (options.jsonSchema) args.push('--json-schema', options.jsonSchema)
    if (options.verbose) args.push('--verbose')

    // ── System prompt ─────────────────────────────────────────────────────────
    if (options.systemPrompt) args.push('--system-prompt', options.systemPrompt)
    if (options.systemPromptFile) args.push('--system-prompt-file', options.systemPromptFile)
    if (options.appendSystemPrompt) args.push('--append-system-prompt', options.appendSystemPrompt)
    if (options.appendSystemPromptFile) {
      args.push('--append-system-prompt-file', options.appendSystemPromptFile)
    }

    // ── Agent / sub-agents ────────────────────────────────────────────────────
    if (options.agent) args.push('--agent', options.agent)
    if (options.agents) args.push('--agents', JSON.stringify(options.agents))
    if (options.teammateMode) args.push('--teammate-mode', options.teammateMode)

    // ── MCP & plugins ─────────────────────────────────────────────────────────
    if (options.mcpConfig) args.push('--mcp-config', options.mcpConfig)
    if (options.strictMcpConfig) args.push('--strict-mcp-config')
    if (options.pluginDir) args.push('--plugin-dir', options.pluginDir)

    // ── Workspace ─────────────────────────────────────────────────────────────
    for (const dir of options.additionalDirs ?? []) args.push('--add-dir', dir)
    if (options.worktree) args.push('--worktree')

    // ── Budget / limits ───────────────────────────────────────────────────────
    if (options.maxBudget !== undefined) {
      args.push('--max-budget-usd', String(options.maxBudget))
    }
    if (options.maxTurns !== undefined) {
      args.push('--max-turns', String(options.maxTurns))
    }

    // ── Integration ───────────────────────────────────────────────────────────
    if (options.chrome === true) args.push('--chrome')
    else if (options.chrome === false) args.push('--no-chrome')
    if (options.ide) args.push('--ide')

    // ── Init / maintenance ────────────────────────────────────────────────────
    if (options.init) args.push('--init')
    if (options.initOnly) args.push('--init-only')
    if (options.maintenance) args.push('--maintenance')

    // ── Debug / settings ──────────────────────────────────────────────────────
    if (options.debug) args.push('--debug', options.debug)
    if (options.settings) args.push('--settings', options.settings)
    if (options.settingSources?.length) {
      args.push('--setting-sources', options.settingSources.join(','))
    }
    if (options.disableSlashCommands) args.push('--disable-slash-commands')

    // ── Catch-all flags ───────────────────────────────────────────────────────
    for (const [key, value] of Object.entries(options.flags ?? {})) {
      if (value === true) args.push(`--${key}`)
      else if (value !== false) args.push(`--${key}`, String(value))
    }

    return args
  }

  parseOutput(line: string): ParsedOutput {
    const trimmed = line.trim()
    if (!trimmed) return { type: 'text', content: '' }

    // JSON output (--output-format stream-json / json)
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>
        return this.parseStreamJsonEvent(obj, trimmed)
      } catch {
        // fall through to text parsing
      }
    }

    // Permission prompt detection
    if (PERMISSION_LINE_RE.test(trimmed)) {
      return { type: 'permission-request', content: trimmed.replace(ANSI_RE, '') }
    }

    const stripped = trimmed.replace(ANSI_RE, '')

    if (stripped.startsWith('Error') || stripped.startsWith('error:')) {
      return { type: 'error', content: stripped }
    }

    return { type: 'text', content: stripped }
  }

  private parseStreamJsonEvent(obj: Record<string, unknown>, raw: string): ParsedOutput {
    const type = obj['type'] as string | undefined

    switch (type) {
      case 'content_block_start': {
        const block = obj['content_block'] as Record<string, unknown> | undefined
        if (block?.['type'] === 'tool_use') {
          return { type: 'tool-use', content: String(block['name'] ?? ''), metadata: obj }
        }
        return { type: 'status', content: 'content_block_start', metadata: obj }
      }

      case 'content_block_delta': {
        const delta = obj['delta'] as Record<string, unknown> | undefined
        if (!delta) return { type: 'text', content: raw }
        const dt = delta['type'] as string | undefined
        if (dt === 'text_delta') {
          return { type: 'text', content: String(delta['text'] ?? '') }
        }
        if (dt === 'thinking_delta') {
          return { type: 'thinking', content: String(delta['thinking'] ?? '') }
        }
        if (dt === 'input_json_delta') {
          return { type: 'tool-use', content: String(delta['partial_json'] ?? ''), metadata: obj }
        }
        return { type: 'status', content: dt ?? 'delta', metadata: obj }
      }

      case 'message_start':
      case 'message_delta':
      case 'message_stop':
      case 'content_block_stop':
        return { type: 'status', content: type, metadata: obj }

      case 'error': {
        const err = obj['error'] as Record<string, unknown> | undefined
        return { type: 'error', content: String(err?.['message'] ?? raw), metadata: obj }
      }

      case 'permission_request':
        return {
          type: 'permission-request',
          content: String(obj['message'] ?? obj['description'] ?? raw),
          metadata: obj,
        }

      default:
        return {
          type: 'text',
          content: String(obj['content'] ?? obj['message'] ?? obj['text'] ?? raw),
          metadata: obj,
        }
    }
  }

  startSession(options: SessionOptions): ChildProcess {
    const args = this.buildArgs(options)

    const proc = spawn(this.binaryPath, args, {
      cwd: options.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: getSpawnEnv(),
    })

    if (options.prompt) {
      if (options.mode === 'prompt') {
        // Prompt mode: send via stdin then close
        proc.stdin?.write(options.prompt)
        proc.stdin?.end()
      } else {
        // Interactive mode: send via stdin immediately so Claude doesn't wait
        // for piped data and emit the "no stdin data received in 3s" warning.
        proc.stdin?.write(options.prompt + '\n')
      }
    }

    return proc
  }

  sendInput(proc: ChildProcess, input: string): void {
    proc.stdin?.write(input + '\n')
  }

  sendSlashCommand(proc: ChildProcess, command: string): void {
    proc.stdin?.write(command + '\n')
  }
}
