import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ChildProcess } from 'child_process'
import type { SessionOptions, ParsedOutput } from './types'
import type { ICLIAdapter } from './types'
import { resolveInShell, getScopedSpawnEnv } from '../utils/shellEnv'

// Matches prompts like "Allow copilot to run: `shell(...)` [y/n/a]?" or "[y/n]?"
const PERMISSION_LINE_RE = /\[y\/n(?:\/a)?\]\s*[?:]*\s*$/i
// Strip all ANSI/VT100 escape sequences (colors, cursor movement, screen control, etc.)
const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-9;]*[ -/]*[@-~])/g

export class CopilotAdapter implements ICLIAdapter {
  readonly cliName = 'copilot-cli'
  binaryPath = 'copilot'

  async isInstalled(): Promise<boolean> {
    const resolved = await resolveInShell('copilot')
    if (resolved) { this.binaryPath = resolved; return true }
    return false
  }

  async isAuthenticated(): Promise<boolean> {
    if (process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN']) return true
    const configPath = join(homedir(), '.copilot', 'config.json')
    if (existsSync(configPath)) {
      try {
        const parsed = JSON.parse(require('fs').readFileSync(configPath, 'utf8')) as Record<string, unknown>
        // Copilot CLI stores logged-in accounts under `loggedInUsers`
        // (camelCase). Older builds wrote `logged_in_users` — accept both.
        const users = parsed['loggedInUsers'] ?? parsed['logged_in_users']
        return Array.isArray(users) && users.length > 0
      } catch { /* malformed */ }
    }
    return false
  }

  buildArgs(options: SessionOptions): string[] {
    const args: string[] = []

    // ── Mode ──────────────────────────────────────────────────────────────────
    // --prompt requires the text as its argument: copilot --prompt "query"
    if (options.mode === 'prompt') {
      if (options.prompt) args.push('--prompt', options.prompt)
      else args.push('--prompt')
    }
    if (options.acp) args.push('--acp')

    // ── Session resumption ────────────────────────────────────────────────────
    if (options.resume) {
      args.push('--resume', options.resume)
    } else if (options.continue) {
      args.push('--continue')
    }

    // ── Config directory ──────────────────────────────────────────────────────
    if (options.configDir) args.push('--config-dir', options.configDir)

    // ── Model & agent ─────────────────────────────────────────────────────────
    if (options.model) args.push('--model', options.model)
    if (options.agent) args.push('--agent', options.agent)

    // ── Permissions (deny overrides allow, so process denies last) ────────────
    if (options.yolo) {
      args.push('--yolo')
    } else {
      if (options.allowAll) args.push('--allow-all')
      if (options.allowAllTools) args.push('--allow-all-tools')
    }
    for (const tool of options.allowedTools ?? []) args.push('--allow-tool', tool)
    for (const tool of options.deniedTools ?? []) args.push('--deny-tool', tool)
    if (options.availableTools?.length) {
      args.push('--available-tools', options.availableTools.join(','))
    }
    if (options.excludedTools?.length) {
      args.push('--excluded-tools', options.excludedTools.join(','))
    }

    // ── Experimental features ─────────────────────────────────────────────────
    if (options.experimental === true) args.push('--experimental')
    else if (options.experimental === false) args.push('--no-experimental')

    // ── Output format ─────────────────────────────────────────────────────────
    if (options.outputFormat) args.push('--output-format', options.outputFormat)

    // ── Alt screen ────────────────────────────────────────────────────────────
    if (options.altScreen === false || options.altScreen === 'off') {
      args.push('--alt-screen', 'off')
    } else if (options.altScreen === 'on') {
      args.push('--alt-screen', 'on')
    }

    // ── UI / accessibility ────────────────────────────────────────────────────
    if (options.banner) args.push('--banner')
    if (options.screenReader) args.push('--screen-reader')
    if (options.streamerMode) args.push('--streamer-mode')

    // ── MCP ───────────────────────────────────────────────────────────────────
    // mcpConfig maps to --additional-mcp-config for Copilot
    if (options.mcpConfig) args.push('--additional-mcp-config', options.mcpConfig)
    if (options.disableBuiltinMcps) args.push('--disable-builtin-mcps')
    if (options.disableMcpServer) args.push('--disable-mcp-server', options.disableMcpServer)
    if (options.enableAllGithubMcpTools) args.push('--enable-all-github-mcp-tools')

    // ── Plugin ────────────────────────────────────────────────────────────────
    for (const dir of options.pluginDirs ?? []) args.push('--plugin-dir', dir)

    // ── Output behaviour ──────────────────────────────────────────────────────
    if (options.stream === false) args.push('--stream', 'false')
    if (options.saveGist) args.push('--save-gist')
    if (options.bashEnv) args.push('--bash-env')

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

    // JSON output (--output-format json / JSONL mode)
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>
        return this.parseJsonEvent(obj, trimmed)
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

  private parseJsonEvent(obj: Record<string, unknown>, raw: string): ParsedOutput {
    const key = (obj['type'] ?? obj['event'] ?? '') as string

    switch (key) {
      case 'tool_call':
      case 'tool_use':
        return {
          type: 'tool-use',
          content: String(obj['name'] ?? obj['tool'] ?? raw),
          metadata: obj,
        }
      case 'permission_request':
      case 'tool_permission':
        return {
          type: 'permission-request',
          content: String(obj['message'] ?? obj['description'] ?? raw),
          metadata: obj,
        }
      case 'error':
        return {
          type: 'error',
          content: String(obj['message'] ?? obj['error'] ?? raw),
          metadata: obj,
        }
      case 'thinking':
      case 'reasoning':
        return {
          type: 'thinking',
          content: String(obj['content'] ?? obj['text'] ?? raw),
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
      env: getScopedSpawnEnv('copilot'),
    })

    // Copilot's --prompt takes the text as a CLI argument (not stdin), so
    // nothing to write here. Close stdin to prevent the process hanging.
    if (options.mode === 'prompt') {
      proc.stdin?.end()
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
