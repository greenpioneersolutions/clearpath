import { describe, it, expect, vi } from 'vitest'
import { runPipeline, type Middleware, type MiddlewareContext } from './pipeline'

vi.mock('../../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

function baseCtx(overrides: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    sessionId: 'sess-1',
    cli: 'copilot-cli',
    model: 'gpt-5-mini',
    prompt: 'hello',
    slices: { userText: 'hello' },
    meta: { turnIndex: 0, isFirstTurn: true },
    notes: [],
    ...overrides,
  }
}

describe('runPipeline', () => {
  it('returns ctx unchanged when no middlewares are provided', async () => {
    const ctx = baseCtx()
    const result = await runPipeline(ctx, [])
    expect(result).toBe(ctx)
  })

  it('threads each middleware\'s output into the next', async () => {
    const a: Middleware = (c) => ({ ...c, prompt: c.prompt + '-A' })
    const b: Middleware = (c) => ({ ...c, prompt: c.prompt + '-B' })
    const c: Middleware = (c2) => ({ ...c2, prompt: c2.prompt + '-C' })
    const result = await runPipeline(baseCtx({ prompt: 'X' }), [a, b, c])
    expect(result.prompt).toBe('X-A-B-C')
  })

  it('supports sync and async middlewares interleaved', async () => {
    const syncMw: Middleware = (c) => ({ ...c, prompt: c.prompt + '-sync' })
    const asyncMw: Middleware = async (c) => {
      await Promise.resolve()
      return { ...c, prompt: c.prompt + '-async' }
    }
    const result = await runPipeline(baseCtx({ prompt: 'X' }), [syncMw, asyncMw, syncMw])
    expect(result.prompt).toBe('X-sync-async-sync')
  })

  it('returns last good ctx when a middleware throws', async () => {
    const good: Middleware = (c) => ({ ...c, prompt: c.prompt + '-OK' })
    const bad: Middleware = () => { throw new Error('boom') }
    const after: Middleware = (c) => ({ ...c, prompt: c.prompt + '-after' })

    const result = await runPipeline(baseCtx({ prompt: 'X' }), [good, bad, after])
    // bad aborts the pipeline — `after` should never run.
    expect(result.prompt).toBe('X-OK')
  })

  it('returns initial ctx when the first middleware throws', async () => {
    const bad: Middleware = () => { throw new Error('immediate') }
    const ctx = baseCtx({ prompt: 'X' })
    const result = await runPipeline(ctx, [bad])
    expect(result).toBe(ctx)
  })

  it('propagates ctx fields untouched when middleware only changes prompt', async () => {
    const mw: Middleware = (c) => ({ ...c, prompt: 'new' })
    const ctx = baseCtx({ sessionId: 'X', cli: 'claude-cli', model: 'sonnet', notes: ['n1'] })
    const result = await runPipeline(ctx, [mw])
    expect(result.sessionId).toBe('X')
    expect(result.cli).toBe('claude-cli')
    expect(result.model).toBe('sonnet')
    expect(result.notes).toEqual(['n1'])
    expect(result.prompt).toBe('new')
  })
})
