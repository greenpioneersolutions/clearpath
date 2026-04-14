import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockGet,
  mockSet,
  mockStoreConstructor,
  existsSyncMock,
  statSyncMock,
  readFileSyncMock,
  writeFileSyncMock,
  readdirSyncMock,
  homedirMock,
  randomUUIDMock,
  storeSecretMock,
  retrieveSecretMock,
  hasSecretMock,
  getSecretPreviewMock,
  deleteSecretMock,
  setCustomEnvVarsMock,
  dialogShowSaveDialogMock,
  dialogShowOpenDialogMock,
  logMock,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockStoreConstructor: vi.fn(),
  existsSyncMock: vi.fn().mockReturnValue(false),
  statSyncMock: vi.fn().mockReturnValue({ isDirectory: () => true }),
  readFileSyncMock: vi.fn().mockReturnValue(''),
  writeFileSyncMock: vi.fn(),
  readdirSyncMock: vi.fn().mockReturnValue([]),
  homedirMock: vi.fn().mockReturnValue('/mock/home'),
  randomUUIDMock: vi.fn().mockReturnValue('test-uuid-1234'),
  storeSecretMock: vi.fn(),
  retrieveSecretMock: vi.fn().mockReturnValue(''),
  hasSecretMock: vi.fn().mockReturnValue(false),
  getSecretPreviewMock: vi.fn().mockReturnValue('****'),
  deleteSecretMock: vi.fn(),
  setCustomEnvVarsMock: vi.fn(),
  dialogShowSaveDialogMock: vi.fn().mockResolvedValue({ canceled: true }),
  dialogShowOpenDialogMock: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  logMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      constructor(...args: unknown[]) {
        mockStoreConstructor(...args)
      }
      get = mockGet
      set = mockSet
      has = vi.fn()
      delete = vi.fn()
    },
  }
})

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  statSync: statSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
  readdirSync: readdirSyncMock,
}))

vi.mock('os', () => ({
  homedir: homedirMock,
}))

