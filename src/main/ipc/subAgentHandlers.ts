import type { IpcMain } from 'electron'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import type { CLIManager } from '../cli/CLIManager'
import { resolveInShell } from '../utils/shellEnv'
import { checkRateLimit } from '../utils/rateLimiter'

export function registerSubAgentHandlers(ipcMain: IpcMain, cliManager: CLIManager): void {
  // ── Spawn a delegated task / sub-agent ──────────────────────────────────────

  ipcMain.handle(
    'subagent:spawn',
    (_e, args: {
      name: string
      cli: 'copilot' | 'claude'
      prompt: string
      model?: string
      workingDirectory?: string
      permissionMode?: string
      agent?: string
      allowedTools?: string[]
      maxBudget?: number
      maxTurns?: number
    }) => {
      const rl = checkRateLimit('subagent:spawn')
      if (!rl.allowed) return { error: `Rate limited — try again in ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s` }
      return cliManager.spawnSubAgent(args)
    },
  )

  // ── List all sub-agents ────────────────────────────────────────────────────

  ipcMain.handle('subagent:list', () => cliManager.listSubAgents())

  // ── Get output log for a sub-agent ─────────────────────────────────────────

  ipcMain.handle(
    'subagent:get-output',
    (_e, args: { id: string }) => cliManager.getSubAgentOutput(args.id),
  )

  // ── Kill a sub-agent ───────────────────────────────────────────────────────

  ipcMain.handle(
    'subagent:kill',
    (_e, args: { id: string }) => cliManager.killSubAgent(args.id),
  )

  // ── Pause a sub-agent (SIGINT) ─────────────────────────────────────────────

  ipcMain.handle(
    'subagent:pause',
    (_e, args: { id: string }) => cliManager.pauseSubAgent(args.id),
  )

  // ── Resume a sub-agent ─────────────────────────────────────────────────────

  ipcMain.handle(
    'subagent:resume',
    (_e, args: { id: string; prompt?: string }) =>
      cliManager.resumeSubAgent(args.id, args.prompt),
  )

  // ── Kill all sub-agents ────────────────────────────────────────────────────

  ipcMain.handle('subagent:kill-all', () => cliManager.killAllSubAgents())

  // ── Pop out a sub-agent output into a new window ───────────────────────────

  ipcMain.handle(
    'subagent:pop-out',
    (_e, args: { id: string; name: string }) => {
      const win = new BrowserWindow({
        width: 720,
        height: 560,
        title: `Sub-Agent: ${args.name}`,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })

      // Load the same renderer but with a hash route pointing to the pop-out view
      if (process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/subagent-popout/${args.id}`)
      } else {
        win.loadFile(join(__dirname, '../renderer/index.html'), {
          hash: `/subagent-popout/${args.id}`,
        })
      }

      return { windowId: win.id }
    },
  )

  // ── Fleet status (Copilot only — sends /fleet and returns output) ──────────

  ipcMain.handle(
    'subagent:fleet-status',
    async (_e, args: { sessionId: string }) => {
      cliManager.sendSlashCommand(args.sessionId, '/fleet')
      return { sent: true }
    },
  )

  // ── Check if claude-code-queue is installed ────────────────────────────────

  ipcMain.handle('subagent:check-queue-installed', async () => {
    const resolved = await resolveInShell('claude-code-queue')
    return { installed: !!resolved, path: resolved ?? null }
  })
}
