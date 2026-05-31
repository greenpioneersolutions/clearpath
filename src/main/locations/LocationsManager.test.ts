import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ─────────────────────────────────────────────────────────
// LocationsManager creates its Store on first property access, so we reset
// modules per test and drive fs + pathSecurity through controllable mocks.

const {
  existsSyncMock,
  statSyncMock,
  storeData,
  mockGet,
  mockSet,
  isSensitiveMock,
  assertWithinMock,
  uuidMock,
} = vi.hoisted(() => {
  const storeData: Record<string, unknown> = {}
  return {
    existsSyncMock: vi.fn().mockReturnValue(true),
    statSyncMock: vi.fn().mockReturnValue({ isDirectory: () => true }),
    storeData,
    mockGet: vi.fn((key: string) => storeData[key]),
    mockSet: vi.fn((key: string, val: unknown) => { storeData[key] = val }),
    isSensitiveMock: vi.fn().mockReturnValue(false),
    assertWithinMock: vi.fn((p: string) => p),
    uuidMock: vi.fn().mockReturnValue('uuid-1'),
  }
})

vi.mock('fs', () => ({ existsSync: existsSyncMock, statSync: statSyncMock }))

vi.mock('electron-store', () => ({
  default: class MockStore {
    get = mockGet
    set = mockSet
  },
}))

vi.mock('crypto', () => ({ randomUUID: uuidMock }))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

vi.mock('../utils/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../utils/pathSecurity', () => ({
  isSensitiveSystemPath: isSensitiveMock,
  assertPathWithinRoots: assertWithinMock,
  getWorkspaceAllowedRoots: vi.fn().mockReturnValue(['/home/user']),
}))

let LocationsManager: typeof import('./LocationsManager').LocationsManager

beforeEach(async () => {
  vi.resetModules()
  for (const k of Object.keys(storeData)) delete storeData[k]
  storeData['approvedFolders'] = []
  storeData['defaultWorkingDir'] = null
  storeData['sourceFolders'] = []

  existsSyncMock.mockReset().mockReturnValue(true)
  statSyncMock.mockReset().mockReturnValue({ isDirectory: () => true })
  isSensitiveMock.mockReset().mockReturnValue(false)
  assertWithinMock.mockReset().mockImplementation((p: string) => p)
  uuidMock.mockReset().mockReturnValue('uuid-1')

  ;({ LocationsManager } = await import('./LocationsManager'))
})

// ── Approved folders ───────────────────────────────────────────────────────--

describe('LocationsManager approved folders', () => {
  it('adds a valid folder with a basename-derived label', () => {
    const lm = new LocationsManager()
    const res = lm.addApproved('/home/user/dev/repos')
    expect('entry' in res && res.entry).toMatchObject({
      id: 'uuid-1', label: 'repos', path: '/home/user/dev/repos',
    })
    expect(lm.listApproved()).toHaveLength(1)
  })

  it('rejects a non-existent folder', () => {
    existsSyncMock.mockReturnValue(false)
    const lm = new LocationsManager()
    expect(lm.addApproved('/home/user/nope')).toEqual({ error: 'Folder does not exist' })
    expect(lm.listApproved()).toHaveLength(0)
  })

  it('rejects a file (not a directory)', () => {
    statSyncMock.mockReturnValue({ isDirectory: () => false })
    const lm = new LocationsManager()
    expect(lm.addApproved('/home/user/file.txt')).toEqual({ error: 'Path must be a folder' })
  })

  it('rejects a sensitive system path', () => {
    isSensitiveMock.mockReturnValue(true)
    const lm = new LocationsManager()
    const res = lm.addApproved('/home/user/.ssh')
    expect('error' in res).toBe(true)
  })

  it('rejects a path outside the allowed roots', () => {
    assertWithinMock.mockImplementation(() => { throw new Error('escape') })
    const lm = new LocationsManager()
    expect(lm.addApproved('/etc/passwd-dir')).toEqual({
      error: 'Folder must be inside your home directory',
    })
  })

  it('dedupes by path — re-adding returns the existing entry', () => {
    const lm = new LocationsManager()
    lm.addApproved('/home/user/dev')
    uuidMock.mockReturnValue('uuid-2')
    const second = lm.addApproved('/home/user/dev')
    expect('entry' in second && second.entry.id).toBe('uuid-1')
    expect(lm.listApproved()).toHaveLength(1)
  })

  it('removes an approved folder by id', () => {
    const lm = new LocationsManager()
    lm.addApproved('/home/user/dev')
    lm.removeApproved('uuid-1')
    expect(lm.listApproved()).toHaveLength(0)
  })
})

// ── Default working directory ────────────────────────────────────────────────

describe('LocationsManager default working directory', () => {
  it('sets and reads back an existing default dir', () => {
    const lm = new LocationsManager()
    expect(lm.setDefaultWorkingDir('/home/user/dev')).toEqual({ ok: true })
    expect(lm.getDefaultWorkingDir()).toBe('/home/user/dev')
  })

  it('returns null when the stored default no longer exists', () => {
    const lm = new LocationsManager()
    lm.setDefaultWorkingDir('/home/user/dev')
    existsSyncMock.mockReturnValue(false)
    expect(lm.getDefaultWorkingDir()).toBeNull()
  })

  it('clears the default when set to null', () => {
    const lm = new LocationsManager()
    lm.setDefaultWorkingDir('/home/user/dev')
    expect(lm.setDefaultWorkingDir(null)).toEqual({ ok: true })
    expect(lm.getDefaultWorkingDir()).toBeNull()
  })
})

// ── Source folders ────────────────────────────────────────────────────────--

describe('LocationsManager source folders', () => {
  it('adds, lists, and removes source folders', () => {
    const lm = new LocationsManager()
    lm.addSource('/home/user/pack')
    expect(lm.listSources()).toEqual(['/home/user/pack'])
    lm.removeSource('/home/user/pack')
    expect(lm.listSources()).toEqual([])
  })

  it('getExistingSourceFolders filters out folders that no longer exist', () => {
    const lm = new LocationsManager()
    lm.addSource('/home/user/pack-a')
    lm.addSource('/home/user/pack-b')
    existsSyncMock.mockImplementation((p: string) => p === '/home/user/pack-a')
    expect(lm.getExistingSourceFolders()).toEqual(['/home/user/pack-a'])
  })
})

// ── Health ────────────────────────────────────────────────────────────────--

describe('LocationsManager health', () => {
  it('reports existence flags for working dir, approved, and source folders', () => {
    const lm = new LocationsManager()
    lm.setDefaultWorkingDir('/home/user/dev')
    lm.addApproved('/home/user/repos')
    lm.addSource('/home/user/pack')

    // Only the working dir and approved folder still exist on disk.
    existsSyncMock.mockImplementation((p: string) => p !== '/home/user/pack')

    const h = lm.health()
    expect(h.defaultWorkingDir).toEqual({ path: '/home/user/dev', exists: true })
    expect(h.approvedFolders[0]).toMatchObject({ path: '/home/user/repos', exists: true })
    expect(h.sourceFolders).toEqual([{ path: '/home/user/pack', exists: false }])
  })
})