vi.mock('crypto', () => ({
  randomUUID: randomUUIDMock,
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

vi.mock('../utils/credentialStore', () => ({
  storeSecret: storeSecretMock,
  retrieveSecret: retrieveSecretMock,
  hasSecret: hasSecretMock,
  getSecretPreview: getSecretPreviewMock,
  deleteSecret: deleteSecretMock,
}))

vi.mock('../utils/shellEnv', () => ({
  setCustomEnvVars: setCustomEnvVarsMock,
  setEnvVarEntries: vi.fn(),
  getSpawnEnv: vi.fn().mockReturnValue({}),
  getScopedSpawnEnv: vi.fn().mockReturnValue({}),
  initShellEnv: vi.fn().mockResolvedValue(undefined),
  resolveInShell: vi.fn(),
}))

vi.mock('../utils/logger', () => ({
  log: logMock,
}))

// Override the electron mock's dialog for this test
vi.mock('electron', async () => {
  const actual = await vi.importActual<typeof import('electron')>('electron')
  return {
    ...actual,
    dialog: {
      showSaveDialog: dialogShowSaveDialogMock,
      showOpenDialog: dialogShowOpenDialogMock,
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
      showErrorBox: vi.fn(),
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined),
      openPath: vi.fn().mockResolvedValue(''),
      showItemInFolder: vi.fn(),
    },
  }
})

// ── Dynamic import with resetModules ────────────────────────────────────────

type RegisterFn = typeof import('./settingsHandlers').registerSettingsHandlers

// ── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  flags: {},
  model: { copilot: '', claude: '' },
  maxBudgetUsd: null,
  maxTurns: null,
  verbose: false,
  envVars: {},
}

function createMockIpcMain() {
  return {
    handle: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn(),
  }
}

function getHandler(ipcMain: ReturnType<typeof createMockIpcMain>, channel: string) {
  const call = ipcMain.handle.mock.calls.find(
    (c: unknown[]) => c[0] === channel,
  )
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

const mockEvent = {} as unknown

// ── Tests ───────────────────────────────────────────────────────────────────

describe('settingsHandlers', () => {
  let registerSettingsHandlers: RegisterFn
  let ipcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    // Reset defaults for store mock
    mockGet.mockImplementation((key: string) => {
      if (key === 'settings') return { ...DEFAULT_SETTINGS }
      if (key === 'profiles') return []
      return undefined
    })

    // Re-import to get fresh module with reset singleton
    const mod = await import('./settingsHandlers')
    registerSettingsHandlers = mod.registerSettingsHandlers

    ipcMain = createMockIpcMain()
    registerSettingsHandlers(ipcMain as never)
  })

  // ── Registration ──────────────────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC channels', () => {
      const registeredChannels = ipcMain.handle.mock.calls.map(
        (c: unknown[]) => c[0],
      )
      const expectedChannels = [
        'settings:get',
        'settings:set',
        'settings:update-flag',
        'settings:reset-flag',
        'settings:reset-all',
        'settings:set-model',
        'settings:set-budget',
        'settings:get-env-vars',
        'settings:set-env-var',
        'settings:list-profiles',
        'settings:save-profile',
        'settings:load-profile',
        'settings:delete-profile',
        'settings:export-profile',
        'settings:import-profile',
        'settings:list-plugins',
        'settings:open-terminal',
      ]
      for (const ch of expectedChannels) {
        expect(registeredChannels).toContain(ch)
      }
    })
  })

  // ── Startup env var migration ─────────────────────────────────────────────

  describe('startup env var migration', () => {
    it('loads encrypted secrets into spawn env on startup', async () => {
      vi.resetModules()
      vi.clearAllMocks()

      mockGet.mockImplementation((key: string) => {
        if (key === 'settings') return { ...DEFAULT_SETTINGS, envVars: { CUSTOM_VAR: 'val1' } }
        if (key === 'profiles') return []
        return undefined
      })
      retrieveSecretMock.mockReturnValue('secret-token')

      const mod = await import('./settingsHandlers')
      const ipc = createMockIpcMain()
      mod.registerSettingsHandlers(ipc as never)

      expect(setCustomEnvVarsMock).toHaveBeenCalled()
      const vars = setCustomEnvVarsMock.mock.calls[0][0]
      expect(vars).toHaveProperty('GH_TOKEN', 'secret-token')
      expect(vars).toHaveProperty('CUSTOM_VAR', 'val1')
    })

    it('migrates plaintext sensitive keys to encrypted store on startup', async () => {
      vi.resetModules()
      vi.clearAllMocks()

      const envVarsWithSecret = { GH_TOKEN: 'plain-token', OTHER: 'x' }
      mockGet.mockImplementation((key: string) => {
        if (key === 'settings') return { ...DEFAULT_SETTINGS, envVars: { ...envVarsWithSecret } }
        if (key === 'profiles') return []
        return undefined
      })
      retrieveSecretMock.mockReturnValue('')

      const mod = await import('./settingsHandlers')
      const ipc = createMockIpcMain()
      mod.registerSettingsHandlers(ipc as never)

      expect(storeSecretMock).toHaveBeenCalledWith('env-GH_TOKEN', 'plain-token')
    })
  })

  // ── settings:get ──────────────────────────────────────────────────────────

  describe('settings:get', () => {
    it('returns current settings from store', () => {
      const settings = { ...DEFAULT_SETTINGS, verbose: true }
      mockGet.mockReturnValue(settings)

      const handler = getHandler(ipcMain, 'settings:get')
      const result = handler()
      expect(result).toEqual(settings)
    })
  })

  // ── settings:set ──────────────────────────────────────────────────────────

  describe('settings:set', () => {
    it('persists new settings and returns success', () => {
      const newSettings = { ...DEFAULT_SETTINGS, verbose: true }
      const handler = getHandler(ipcMain, 'settings:set')
      const result = handler(mockEvent, { settings: newSettings })
      expect(mockSet).toHaveBeenCalledWith('settings', newSettings)
      expect(result).toEqual({ success: true })
    })
  })

  // ── settings:update-flag ──────────────────────────────────────────────────

  describe('settings:update-flag', () => {
    it('sets a flag value', () => {
      const settings = { ...DEFAULT_SETTINGS, flags: {} }
      mockGet.mockReturnValue(settings)

      const handler = getHandler(ipcMain, 'settings:update-flag')
      const result = handler(mockEvent, { key: 'copilot:experimental', value: true })

      expect(mockSet).toHaveBeenCalledWith('settings', expect.objectContaining({
        flags: { 'copilot:experimental': true },
      }))
      expect(result).toEqual(expect.objectContaining({ flags: { 'copilot:experimental': true } }))
    })

    it('deletes a flag when value is undefined', () => {
      const settings = { ...DEFAULT_SETTINGS, flags: { 'copilot:yolo': true } }
      mockGet.mockReturnValue(settings)

      const handler = getHandler(ipcMain, 'settings:update-flag')
      handler(mockEvent, { key: 'copilot:yolo', value: undefined })

      expect(mockSet).toHaveBeenCalledWith('settings', expect.objectContaining({
        flags: {},
      }))
    })

    it('deletes a flag when value is null', () => {
      const settings = { ...DEFAULT_SETTINGS, flags: { 'copilot:yolo': true } }
      mockGet.mockReturnValue(settings)

      const handler = getHandler(ipcMain, 'settings:update-flag')
      handler(mockEvent, { key: 'copilot:yolo', value: null })

      expect(mockSet).toHaveBeenCalledWith('settings', expect.objectContaining({
        flags: {},
      }))
    })

    it('deletes a flag when value is empty string', () => {
      const settings = { ...DEFAULT_SETTINGS, flags: { 'copilot:yolo': true } }
      mockGet.mockReturnValue(settings)

      const handler = getHandler(ipcMain, 'settings:update-flag')
      handler(mockEvent, { key: 'copilot:yolo', value: '' })

      expect(mockSet).toHaveBeenCalledWith('settings', expect.objectContaining({
        flags: {},
      }))
    })

    // BUG: value of `false` is treated as falsy and would NOT be deleted,
    // but value of `0` is also not deleted because the check only tests
    // undefined/null/empty-string. This is correct behavior for boolean flags.
  })

  // ── settings:reset-flag ───────────────────────────────────────────────────

  describe('settings:reset-flag', () => {
    it('removes a specific flag from settings', () => {
      const settings = { ...DEFAULT_SETTINGS, flags: { a: 1, b: 2 } }
      mockGet.mockReturnValue(settings)

      const handler = getHandler(ipcMain, 'settings:reset-flag')
      const result = handler(mockEvent, { key: 'a' })

      expect(mockSet).toHaveBeenCalledWith('settings', expect.objectContaining({
        flags: { b: 2 },
      }))
      expect(result).toEqual(expect.objectContaining({ flags: { b: 2 } }))
    })
  })

  // ── settings:reset-all ────────────────────────────────────────────────────

  describe('settings:reset-all', () => {
    it('restores default settings and returns them', () => {
      const handler = getHandler(ipcMain, 'settings:reset-all')
      const result = handler()
      expect(mockSet).toHaveBeenCalledWith('settings', DEFAULT_SETTINGS)
      expect(result).toEqual(DEFAULT_SETTINGS)
    })
  })

  // ── settings:set-model ────────────────────────────────────────────────────

  describe('settings:set-model', () => {
    it('updates the copilot model', () => {
      const settings = { ...DEFAULT_SETTINGS, model: { copilot: '', claude: '' } }
      mockGet.mockReturnValue(settings)

      const handler = getHandler(ipcMain, 'settings:set-model')
      const result = handler(mockEvent, { cli: 'copilot', model: 'gpt-5' })

      expect(mockSet).toHaveBeenCalledWith('settings', expect.objectContaining({
        model: { copilot: 'gpt-5', claude: '' },
      }))
      expect(result).toEqual(expect.objectContaining({
        model: { copilot: 'gpt-5', claude: '' },
      }))
    })

    it('updates the claude model', () => {
      const settings = { ...DEFAULT_SETTINGS, model: { copilot: 'gpt-5', claude: '' } }
      mockGet.mockReturnValue(settings)

      const handler = getHandler(ipcMain, 'settings:set-model')
      const result = handler(mockEvent, { cli: 'claude', model: 'opus' })

      expect(result).toEqual(expect.objectContaining({
        model: { copilot: 'gpt-5', claude: 'opus' },
      }))
    })
  })

  // ── settings:set-budget ───────────────────────────────────────────────────

  describe('settings:set-budget', () => {
    it('updates budget, turns and verbose settings', () => {
      const settings = { ...DEFAULT_SETTINGS }
      mockGet.mockReturnValue(settings)

      const handler = getHandler(ipcMain, 'settings:set-budget')
      const result = handler(mockEvent, { maxBudgetUsd: 10, maxTurns: 50, verbose: true })

      expect(mockSet).toHaveBeenCalledWith('settings', expect.objectContaining({
        maxBudgetUsd: 10,
        maxTurns: 50,
        verbose: true,
      }))
      expect(result).toEqual(expect.objectContaining({
        maxBudgetUsd: 10,
        maxTurns: 50,
        verbose: true,
      }))
    })

    it('allows null budget and turns', () => {
      const settings = { ...DEFAULT_SETTINGS, maxBudgetUsd: 10, maxTurns: 50 }
      mockGet.mockReturnValue(settings)

      const handler = getHandler(ipcMain, 'settings:set-budget')
      const result = handler(mockEvent, { maxBudgetUsd: null, maxTurns: null, verbose: false })

      expect(result).toEqual(expect.objectContaining({
        maxBudgetUsd: null,
        maxTurns: null,
        verbose: false,
      }))
    })
  })

  // ── settings:get-env-vars ─────────────────────────────────────────────────

  describe('settings:get-env-vars', () => {
    const BUILT_IN_ENTRIES = [
      { key: 'GH_TOKEN', isSensitive: true, scope: 'copilot' as const, isBuiltIn: true, createdAt: 0, updatedAt: 0 },
      { key: 'GITHUB_TOKEN', isSensitive: true, scope: 'copilot' as const, isBuiltIn: true, createdAt: 0, updatedAt: 0 },
      { key: 'GITHUB_ASKPASS', isSensitive: false, scope: 'copilot' as const, isBuiltIn: true, createdAt: 0, updatedAt: 0 },
      { key: 'COPILOT_CUSTOM_INSTRUCTIONS_DIRS', isSensitive: false, scope: 'copilot' as const, isBuiltIn: true, createdAt: 0, updatedAt: 0 },
      { key: 'ANTHROPIC_API_KEY', isSensitive: true, scope: 'claude' as const, isBuiltIn: true, createdAt: 0, updatedAt: 0 },
      { key: 'CLAUDE_CODE_MODEL', isSensitive: false, scope: 'claude' as const, isBuiltIn: true, createdAt: 0, updatedAt: 0 },
      { key: 'ENABLE_TOOL_SEARCH', isSensitive: false, scope: 'claude' as const, isBuiltIn: true, createdAt: 0, updatedAt: 0 },
    ]

    type EnvVarResult = Array<{ key: string; value: string; isSet: boolean; isSensitive: boolean; scope: string; description: string; isBuiltIn: boolean }>

    it('returns all known env var keys with their status', () => {
      const settings = { ...DEFAULT_SETTINGS, envVars: { CLAUDE_CODE_MODEL: 'opus' }, envVarEntries: BUILT_IN_ENTRIES }
      mockGet.mockReturnValue(settings)
      hasSecretMock.mockReturnValue(false)

      const handler = getHandler(ipcMain, 'settings:get-env-vars')
      const result = handler() as EnvVarResult

      expect(result.find(r => r.key === 'GH_TOKEN')).toBeDefined()
      expect(result.find(r => r.key === 'GITHUB_TOKEN')).toBeDefined()
      expect(result.find(r => r.key === 'ANTHROPIC_API_KEY')).toBeDefined()
      expect(result.find(r => r.key === 'CLAUDE_CODE_MODEL')).toBeDefined()
      expect(result.find(r => r.key === 'COPILOT_CUSTOM_INSTRUCTIONS_DIRS')).toBeDefined()
      expect(result.find(r => r.key === 'ENABLE_TOOL_SEARCH')).toBeDefined()
      expect(result.find(r => r.key === 'GITHUB_ASKPASS')).toBeDefined()
    })

    it('marks sensitive keys as sensitive and masks values', () => {
      mockGet.mockReturnValue({ ...DEFAULT_SETTINGS, envVarEntries: BUILT_IN_ENTRIES })
      hasSecretMock.mockReturnValue(true)
      getSecretPreviewMock.mockReturnValue('sk_****AB3F')

      const handler = getHandler(ipcMain, 'settings:get-env-vars')
      const result = handler() as EnvVarResult

      const ghToken = result.find(r => r.key === 'GH_TOKEN')
      expect(ghToken).toBeDefined()
      expect(ghToken!.isSensitive).toBe(true)
      expect(ghToken!.isSet).toBe(true)
      expect(ghToken!.value).toBe('sk_****AB3F')
    })

    it('returns full value for non-sensitive keys', () => {
      mockGet.mockReturnValue({ ...DEFAULT_SETTINGS, envVars: { CLAUDE_CODE_MODEL: 'opus' }, envVarEntries: BUILT_IN_ENTRIES })
      hasSecretMock.mockReturnValue(false)

      const handler = getHandler(ipcMain, 'settings:get-env-vars')
      const result = handler() as EnvVarResult

      const claudeModel = result.find(r => r.key === 'CLAUDE_CODE_MODEL')
      expect(claudeModel).toBeDefined()
      expect(claudeModel!.value).toBe('opus')
      expect(claudeModel!.isSet).toBe(true)
      expect(claudeModel!.isSensitive).toBe(false)
    })

    it('falls back to process.env for non-sensitive unset keys', () => {
      const original = process.env.ENABLE_TOOL_SEARCH
      process.env.ENABLE_TOOL_SEARCH = 'auto:5'
      mockGet.mockReturnValue({ ...DEFAULT_SETTINGS, envVarEntries: BUILT_IN_ENTRIES })
      hasSecretMock.mockReturnValue(false)

      const handler = getHandler(ipcMain, 'settings:get-env-vars')
      const result = handler() as EnvVarResult

      const enableToolSearch = result.find(r => r.key === 'ENABLE_TOOL_SEARCH')
      expect(enableToolSearch).toBeDefined()
      expect(enableToolSearch!.value).toBe('auto:5')
      expect(enableToolSearch!.isSet).toBe(true)

      // Restore
      if (original === undefined) delete process.env.ENABLE_TOOL_SEARCH
      else process.env.ENABLE_TOOL_SEARCH = original
    })
  })

  // ── settings:set-env-var ──────────────────────────────────────────────────

  describe('settings:set-env-var', () => {
    const SENSITIVE_ENTRY = [
      { key: 'GH_TOKEN', isSensitive: true, scope: 'copilot' as const, isBuiltIn: true, createdAt: 0, updatedAt: 0 },
    ]
    const NON_SENSITIVE_ENTRY = [
      { key: 'CLAUDE_CODE_MODEL', isSensitive: false, scope: 'claude' as const, isBuiltIn: true, createdAt: 0, updatedAt: 0 },
    ]

    it('stores sensitive env var in credential store (not plaintext)', () => {
      mockGet.mockReturnValue({ ...DEFAULT_SETTINGS, envVars: {}, envVarEntries: SENSITIVE_ENTRY })
      retrieveSecretMock.mockReturnValue('')

      const handler = getHandler(ipcMain, 'settings:set-env-var')
      const result = handler(mockEvent, { key: 'GH_TOKEN', value: 'ghp_abc123' })

      expect(storeSecretMock).toHaveBeenCalledWith('env-GH_TOKEN', 'ghp_abc123')
      expect(result).toEqual({ success: true })
      // Should NOT be stored in plaintext envVars
      const savedSettings = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'settings')
      expect(savedSettings![1]).toEqual(expect.objectContaining({
        envVars: expect.not.objectContaining({ GH_TOKEN: 'ghp_abc123' }),
      }))
    })

    it('stores non-sensitive env var in plaintext settings', () => {
      mockGet.mockReturnValue({ ...DEFAULT_SETTINGS, envVars: {}, envVarEntries: NON_SENSITIVE_ENTRY })
      retrieveSecretMock.mockReturnValue('')

      const handler = getHandler(ipcMain, 'settings:set-env-var')
      handler(mockEvent, { key: 'CLAUDE_CODE_MODEL', value: 'opus' })

      const settingsCalls = mockSet.mock.calls.filter((c: unknown[]) => c[0] === 'settings')
      const savedSettings = settingsCalls[settingsCalls.length - 1]
      expect(savedSettings![1]).toEqual(expect.objectContaining({
        envVars: { CLAUDE_CODE_MODEL: 'opus' },
      }))
    })

    it('deletes non-sensitive env var when value is empty', () => {
      mockGet.mockReturnValue({ ...DEFAULT_SETTINGS, envVars: { CLAUDE_CODE_MODEL: 'opus' }, envVarEntries: NON_SENSITIVE_ENTRY })
      retrieveSecretMock.mockReturnValue('')

      const handler = getHandler(ipcMain, 'settings:set-env-var')
      handler(mockEvent, { key: 'CLAUDE_CODE_MODEL', value: '' })

      const savedSettings = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'settings')
      expect(savedSettings![1].envVars).not.toHaveProperty('CLAUDE_CODE_MODEL')
    })

    it('rebuilds spawn environment after updating', () => {
      mockGet.mockReturnValue({ ...DEFAULT_SETTINGS, envVars: { MY_VAR: 'val' }, envVarEntries: [
        ...SENSITIVE_ENTRY,
        { key: 'CLAUDE_CODE_MODEL', isSensitive: false, scope: 'claude' as const, isBuiltIn: true, createdAt: 0, updatedAt: 0 },
      ] })
      retrieveSecretMock.mockReturnValue('secret-val')

      const handler = getHandler(ipcMain, 'settings:set-env-var')
      handler(mockEvent, { key: 'CLAUDE_CODE_MODEL', value: 'opus' })

      expect(setCustomEnvVarsMock).toHaveBeenCalled()
      const calls = setCustomEnvVarsMock.mock.calls
      const spawnVars = calls[calls.length - 1][0]
      // Should include both regular and secret vars
      expect(spawnVars).toHaveProperty('GH_TOKEN', 'secret-val')
    })
  })

  // ── settings:list-profiles ────────────────────────────────────────────────

  describe('settings:list-profiles', () => {
    it('returns saved profiles merged with built-in starters', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return [{ id: 'custom-1', name: 'My Profile' }]
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:list-profiles')
      const result = handler() as Array<{ id: string; name: string }>

      // Should contain custom + 3 starter profiles
      expect(result.length).toBe(4)
      expect(result.some((p) => p.id === 'custom-1')).toBe(true)
      expect(result.some((p) => p.id === 'builtin-safe')).toBe(true)
      expect(result.some((p) => p.id === 'builtin-power')).toBe(true)
      expect(result.some((p) => p.id === 'builtin-cicd')).toBe(true)
    })

    it('does not duplicate built-in profiles if already in saved list', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return [{ id: 'builtin-safe', name: 'Safe Mode' }]
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:list-profiles')
      const result = handler() as Array<{ id: string }>

      // 1 saved (builtin-safe) + 2 remaining starters
      expect(result.length).toBe(3)
    })
  })

  // ── settings:save-profile ─────────────────────────────────────────────────

  describe('settings:save-profile', () => {
    it('creates a new profile with current settings', () => {
      const currentSettings = { ...DEFAULT_SETTINGS, verbose: true }
      mockGet.mockImplementation((key: string) => {
        if (key === 'settings') return currentSettings
        if (key === 'profiles') return []
        return undefined
      })
      randomUUIDMock.mockReturnValue('new-profile-uuid')

      const handler = getHandler(ipcMain, 'settings:save-profile')
      const result = handler(mockEvent, { name: 'Test Profile', description: 'desc' }) as { id: string; name: string }

      expect(result.id).toBe('new-profile-uuid')
      expect(result.name).toBe('Test Profile')
      expect(mockSet).toHaveBeenCalledWith('profiles', expect.arrayContaining([
        expect.objectContaining({ id: 'new-profile-uuid', name: 'Test Profile' }),
      ]))
    })

    it('overwrites existing profile when name matches', () => {
      const existingProfile = { id: 'existing-id', name: 'My Profile', description: '', createdAt: 100, settings: DEFAULT_SETTINGS }
      mockGet.mockImplementation((key: string) => {
        if (key === 'settings') return { ...DEFAULT_SETTINGS, verbose: true }
        if (key === 'profiles') return [existingProfile]
        return undefined
      })

      const handler = getHandler(ipcMain, 'settings:save-profile')
      const result = handler(mockEvent, { name: 'My Profile' }) as { id: string }

      // Should keep the existing ID
      expect(result.id).toBe('existing-id')
      // The profiles array should have exactly 1 entry (replaced, not appended)
      const savedProfiles = mockSet.mock.calls.find((c: unknown[]) => c[0] === 'profiles')
      expect(savedProfiles![1]).toHaveLength(1)
    })
  })

  // ── settings:load-profile ─────────────────────────────────────────────────

  describe('settings:load-profile', () => {
    it('loads a saved profile and applies its settings', () => {
      const profile = {
        id: 'p1',
        name: 'Profile 1',
        description: '',
        createdAt: 100,
        settings: { ...DEFAULT_SETTINGS, verbose: true },
      }
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return [profile]
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:load-profile')
      const result = handler(mockEvent, { id: 'p1' }) as { settings: unknown; restoredAgentIds: boolean }

      expect(mockSet).toHaveBeenCalledWith('settings', profile.settings)
      expect(result.settings).toEqual(profile.settings)
      expect(result.restoredAgentIds).toBe(false)
    })

    it('loads a built-in starter profile by ID', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return []
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:load-profile')
      const result = handler(mockEvent, { id: 'builtin-safe' }) as { settings: unknown }

      expect(mockSet).toHaveBeenCalledWith('settings', expect.objectContaining({
        flags: expect.objectContaining({ 'copilot:experimental': false }),
      }))
      expect(result.settings).toBeDefined()
    })

    it('returns error when profile not found', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return []
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:load-profile')
      const result = handler(mockEvent, { id: 'nonexistent' }) as { error: string }

      expect(result.error).toBe('Profile not found')
    })

    it('restores agent enablement state when profile has it', () => {
      const profile = {
        id: 'p-with-agents',
        name: 'With Agents',
        description: '',
        createdAt: 100,
        settings: DEFAULT_SETTINGS,
        enabledAgentIds: ['agent-1', 'agent-2'],
      }
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return [profile]
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:load-profile')
      const result = handler(mockEvent, { id: 'p-with-agents' }) as { restoredAgentIds: boolean }

      expect(result.restoredAgentIds).toBe(true)
    })
  })

  // ── settings:delete-profile ───────────────────────────────────────────────

  describe('settings:delete-profile', () => {
    it('removes a profile by ID', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return [
          { id: 'keep', name: 'Keep' },
          { id: 'remove', name: 'Remove' },
        ]
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:delete-profile')
      const result = handler(mockEvent, { id: 'remove' })

      expect(mockSet).toHaveBeenCalledWith('profiles', [
        expect.objectContaining({ id: 'keep' }),
      ])
      expect(result).toEqual({ success: true })
    })
  })

  // ── settings:export-profile ───────────────────────────────────────────────

  describe('settings:export-profile', () => {
    it('returns error when profile not found', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return []
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:export-profile')
      const result = await handler(mockEvent, { id: 'nonexistent' })

      expect(result).toEqual({ error: 'Profile not found' })
    })

    it('returns canceled when dialog is canceled', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return [{ id: 'p1', name: 'Test', settings: DEFAULT_SETTINGS }]
        return { ...DEFAULT_SETTINGS }
      })
      dialogShowSaveDialogMock.mockResolvedValue({ canceled: true })

      const handler = getHandler(ipcMain, 'settings:export-profile')
      const result = await handler(mockEvent, { id: 'p1' })

      expect(result).toEqual({ canceled: true })
    })

    it('writes profile JSON to selected file path (stripping envVars)', async () => {
      const profile = {
        id: 'p1',
        name: 'Test Profile',
        description: '',
        createdAt: 100,
        settings: { ...DEFAULT_SETTINGS, envVars: { SECRETS: 'leaked' } },
      }
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return [profile]
        return { ...DEFAULT_SETTINGS }
      })
      dialogShowSaveDialogMock.mockResolvedValue({ canceled: false, filePath: '/tmp/export.json' })

      const handler = getHandler(ipcMain, 'settings:export-profile')
      const result = await handler(mockEvent, { id: 'p1' })

      expect(result).toEqual({ path: '/tmp/export.json' })
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        '/tmp/export.json',
        expect.any(String),
        'utf8',
      )
      // Verify envVars are stripped from export
      const written = JSON.parse(writeFileSyncMock.mock.calls[0][1].trim())
      expect(written.settings.envVars).toEqual({})
    })

    it('exports built-in starter profile by ID', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return []
        return { ...DEFAULT_SETTINGS }
      })
      dialogShowSaveDialogMock.mockResolvedValue({ canceled: false, filePath: '/tmp/safe.json' })

      const handler = getHandler(ipcMain, 'settings:export-profile')
      const result = await handler(mockEvent, { id: 'builtin-safe' })

      expect(result).toEqual({ path: '/tmp/safe.json' })
      expect(writeFileSyncMock).toHaveBeenCalled()
    })
  })

  // ── settings:import-profile ───────────────────────────────────────────────

  describe('settings:import-profile', () => {
    it('returns canceled when dialog is canceled', async () => {
      dialogShowOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })

      const handler = getHandler(ipcMain, 'settings:import-profile')
      const result = await handler()

      expect(result).toEqual({ canceled: true })
    })

    it('imports a valid profile file', async () => {
      const importedProfile = {
        id: 'old-id',
        name: 'Imported',
        description: 'From file',
        createdAt: 100,
        settings: DEFAULT_SETTINGS,
      }
      dialogShowOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/import.json'] })
      readFileSyncMock.mockReturnValue(JSON.stringify(importedProfile))
      randomUUIDMock.mockReturnValue('new-import-uuid')
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return []
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:import-profile')
      const result = await handler() as { profile: { id: string; name: string } }

      expect(result.profile).toBeDefined()
      // ID should be regenerated
      expect(result.profile.id).toBe('new-import-uuid')
      expect(result.profile.name).toBe('Imported')
    })

    it('returns error for invalid profile file (missing name)', async () => {
      dialogShowOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/bad.json'] })
      readFileSyncMock.mockReturnValue(JSON.stringify({ settings: DEFAULT_SETTINGS }))
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return []
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:import-profile')
      const result = await handler() as { error: string }

      expect(result.error).toBe('Invalid profile file')
    })

    it('returns error for invalid profile file (missing settings)', async () => {
      dialogShowOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/bad.json'] })
      readFileSyncMock.mockReturnValue(JSON.stringify({ name: 'Hi' }))
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return []
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:import-profile')
      const result = await handler() as { error: string }

      expect(result.error).toBe('Invalid profile file')
    })

    it('returns error for malformed JSON', async () => {
      dialogShowOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/bad.json'] })
      readFileSyncMock.mockReturnValue('NOT_JSON')
      mockGet.mockImplementation((key: string) => {
        if (key === 'profiles') return []
        return { ...DEFAULT_SETTINGS }
      })

      const handler = getHandler(ipcMain, 'settings:import-profile')
      const result = await handler() as { error: string }

      expect(result.error).toContain('SyntaxError')
    })
  })

  // ── settings:list-plugins ─────────────────────────────────────────────────

  describe('settings:list-plugins', () => {
    it('returns empty array when no plugin directory exists', () => {
      existsSyncMock.mockReturnValue(false)

      const handler = getHandler(ipcMain, 'settings:list-plugins')
      const result = handler(mockEvent, { cli: 'copilot' })

      expect(result).toEqual([])
    })

    it('discovers copilot plugins with package.json metadata', () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (path.endsWith('plugins')) return true
        if (path.endsWith('package.json')) return true
        return false
      })
      readdirSyncMock.mockReturnValue(['my-plugin'])
      readFileSyncMock.mockReturnValue(JSON.stringify({ description: 'A plugin', version: '1.0.0' }))

      const handler = getHandler(ipcMain, 'settings:list-plugins')
      const result = handler(mockEvent, { cli: 'copilot' }) as Array<{ name: string; version?: string; description?: string; cli: string }>

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('my-plugin')
      expect(result[0].version).toBe('1.0.0')
      expect(result[0].description).toBe('A plugin')
      expect(result[0].cli).toBe('copilot')
    })

    it('discovers claude plugins without package.json', () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (path.includes('.claude') && path.endsWith('plugins')) return true
        return false
      })
      readdirSyncMock.mockReturnValue(['claude-plug'])

      const handler = getHandler(ipcMain, 'settings:list-plugins')
      const result = handler(mockEvent, { cli: 'claude' }) as Array<{ name: string; cli: string }>

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('claude-plug')
      expect(result[0].cli).toBe('claude')
    })
  })

  // ── settings:open-terminal ────────────────────────────────────────────────

  describe('settings:open-terminal', () => {
    it('returns error for non-existent path', async () => {
      const handler = getHandler(ipcMain, 'settings:open-terminal')
      // The handler dynamically imports 'fs' and 'path', but we've mocked fs globally
      // existsSync returns false by default
      existsSyncMock.mockReturnValue(false)

      const result = await handler(mockEvent, { command: '/nonexistent/path' })

      expect(result).toEqual({ success: false, error: 'Path is not a valid directory' })
    })

    // Note: testing the happy path (spawning terminal) requires mocking dynamic
    // imports of child_process.execFile which is complex. The error path above
    // covers the validation logic.
  })
})
