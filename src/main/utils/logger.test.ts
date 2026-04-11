import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Logger uses module-level constants computed at load time from process.env.
// We test the default behaviour (no env overrides) and level-filtered behaviour
// by re-importing the module inside vi.isolateModules scopes.

describe('logger (default level = warn)', () => {
  // The test environment has no ELECTRON_RENDERER_URL and no CLEARPATH_LOG_LEVEL,
  // so the module defaults to 'warn'.
  //
  // Spies must be set up BEFORE the dynamic import so they are active when
  // the module-level constants are evaluated; vi.resetModules() ensures a
  // fresh load each test (vitest's restoreMocks:true tears down spies between
  // tests, so we cannot rely on describe-scope spy initialisation surviving).

  let log: typeof import('./logger').log
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    error: ReturnType<typeof vi.spyOn>
  }

  beforeEach(async () => {
    vi.resetModules()
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
    const mod = await import('./logger')
    log = mod.log
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes a log.level property', () => {
    expect(typeof log.level).toBe('string')
    expect(['debug', 'info', 'warn', 'error', 'none']).toContain(log.level)
  })

  it('log.error() calls console.error', () => {
    log.error('something broke')
    expect(consoleSpy.error).toHaveBeenCalledWith('something broke')
  })

  it('log.warn() calls console.warn', () => {
    log.warn('watch out')
    expect(consoleSpy.warn).toHaveBeenCalledWith('watch out')
  })

  it('log.error() passes through multiple arguments', () => {
    log.error('msg %s', 42, { extra: true })
    expect(consoleSpy.error).toHaveBeenCalledWith('msg %s', 42, { extra: true })
  })

  it('log.warn() passes through multiple arguments', () => {
    log.warn('warn msg', 'detail')
    expect(consoleSpy.warn).toHaveBeenCalledWith('warn msg', 'detail')
  })
})

describe('logger level filtering via CLEARPATH_LOG_LEVEL', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('level=debug: debug/info/warn/error all call console methods', async () => {
    vi.stubEnv('CLEARPATH_LOG_LEVEL', 'debug')
    vi.stubEnv('ELECTRON_RENDERER_URL', '')
    vi.resetModules()

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { log } = await import('./logger')
    expect(log.level).toBe('debug')

    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')

    expect(logSpy).toHaveBeenCalledTimes(2) // debug + info both call console.log
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('level=info: info/warn/error log; debug is suppressed', async () => {
    vi.stubEnv('CLEARPATH_LOG_LEVEL', 'info')
    vi.stubEnv('ELECTRON_RENDERER_URL', '')
    vi.resetModules()

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { log } = await import('./logger')
    expect(log.level).toBe('info')

    log.debug('suppressed')
    expect(logSpy).not.toHaveBeenCalled()

    log.info('shown')
    expect(logSpy).toHaveBeenCalledWith('shown')

    log.warn('also shown')
    expect(warnSpy).toHaveBeenCalledWith('also shown')

    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('level=error: only error logs; debug/info/warn suppressed', async () => {
    vi.stubEnv('CLEARPATH_LOG_LEVEL', 'error')
    vi.stubEnv('ELECTRON_RENDERER_URL', '')
    vi.resetModules()

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { log } = await import('./logger')
    expect(log.level).toBe('error')

    log.debug('no')
    log.info('no')
    log.warn('no')
    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()

    log.error('yes')
    expect(errorSpy).toHaveBeenCalledWith('yes')

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('level=none: all logging suppressed', async () => {
    vi.stubEnv('CLEARPATH_LOG_LEVEL', 'none')
    vi.stubEnv('ELECTRON_RENDERER_URL', '')
    vi.resetModules()

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { log } = await import('./logger')
    expect(log.level).toBe('none')

    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')

    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('dev mode (ELECTRON_RENDERER_URL set) defaults to debug when no override', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:3000')
    vi.stubEnv('CLEARPATH_LOG_LEVEL', '')
    vi.resetModules()

    const { log } = await import('./logger')
    expect(log.level).toBe('debug')
  })
})
