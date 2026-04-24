import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ─────────────────────────────────────────────────────────
//
// Module-level singleton mocking pattern: vi.resetModules + dynamic import is
// required because PluginManager creates a Store on first property access. We
// need each test to start with a clean store state.

const {
  existsSyncMock,
  readFileSyncMock,
  readdirSyncMock,
  statSyncMock,
  homedirMock,
  storeData,
  mockGet,
  mockSet,
} = vi.hoisted(() => {
  const storeData: Record<string, unknown> = {}
  const mockGet = vi.fn((key: string) => storeData[key])
  const mockSet = vi.fn((key: string, val: unknown) => {
    storeData[key] = val
  })
  return {
    existsSyncMock: vi.fn().mockReturnValue(false),
    readFileSyncMock: vi.fn(),
    readdirSyncMock: vi.fn().mockReturnValue([]),
    statSyncMock: vi.fn(),
    homedirMock: vi.fn().mockReturnValue('/mock/home'),
    storeData,
    mockGet,
    mockSet,
  }
})

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  readdirSync: readdirSyncMock,
  statSync: statSyncMock,
}))

vi.mock('os', () => ({ homedir: homedirMock }))

vi.mock('electron-store', () => ({
  default: class MockStore {
    get = mockGet
    set = mockSet
  },
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

vi.mock('../utils/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

let PluginManager: typeof import('./PluginManager').PluginManager

// ── Helpers ──────────────────────────────────────────────────────────────────

function manifestJson(meta: { name?: string; version?: string; description?: string }): string {
  return JSON.stringify(meta)
}

beforeEach(async () => {
  vi.resetModules()
  for (const k of Object.keys(storeData)) delete storeData[k]
  storeData['enabled'] = { copilot: [], claude: [] }
  storeData['customPaths'] = []
  storeData['overrides'] = {}

  existsSyncMock.mockReset().mockReturnValue(false)
  readFileSyncMock.mockReset()
  readdirSyncMock.mockReset().mockReturnValue([])
  statSyncMock.mockReset().mockReturnValue({ isDirectory: () => true })
  delete process.env['COPILOT_HOME']
  delete process.env['CLAUDE_CODE_PLUGIN_CACHE_DIR']

  ;({ PluginManager } = await import('./PluginManager'))
})

// ── Discovery ────────────────────────────────────────────────────────────────

describe('PluginManager.listPlugins discovery', () => {
  it('returns empty list when no install dirs exist', () => {
    existsSyncMock.mockReturnValue(false)
    const pm = new PluginManager()
    expect(pm.listPlugins()).toEqual([])
  })

  it('discovers a Claude plugin when manifest exists at .claude-plugin/plugin.json', () => {
    // Layout: ~/.claude/plugins/test-plugin/.claude-plugin/plugin.json
    const claudeRoot = '/mock/home/.claude/plugins'
    const pluginDir = `${claudeRoot}/test-plugin`
    const manifestPath = `${pluginDir}/.claude-plugin/plugin.json`

    existsSyncMock.mockImplementation((p: string) => {
      return p === claudeRoot || p === manifestPath
    })
    readdirSyncMock.mockImplementation((p: string) => {
      if (p === claudeRoot) return ['test-plugin']
      return []
    })
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readFileSyncMock.mockImplementation((p: string) => {
      if (p === manifestPath) return manifestJson({ name: 'test', version: '0.1.0', description: 'smoke' })
      throw new Error('not found')
    })

    const pm = new PluginManager()
    const list = pm.listPlugins()
    const claude = list.filter((p) => p.cli === 'claude')
    expect(claude).toHaveLength(1)
    expect(claude[0].name).toBe('test')
    expect(claude[0].version).toBe('0.1.0')
    expect(claude[0].source).toBe('discovered')
    expect(claude[0].path).toBe(pluginDir)
  })

  it('discovers a Copilot plugin (flat plugin.json at install root subdir)', () => {
    const copilotRoot = '/mock/home/.copilot/installed-plugins'
    const pluginDir = `${copilotRoot}/_direct/owner-repo`
    const manifestPath = `${pluginDir}/plugin.json`

    existsSyncMock.mockImplementation((p: string) => {
      return p === copilotRoot || p === `${copilotRoot}/_direct` || p === manifestPath
    })
    readdirSyncMock.mockImplementation((p: string) => {
      if (p === copilotRoot) return ['_direct']
      if (p === `${copilotRoot}/_direct`) return ['owner-repo']
      return []
    })
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readFileSyncMock.mockImplementation((p: string) => {
      if (p === manifestPath) return manifestJson({ name: 'cop-pl', version: '1.0.0' })
      throw new Error('not found')
    })

    const pm = new PluginManager()
    const list = pm.listPlugins()
    const cop = list.filter((p) => p.cli === 'copilot')
    expect(cop).toHaveLength(1)
    expect(cop[0].name).toBe('cop-pl')
    expect(cop[0].path).toBe(pluginDir)
  })

  it('honors COPILOT_HOME env override', () => {
    process.env['COPILOT_HOME'] = '/custom/copilot-home'
    const copilotRoot = '/custom/copilot-home/installed-plugins'
    const pluginDir = `${copilotRoot}/myplugin`
    const manifestPath = `${pluginDir}/plugin.json`

    existsSyncMock.mockImplementation((p: string) => p === copilotRoot || p === manifestPath)
    readdirSyncMock.mockImplementation((p: string) => (p === copilotRoot ? ['myplugin'] : []))
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readFileSyncMock.mockImplementation((p: string) =>
      p === manifestPath ? manifestJson({ name: 'envtest' }) : '',
    )

    const pm = new PluginManager()
    const list = pm.listPlugins()
    expect(list.some((p) => p.path === pluginDir && p.name === 'envtest')).toBe(true)
  })

  it('honors CLAUDE_CODE_PLUGIN_CACHE_DIR env override', () => {
    process.env['CLAUDE_CODE_PLUGIN_CACHE_DIR'] = '/cache/claude-plugins'
    const root = '/cache/claude-plugins'
    const pluginDir = `${root}/p1`
    const manifestPath = `${pluginDir}/.claude-plugin/plugin.json`

    existsSyncMock.mockImplementation((p: string) => p === root || p === manifestPath)
    readdirSyncMock.mockImplementation((p: string) => (p === root ? ['p1'] : []))
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readFileSyncMock.mockImplementation((p: string) =>
      p === manifestPath ? manifestJson({ name: 'cache' }) : '',
    )

    const pm = new PluginManager()
    const list = pm.listPlugins()
    expect(list.find((p) => p.cli === 'claude' && p.name === 'cache')).toBeDefined()
  })

  it('skips plugin dirs whose manifest is malformed JSON', () => {
    const claudeRoot = '/mock/home/.claude/plugins'
    const goodDir = `${claudeRoot}/good`
    const badDir = `${claudeRoot}/bad`
    const goodManifest = `${goodDir}/.claude-plugin/plugin.json`
    const badManifest = `${badDir}/.claude-plugin/plugin.json`

    existsSyncMock.mockImplementation((p: string) =>
      [claudeRoot, goodManifest, badManifest].includes(p),
    )
    readdirSyncMock.mockImplementation((p: string) => (p === claudeRoot ? ['good', 'bad'] : []))
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readFileSyncMock.mockImplementation((p: string) => {
      if (p === goodManifest) return manifestJson({ name: 'good' })
      if (p === badManifest) return '{ this is : not valid json'
      return ''
    })

    const pm = new PluginManager()
    const list = pm.listPlugins()
    const names = list.map((p) => p.name)
    expect(names).toContain('good')
    expect(names).not.toContain('bad')
  })
})

// ── Enable / disable ─────────────────────────────────────────────────────────

describe('PluginManager enable state', () => {
  it('reflects enabled flag in listPlugins output', () => {
    const claudeRoot = '/mock/home/.claude/plugins'
    const pluginDir = `${claudeRoot}/p1`
    const manifestPath = `${pluginDir}/.claude-plugin/plugin.json`

    existsSyncMock.mockImplementation((p: string) => [claudeRoot, manifestPath, pluginDir].includes(p))
    readdirSyncMock.mockImplementation((p: string) => (p === claudeRoot ? ['p1'] : []))
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readFileSyncMock.mockReturnValue(manifestJson({ name: 'p1' }))

    const pm = new PluginManager()
    expect(pm.listPlugins()[0].enabled).toBe(false)

    pm.setEnabled('claude', [pluginDir])
    expect(pm.listPlugins()[0].enabled).toBe(true)
  })

  it('getEnabledPaths returns only existing plugin paths for the requested CLI', () => {
    storeData['enabled'] = {
      copilot: ['/exists/copilot-a', '/missing/copilot-b'],
      claude: ['/exists/claude-a'],
    }
    existsSyncMock.mockImplementation((p: string) => p === '/exists/copilot-a' || p === '/exists/claude-a')

    const pm = new PluginManager()
    expect(pm.getEnabledPaths('copilot')).toEqual(['/exists/copilot-a'])
    expect(pm.getEnabledPaths('claude')).toEqual(['/exists/claude-a'])
  })

  it('setEnabled deduplicates entries', () => {
    const pm = new PluginManager()
    pm.setEnabled('copilot', ['/a', '/a', '/b'])
    expect(storeData['enabled']).toEqual({ copilot: ['/a', '/b'], claude: [] })
  })
})

// ── Custom paths ─────────────────────────────────────────────────────────────

describe('PluginManager custom paths', () => {
  it('rejects a path that has neither manifest format', () => {
    existsSyncMock.mockImplementation((p: string) => p === '/some/dir')
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const pm = new PluginManager()
    const result = pm.addCustomPath({ path: '/some/dir', cli: 'auto' })
    expect('error' in result).toBe(true)
  })

  it('classifies a Copilot custom path with auto detection', () => {
    const dir = '/custom/cop'
    const manifestPath = `${dir}/plugin.json`
    existsSyncMock.mockImplementation((p: string) => p === dir || p === manifestPath)
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readFileSyncMock.mockImplementation((p: string) =>
      p === manifestPath ? manifestJson({ name: 'mycop' }) : (() => { throw new Error('nope') })(),
    )

    const pm = new PluginManager()
    const result = pm.addCustomPath({ path: dir, cli: 'auto' })
    expect('entry' in result).toBe(true)
    if ('entry' in result) {
      expect(result.entry.cli).toBe('copilot')
      expect(result.entry.source).toBe('custom')
    }
  })

  it('prefers Copilot when both manifest shapes are present and auto is requested', () => {
    const dir = '/custom/both'
    const cMan = `${dir}/plugin.json`
    const claMan = `${dir}/.claude-plugin/plugin.json`
    existsSyncMock.mockImplementation((p: string) => [dir, cMan, claMan].includes(p))
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readFileSyncMock.mockImplementation((p: string) => {
      if (p === cMan) return manifestJson({ name: 'C' })
      if (p === claMan) return manifestJson({ name: 'CL' })
      return ''
    })

    const pm = new PluginManager()
    const result = pm.addCustomPath({ path: dir, cli: 'auto' })
    expect('entry' in result).toBe(true)
    if ('entry' in result) {
      expect(result.entry.cli).toBe('copilot')
      expect(result.entry.name).toBe('C')
    }
  })

  it('removeCustomPath also drops the entry from enabled lists', () => {
    storeData['customPaths'] = [{ path: '/custom/p', cli: 'claude' }]
    storeData['enabled'] = { copilot: [], claude: ['/custom/p'] }

    const pm = new PluginManager()
    pm.removeCustomPath('/custom/p')

    expect(storeData['customPaths']).toEqual([])
    expect(storeData['enabled']).toEqual({ copilot: [], claude: [] })
  })
})
