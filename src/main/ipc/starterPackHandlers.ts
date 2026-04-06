import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { STARTER_AGENTS, STARTER_SKILLS, STARTER_MEMORIES, STARTER_PROMPTS, AgentHandoffService } from '../starter-pack'
import type { MemorySetupState } from '../../renderer/src/types/starter-pack'

// ── Store for memory setup state and interaction tracking ────────────────────

interface StarterPackStoreSchema {
  memorySetupState: MemorySetupState
  userMemories: Record<string, Record<string, unknown>> // memoryId → field values
}

const DEFAULT_MEMORY_STATE: MemorySetupState = {
  workProfileComplete: false,
  communicationPreferencesPrompted: false,
  communicationPreferencesComplete: false,
  communicationPreferencesDismissCount: 0,
  currentPrioritiesPrompted: false,
  currentPrioritiesComplete: false,
  currentPrioritiesDismissCount: 0,
  stakeholderMapEntries: 0,
  workingPreferencesComplete: false,
  interactionCount: 0,
  hasCompletedFirstInteraction: false,
}

const store = new Store<StarterPackStoreSchema>({
  name: 'clear-path-starter-pack',
  encryptionKey: getStoreEncryptionKey(),
  defaults: {
    memorySetupState: DEFAULT_MEMORY_STATE,
    userMemories: {},
  },
})

const handoffService = new AgentHandoffService()

// ── Registration ────────────────────────────────────────────────────────────

export function registerStarterPackHandlers(ipcMain: IpcMain): void {
  // ── Agent definitions ───────────────────────────────────────────────────

  ipcMain.handle('starter-pack:get-agents', () => STARTER_AGENTS)

  ipcMain.handle('starter-pack:get-agent', (_e, args: { id: string }) =>
    STARTER_AGENTS.find((a) => a.id === args.id) ?? null,
  )

  ipcMain.handle('starter-pack:get-visible-agents', () => {
    const state = store.get('memorySetupState')
    if (state.hasCompletedFirstInteraction) {
      return STARTER_AGENTS
    }
    // Before first interaction, only show spotlight agents
    return STARTER_AGENTS.filter((a) => a.category === 'spotlight')
  })

  // ── Skill definitions ─────────────────────────────────────────────────

  ipcMain.handle('starter-pack:get-skills', () => STARTER_SKILLS)

  ipcMain.handle('starter-pack:get-skill', (_e, args: { id: string }) =>
    STARTER_SKILLS.find((s) => s.id === args.id) ?? null,
  )

  // ── Memory definitions & user data ────────────────────────────────────

  ipcMain.handle('starter-pack:get-memories', () => STARTER_MEMORIES)

  ipcMain.handle('starter-pack:get-memory', (_e, args: { id: string }) =>
    STARTER_MEMORIES.find((m) => m.id === args.id) ?? null,
  )

  ipcMain.handle('starter-pack:get-memory-data', (_e, args: { id: string }) =>
    store.get('userMemories')[args.id] ?? null,
  )

  ipcMain.handle('starter-pack:save-memory-data', (_e, args: { id: string; data: Record<string, unknown> }) => {
    const memories = store.get('userMemories')
    memories[args.id] = args.data
    store.set('userMemories', memories)

    // Update setup state
    const state = store.get('memorySetupState')
    if (args.id === 'work-profile') state.workProfileComplete = true
    if (args.id === 'communication-preferences') state.communicationPreferencesComplete = true
    if (args.id === 'current-priorities') state.currentPrioritiesComplete = true
    if (args.id === 'working-preferences') state.workingPreferencesComplete = true
    if (args.id === 'stakeholder-map') {
      const entries = args.data['entries'] as unknown[] | undefined
      state.stakeholderMapEntries = entries?.length ?? 0
    }
    store.set('memorySetupState', state)

    return { success: true }
  })

  // ── Prompt suggestions ────────────────────────────────────────────────

  ipcMain.handle('starter-pack:get-prompts', () => {
    const state = store.get('memorySetupState')
    if (state.hasCompletedFirstInteraction) {
      return STARTER_PROMPTS
    }
    return STARTER_PROMPTS.filter((p) => p.category === 'spotlight')
  })

  ipcMain.handle('starter-pack:get-all-prompts', () => STARTER_PROMPTS)

  // ── Memory setup state & interaction tracking ─────────────────────────

  ipcMain.handle('starter-pack:get-setup-state', () => store.get('memorySetupState'))

  ipcMain.handle('starter-pack:record-interaction', () => {
    const state = store.get('memorySetupState')
    state.interactionCount++
    if (!state.hasCompletedFirstInteraction && state.interactionCount >= 1) {
      state.hasCompletedFirstInteraction = true
    }
    store.set('memorySetupState', state)
    return state
  })

  ipcMain.handle('starter-pack:dismiss-memory-prompt', (_e, args: { memoryId: string }) => {
    const state = store.get('memorySetupState')
    if (args.memoryId === 'communication-preferences') {
      state.communicationPreferencesDismissCount++
      state.communicationPreferencesPrompted = true
    }
    if (args.memoryId === 'current-priorities') {
      state.currentPrioritiesDismissCount++
      state.currentPrioritiesPrompted = true
    }
    store.set('memorySetupState', state)
    return { success: true }
  })

  ipcMain.handle('starter-pack:should-prompt-memory', (_e, args: { memoryId: string }) => {
    const state = store.get('memorySetupState')

    if (args.memoryId === 'communication-preferences') {
      // Prompt after first interaction, max 2 prompts
      return (
        state.hasCompletedFirstInteraction &&
        !state.communicationPreferencesComplete &&
        state.communicationPreferencesDismissCount < 2
      )
    }

    if (args.memoryId === 'current-priorities') {
      // Prompt after 3rd interaction, max 2 prompts
      return (
        state.interactionCount >= 3 &&
        !state.currentPrioritiesComplete &&
        state.currentPrioritiesDismissCount < 2
      )
    }

    return false
  })

  // ── Handoff service ───────────────────────────────────────────────────

  ipcMain.handle('starter-pack:check-handoff', (_e, args: {
    currentAgentId: string
    responseContent: string
    userRequest: string
  }) => handoffService.checkForHandoff(args.currentAgentId, args.responseContent, args.userRequest))

  ipcMain.handle('starter-pack:build-handoff-context', (_e, args: {
    fromAgentId: string
    toAgentId: string
    previousOutput: string
    originalRequest: string
    reason: string
  }) => handoffService.buildHandoffContext(
    args.fromAgentId, args.toAgentId, args.previousOutput, args.originalRequest, args.reason,
  ))

  ipcMain.handle('starter-pack:get-agent-prompt', (_e, args: {
    agentId: string
    handoffContext?: { fromAgentId: string; toAgentId: string; summary: string; originalRequest: string; reason: string }
  }) => handoffService.getAgentSystemPrompt(args.agentId, args.handoffContext ?? undefined))
}
