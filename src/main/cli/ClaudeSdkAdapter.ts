/**
 * Claude SDK adapter. Wraps `@anthropic-ai/claude-agent-sdk`'s async-generator
 * `query()` API into the `ICLIAdapter` shape that CLIManager consumes.
 *
 * Why this exists: enterprises that don't want to install the `claude` CLI
 * binary can still drive Claude sessions from CoPilot Commander through their
 * `ANTHROPIC_API_KEY`. The SDK returns rich structured events; we forward them
 * onto a PassThrough stdout as stream-JSON frames so the existing
 * `ClaudeCodeAdapter.parseOutput` pipeline handles them unchanged.
 *
 * Runtime dependency: `@anthropic-ai/claude-agent-sdk`. The import is done
 * lazily so that the module doesn't break if a user uninstalls the SDK (the
 * `isInstalled()` / `isAuthenticated()` checks catch that case).
 *
 * Latest Claude model family is 4.X (Opus 4.7 / Sonnet 4.6 / Haiku 4.5). We
 * default SDK sessions to Sonnet 4.6 unless session options override.
 */

import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { log } from '../utils/logger'
import type { SessionOptions, ParsedOutput } from './types'
import type { ICLIAdapter, SessionHandle } from './types'
import { ClaudeCodeAdapter } from './ClaudeCodeAdapter'
import {
  canResolveClaudeSdk,
  getAnthropicApiKey,
  probeAnthropicKey,
} from '../auth/SdkAuthProbe'

const DEFAULT_SDK_MODEL = 'claude-sonnet-4-6'

export class ClaudeSdkAdapter implements ICLIAdapter {
  readonly cliName = 'claude-sdk'
  // The SDK has no binary path, but the interface requires this field.
  binaryPath = '@anthropic-ai/claude-agent-sdk'

  /**
   * Delegate stream-JSON parsing to the existing CLI adapter so the two code
   * paths produce identical `ParsedOutput` shapes.
   */
  private readonly parser = new ClaudeCodeAdapter()

  async isInstalled(): Promise<boolean> {
    return canResolveClaudeSdk() && !!getAnthropicApiKey()
  }

  async isAuthenticated(): Promise<boolean> {
    if (!(await this.isInstalled())) return false
    return probeAnthropicKey()
  }

  buildArgs(_options: SessionOptions): string[] {
    // Not applicable — options are translated directly into SDK call args in
    // `startSession`. Return an empty array so the CLIManager logs don't blow up
    // when it prints adapter.buildArgs for debug.
    return []
  }

  parseOutput(line: string): ParsedOutput {
    // Reuse the CLI adapter's stream-JSON parser. The SDK emits the same event
    // shapes (content_block_start, content_block_delta, message_stop, ...).
    return this.parser.parseOutput(line)
  }

  startSession(options: SessionOptions): SessionHandle {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    // SDK accepts a plain string prompt OR an AsyncIterable of user messages.
    // We start with string mode (single-turn / concat) because the existing
    // turn loop in CLIManager spawns a fresh session handle per turn anyway.
    const stdin = new PassThrough()
    const emitter = new EventEmitter()
    const abortController = new AbortController()

    const handle: SessionHandle = {
      pid: -1,
      stdout,
      stderr,
      stdin,
      kill: () => {
        abortController.abort()
        emitter.emit('exit', 130, 'SIGINT')
        return true
      },
      on: ((event: string, listener: (...args: unknown[]) => void) => {
        emitter.on(event, listener)
        return handle
      }) as SessionHandle['on'],
    }

    const writeFrame = (obj: unknown) => {
      try {
        stdout.write(Buffer.from(JSON.stringify(obj) + '\n'))
      } catch (err) {
        log.warn('[ClaudeSdkAdapter] failed to serialize frame', err)
      }
    }

    const writeError = (msg: string) => {
      stderr.write(Buffer.from(msg + '\n'))
    }

    void this.runQuery(options, abortController, writeFrame, writeError)
      .then((exitCode) => {
        stdout.end()
        stderr.end()
        emitter.emit('exit', exitCode, null)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        writeError(`Claude SDK error: ${msg}`)
        stdout.end()
        stderr.end()
        emitter.emit('exit', 1, null)
      })

    return handle
  }

  /**
   * Drive a single turn through the SDK `query()` generator. Each yielded
   * message gets serialized as a stream-JSON frame so the CLI parser can
   * consume it unchanged.
   */
  private async runQuery(
    options: SessionOptions,
    abortController: AbortController,
    writeFrame: (obj: unknown) => void,
    writeError: (msg: string) => void,
  ): Promise<number> {
    // Lazy import — avoids crashing the entire main process if the SDK is
    // missing on disk. `isInstalled()` gates this at call time.
    let queryFn: typeof import('@anthropic-ai/claude-agent-sdk').query
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = await import('@anthropic-ai/claude-agent-sdk')
      queryFn = mod.query
    } catch (err) {
      writeError('Claude Agent SDK is not installed. Run: npm install @anthropic-ai/claude-agent-sdk')
      return 1
    }

    if (!options.prompt?.trim()) {
      writeError('Claude SDK session requires a prompt on each turn.')
      return 1
    }

    const iterable = queryFn({
      prompt: options.prompt,
      options: this.translateOptions(options, abortController),
    })

    try {
      for await (const event of iterable) {
        writeFrame(event)
      }
    } catch (err) {
      if (abortController.signal.aborted) return 130
      const msg = err instanceof Error ? err.message : String(err)
      writeError(`SDK query failed: ${msg}`)
      return 1
    }
    return 0
  }

  /**
   * Translate CoPilot Commander's `SessionOptions` into the SDK's `Options`.
   * Only fields that the SDK supports are forwarded; CLI-only flags are
   * ignored silently (they'd be no-ops anyway).
   */
  private translateOptions(
    options: SessionOptions,
    abortController: AbortController,
  ): import('@anthropic-ai/claude-agent-sdk').Options {
    const opts: import('@anthropic-ai/claude-agent-sdk').Options = {
      abortController,
      model: options.model ?? DEFAULT_SDK_MODEL,
    }

    if (options.workingDirectory) opts.cwd = options.workingDirectory
    if (options.additionalDirs?.length) opts.additionalDirectories = options.additionalDirs
    if (options.agent) opts.agent = options.agent
    if (options.agents) opts.agents = options.agents as typeof opts.agents
    if (options.permissionMode) opts.permissionMode = options.permissionMode as typeof opts.permissionMode
    if (options.allowedTools?.length) opts.allowedTools = options.allowedTools
    if (options.disallowedTools?.length) opts.disallowedTools = options.disallowedTools
    if (options.systemPrompt) opts.systemPrompt = options.systemPrompt
    if (options.appendSystemPrompt) {
      // SDK doesn't expose a separate "append" field — emulate by concatenating.
      opts.systemPrompt = (opts.systemPrompt ? opts.systemPrompt + '\n\n' : '') + options.appendSystemPrompt
    }
    if (options.maxTurns !== undefined) opts.maxTurns = options.maxTurns
    if (options.resume) opts.resume = options.resume
    if (options.fallbackModel) opts.fallbackModel = options.fallbackModel

    return opts
  }

  sendInput(_proc: SessionHandle, _input: string): void {
    // SDK sessions run one turn per startSession() call, same as Claude CLI in
    // --print mode. The turn loop in CLIManager re-invokes startSession() with
    // `continue: true` to chain turns. No stdin-driven flow needed here.
  }

  sendSlashCommand(_proc: SessionHandle, _command: string): void {
    // Slash commands have no direct SDK equivalent; the CLI adapter still
    // handles them for CLI sessions.
  }
}
