import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'

// ── Mock rateLimiter ────────────────────────────────────────────────────────

import * as rateLimiter from '../utils/rateLimiter'

const mockCheckRateLimit = vi.spyOn(rateLimiter, 'checkRateLimit')

// ── Import and register ─────────────────────────────────────────────────────

import { registerSchedulerHandlers } from './schedulerHandlers'

// ── Mock SchedulerService ───────────────────────────────────────────────────

function createMockScheduler() {
  return {
    listJobs: vi.fn().mockReturnValue([]),
    getJob: vi.fn().mockReturnValue(null),
    saveJob: vi.fn().mockReturnValue({ id: 'job-1', name: 'Test' }),
    deleteJob: vi.fn(),
    toggleJob: vi.fn(),
    executeJob: vi.fn().mockResolvedValue({ success: true }),
    duplicateJob: vi.fn().mockReturnValue({ id: 'job-dup', name: 'Test (copy)' }),
    getTemplates: vi.fn().mockReturnValue([]),
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

function extractHandlers(): HandlerMap {
  const handlers: HandlerMap = {}
  for (const call of (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown
  }
  return handlers
}

const mockEvent = {} as Electron.IpcMainInvokeEvent

// ── Tests ───────────────────────────────────────────────────────────────────

describe('schedulerHandlers', () => {
  let scheduler: ReturnType<typeof createMockScheduler>
  let handlers: HandlerMap

  beforeEach(() => {
    vi.clearAllMocks()
    ;(ipcMain.handle as ReturnType<typeof vi.fn>).mockClear()
    // Restore default mock implementation after clearAllMocks wipes it
    mockCheckRateLimit.mockImplementation(() => ({ allowed: true }))

    scheduler = createMockScheduler()
    registerSchedulerHandlers(ipcMain as unknown as Electron.IpcMain, scheduler as any)
    handlers = extractHandlers()
  })

  it('registers all expected channels', () => {
    const channels = Object.keys(handlers)
    expect(channels).toContain('scheduler:list')
    expect(channels).toContain('scheduler:get')
    expect(channels).toContain('scheduler:save')
    expect(channels).toContain('scheduler:delete')
    expect(channels).toContain('scheduler:toggle')
    expect(channels).toContain('scheduler:run-now')
    expect(channels).toContain('scheduler:duplicate')
    expect(channels).toContain('scheduler:templates')
  })

  // ── scheduler:list ──────────────────────────────────────────────────────

  describe('scheduler:list', () => {
    it('returns jobs from scheduler service', () => {
      const jobs = [{ id: 'j1', name: 'Nightly' }]
      scheduler.listJobs.mockReturnValue(jobs)
      const result = handlers['scheduler:list'](mockEvent)
      expect(result).toEqual(jobs)
      expect(scheduler.listJobs).toHaveBeenCalled()
    })
  })

  // ── scheduler:get ───────────────────────────────────────────────────────

  describe('scheduler:get', () => {
    it('returns specific job by id', () => {
      const job = { id: 'j1', name: 'Nightly' }
      scheduler.getJob.mockReturnValue(job)
      const result = handlers['scheduler:get'](mockEvent, { id: 'j1' })
      expect(scheduler.getJob).toHaveBeenCalledWith('j1')
      expect(result).toEqual(job)
    })

    it('returns null for non-existent job', () => {
      scheduler.getJob.mockReturnValue(null)
      const result = handlers['scheduler:get'](mockEvent, { id: 'nonexistent' })
      expect(result).toBeNull()
    })
  })

  // ── scheduler:save ──────────────────────────────────────────────────────

  describe('scheduler:save', () => {
    it('saves a new job (no id)', () => {
      const args = { name: 'Daily Build', description: 'Build daily', prompt: 'build', cronExpression: '0 0 * * *', cli: 'copilot', flags: {}, enabled: true }
      handlers['scheduler:save'](mockEvent, args)
      expect(scheduler.saveJob).toHaveBeenCalledWith(args)
    })

    it('saves an existing job (with id)', () => {
      const args = { id: 'j1', name: 'Updated', description: '', prompt: 'test', cronExpression: '0 0 * * *', cli: 'claude', flags: {}, enabled: false }
      handlers['scheduler:save'](mockEvent, args)
      expect(scheduler.saveJob).toHaveBeenCalledWith(args)
    })

    it('returns the saved job', () => {
      const saved = { id: 'j-new', name: 'New Job' }
      scheduler.saveJob.mockReturnValue(saved)
      const result = handlers['scheduler:save'](mockEvent, { name: 'New Job', description: '', prompt: 'test', cronExpression: '0 0 * * *', cli: 'copilot', flags: {}, enabled: true })
      expect(result).toEqual(saved)
    })
  })

  // ── scheduler:delete ────────────────────────────────────────────────────

  describe('scheduler:delete', () => {
    it('deletes job and returns success', () => {
      const result = handlers['scheduler:delete'](mockEvent, { id: 'j1' })
      expect(scheduler.deleteJob).toHaveBeenCalledWith('j1')
      expect(result).toEqual({ success: true })
    })
  })

  // ── scheduler:toggle ────────────────────────────────────────────────────

  describe('scheduler:toggle', () => {
    it('enables a job', () => {
      const result = handlers['scheduler:toggle'](mockEvent, { id: 'j1', enabled: true })
      expect(scheduler.toggleJob).toHaveBeenCalledWith('j1', true)
      expect(result).toEqual({ success: true })
    })

    it('disables a job', () => {
      const result = handlers['scheduler:toggle'](mockEvent, { id: 'j1', enabled: false })
      expect(scheduler.toggleJob).toHaveBeenCalledWith('j1', false)
      expect(result).toEqual({ success: true })
    })
  })

  // ── scheduler:run-now ───────────────────────────────────────────────────

  describe('scheduler:run-now', () => {
    it('executes job when rate limit allows', () => {
      handlers['scheduler:run-now'](mockEvent, { id: 'j1' })
      expect(mockCheckRateLimit).toHaveBeenCalledWith('scheduler:run-now')
      expect(scheduler.executeJob).toHaveBeenCalledWith('j1')
    })

    it('returns rate limit error when throttled', () => {
      mockCheckRateLimit.mockReturnValueOnce({ allowed: false, retryAfterMs: 10000 })
      const result = handlers['scheduler:run-now'](mockEvent, { id: 'j1' }) as any
      expect(result.error).toContain('Rate limited')
      expect(result.error).toContain('10s')
      expect(scheduler.executeJob).not.toHaveBeenCalled()
    })

    it('handles undefined retryAfterMs in rate limit', () => {
      mockCheckRateLimit.mockReturnValueOnce({ allowed: false })
      const result = handlers['scheduler:run-now'](mockEvent, { id: 'j1' }) as any
      expect(result.error).toContain('Rate limited')
      expect(result.error).toContain('0s')
    })
  })

  // ── scheduler:duplicate ─────────────────────────────────────────────────

  describe('scheduler:duplicate', () => {
    it('duplicates a job', () => {
      const dup = { id: 'j-dup', name: 'Nightly (copy)' }
      scheduler.duplicateJob.mockReturnValue(dup)
      const result = handlers['scheduler:duplicate'](mockEvent, { id: 'j1' })
      expect(scheduler.duplicateJob).toHaveBeenCalledWith('j1')
      expect(result).toEqual(dup)
    })
  })

  // ── scheduler:templates ─────────────────────────────────────────────────

  describe('scheduler:templates', () => {
    it('returns templates from scheduler service', () => {
      const templates = [{ name: 'Nightly Test Runner' }]
      scheduler.getTemplates.mockReturnValue(templates)
      const result = handlers['scheduler:templates'](mockEvent)
      expect(result).toEqual(templates)
      expect(scheduler.getTemplates).toHaveBeenCalled()
    })
  })
})
