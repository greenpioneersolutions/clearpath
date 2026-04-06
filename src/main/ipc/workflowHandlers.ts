import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string
  name: string
  prompt: string
  executionType: 'session' | 'sub-agent' | 'background'
  agent?: string
  model?: string
  workingDirectory?: string
  skill?: string
  permissionMode?: string
  maxBudget?: number
  parallel: boolean
  collapsed: boolean
}

export interface SavedWorkflow {
  id: string
  name: string
  description: string
  steps: WorkflowStep[]
  createdAt: number
  lastUsedAt?: number
  usageCount: number
}

interface WorkflowStoreSchema {
  workflows: SavedWorkflow[]
}

const store = new Store<WorkflowStoreSchema>({
  name: 'clear-path-workflows',
  encryptionKey: getStoreEncryptionKey(),
  defaults: { workflows: [] },
})

export function registerWorkflowHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('workflow:list', () => store.get('workflows'))

  ipcMain.handle('workflow:get', (_e, args: { id: string }) =>
    store.get('workflows').find((w) => w.id === args.id) ?? null,
  )

  ipcMain.handle('workflow:save', (_e, args: {
    id?: string; name: string; description: string; steps: WorkflowStep[]
  }) => {
    const workflows = store.get('workflows')
    const existing = args.id ? workflows.findIndex((w) => w.id === args.id) : -1

    const workflow: SavedWorkflow = {
      id: args.id ?? randomUUID(),
      name: args.name,
      description: args.description,
      steps: args.steps,
      createdAt: existing >= 0 ? workflows[existing].createdAt : Date.now(),
      lastUsedAt: existing >= 0 ? workflows[existing].lastUsedAt : undefined,
      usageCount: existing >= 0 ? workflows[existing].usageCount : 0,
    }

    if (existing >= 0) workflows[existing] = workflow
    else workflows.push(workflow)
    store.set('workflows', workflows)
    return workflow
  })

  ipcMain.handle('workflow:delete', (_e, args: { id: string }) => {
    store.set('workflows', store.get('workflows').filter((w) => w.id !== args.id))
    return { success: true }
  })

  ipcMain.handle('workflow:record-usage', (_e, args: { id: string }) => {
    const workflows = store.get('workflows')
    const w = workflows.find((wf) => wf.id === args.id)
    if (w) {
      w.usageCount++
      w.lastUsedAt = Date.now()
      store.set('workflows', workflows)
    }
    return { success: true }
  })

  // Cost estimation: rough tokens from prompt length × model pricing
  ipcMain.handle('workflow:estimate-cost', (_e, args: { steps: WorkflowStep[] }) => {
    let totalTokens = 0
    for (const step of args.steps) {
      // Rough: 1 token ≈ 4 chars for input, estimate 2x output
      const inputTokens = Math.ceil(step.prompt.length / 4)
      const outputTokens = inputTokens * 2
      totalTokens += inputTokens + outputTokens
    }
    // Default pricing: ~$3/M input, ~$15/M output (sonnet-class)
    const cost = (totalTokens / 3) * 3 / 1_000_000 + (totalTokens * 2 / 3) * 15 / 1_000_000
    return { totalTokens, estimatedCost: cost, stepCount: args.steps.length }
  })
}
