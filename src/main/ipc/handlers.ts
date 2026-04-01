import type { IpcMain } from 'electron'
import type { SessionOptions } from '../cli/types'
import type { CLIManager } from '../cli/CLIManager'
import type { AgentManager } from '../agents/AgentManager'

export function registerIpcHandlers(
  ipcMain: IpcMain,
  cliManager: CLIManager,
  agentManager?: AgentManager
): void {
  ipcMain.handle('cli:check-installed', () => cliManager.checkInstalled())

  ipcMain.handle('cli:check-auth', () => cliManager.checkAuth())

  ipcMain.handle('cli:start-session', (_event, options: SessionOptions) => {
    // Auto-inject the stored active agent when the caller didn't specify one explicitly
    let resolved = options
    if (!resolved.agent && agentManager) {
      const active = agentManager.getActiveAgents()
      const agentId = active[options.cli] ?? null

      if (agentId) {
        if (options.cli === 'copilot') {
          // Copilot: strip the "copilot:file:" or "explore" prefix for the --agent flag
          const flagValue = agentId.includes(':file:')
            ? agentId.split(':file:').pop()!
            : agentId
          resolved = { ...resolved, agent: flagValue }
        } else {
          // Claude: built-in agents list — pass via --agent NAME
          // File-based agents are handled by their name in the AGENT.md
          const flagValue = agentId.includes(':file:')
            ? agentId.split(':file:').pop()!
            : agentId
          resolved = { ...resolved, agent: flagValue }
        }
      }
    }
    return cliManager.startSession(resolved)
  })

  ipcMain.handle(
    'cli:send-input',
    (_event, { sessionId, input }: { sessionId: string; input: string }) => {
      cliManager.sendInput(sessionId, input)
    }
  )

  ipcMain.handle(
    'cli:send-slash-command',
    (_event, { sessionId, command }: { sessionId: string; command: string }) => {
      cliManager.sendSlashCommand(sessionId, command)
    }
  )

  ipcMain.handle('cli:stop-session', (_event, { sessionId }: { sessionId: string }) =>
    cliManager.stopSession(sessionId)
  )

  ipcMain.handle('cli:list-sessions', () => cliManager.listSessions())

  ipcMain.handle('cli:get-session', (_event, { sessionId }: { sessionId: string }) =>
    cliManager.getSession(sessionId)
  )
}
