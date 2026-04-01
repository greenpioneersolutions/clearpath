import type { IpcMain } from 'electron'
import type { AgentDef } from '../../renderer/src/types/ipc'
import type { AgentManager } from '../agents/AgentManager'

export function registerAgentHandlers(ipcMain: IpcMain, agentManager: AgentManager): void {
  /** Return built-in + file-based agents for both CLIs. */
  ipcMain.handle(
    'agent:list',
    (_event, { workingDir }: { workingDir?: string } = {}) =>
      agentManager.listAgents(workingDir)
  )

  /** Create a new agent file and return the written AgentDef. */
  ipcMain.handle(
    'agent:create',
    (
      _event,
      {
        def,
        workingDir,
      }: { def: Omit<AgentDef, 'id' | 'source' | 'filePath'>; workingDir?: string }
    ) => agentManager.createAgent(def, workingDir)
  )

  /** Read the raw markdown content of an agent file for the editor. */
  ipcMain.handle('agent:read-file', (_event, { filePath }: { filePath: string }) =>
    agentManager.readAgentFile(filePath)
  )

  /** Write raw markdown back to an agent file. */
  ipcMain.handle(
    'agent:write-file',
    (_event, { filePath, content }: { filePath: string; content: string }) => {
      agentManager.writeAgentFile(filePath, content)
    }
  )

  /** Delete an agent file from disk. */
  ipcMain.handle('agent:delete', (_event, { filePath }: { filePath: string }) => {
    agentManager.deleteAgent(filePath)
  })

  // ── Enabled / active state ─────────────────────────────────────────────────

  ipcMain.handle('agent:get-enabled', () => agentManager.getEnabledAgentIds())

  ipcMain.handle('agent:set-enabled', (_event, { ids }: { ids: string[] }) => {
    agentManager.setEnabledAgentIds(ids)
  })

  ipcMain.handle('agent:get-active', () => agentManager.getActiveAgents())

  ipcMain.handle(
    'agent:set-active',
    (_event, { cli, agentId }: { cli: 'copilot' | 'claude'; agentId: string | null }) => {
      agentManager.setActiveAgent(cli, agentId)
    }
  )

  // ── Profiles ───────────────────────────────────────────────────────────────

  ipcMain.handle('agent:get-profiles', () => agentManager.getProfiles())

  ipcMain.handle(
    'agent:save-profile',
    (_event, { name, enabledAgentIds }: { name: string; enabledAgentIds: string[] }) =>
      agentManager.saveProfile(name, enabledAgentIds)
  )

  ipcMain.handle('agent:apply-profile', (_event, { profileId }: { profileId: string }) =>
    agentManager.applyProfile(profileId)
  )

  ipcMain.handle('agent:delete-profile', (_event, { profileId }: { profileId: string }) => {
    agentManager.deleteProfile(profileId)
  })
}
