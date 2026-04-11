import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'http'
import https from 'https'
import { EventEmitter } from 'events'
import { LocalModelAdapter } from './LocalModelAdapter'
import type { SessionOptions } from './types'

// ─── Helper type for spying on private methods ────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAdapter = any

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('LocalModelAdapter', () => {
  let adapter: LocalModelAdapter

  beforeEach(() => {
    adapter = new LocalModelAdapter()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // cliName / binaryPath
  // ═══════════════════════════════════════════════════════════════════════════

  describe('static properties', () => {
    it('has cliName "local"', () => {
      expect(adapter.cliName).toBe('local')
    })

    it('has binaryPath "local"', () => {
      expect(adapter.binaryPath).toBe('local')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // buildArgs
  // ═══════════════════════════════════════════════════════════════════════════

  describe('buildArgs', () => {
    it('always returns an empty array (HTTP adapter, no CLI args)', () => {
      const options: SessionOptions = { cli: 'copilot', mode: 'interactive', model: 'llama3' }
      expect(adapter.buildArgs(options)).toEqual([])
    })

    it('returns empty array even with many options set', () => {
      const options: SessionOptions = {
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'hello',
        model: 'mistral',
        allowedTools: ['*'],
        experimental: true,
      }
      expect(adapter.buildArgs(options)).toEqual([])
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // parseOutput
  // ═══════════════════════════════════════════════════════════════════════════

  describe('parseOutput', () => {
    it('returns text type for normal content', () => {
      const result = adapter.parseOutput('Hello world')
      expect(result).toEqual({ type: 'text', content: 'Hello world' })
    })

    it('returns empty text for whitespace-only input', () => {
      const result = adapter.parseOutput('  \n  ')
      expect(result).toEqual({ type: 'text', content: '' })
    })

    it('returns empty text for empty string', () => {
      const result = adapter.parseOutput('')
      expect(result).toEqual({ type: 'text', content: '' })
    })

    it('detects lines starting with "Error" as error type', () => {
      const result = adapter.parseOutput('Error: connection refused')
      expect(result.type).toBe('error')
      expect(result.content).toBe('Error: connection refused')
    })

    it('detects lines starting with "error:" as error type', () => {
      const result = adapter.parseOutput('error: model not found')
      expect(result.type).toBe('error')
      expect(result.content).toBe('error: model not found')
    })

    it('trims whitespace from content', () => {
      const result = adapter.parseOutput('   some text   ')
      expect(result.content).toBe('some text')
    })

    it('treats "ErrorHandler" as error (starts with "Error")', () => {
      const result = adapter.parseOutput('ErrorHandler initialized')
      expect(result.type).toBe('error')
    })

    it('treats normal text without error prefix as text type', () => {
      const result = adapter.parseOutput('The model is running')
      expect(result.type).toBe('text')
    })

    it('handles multiline text (only trims first/last whitespace)', () => {
      const result = adapter.parseOutput('  line one\nline two  ')
      expect(result.type).toBe('text')
      expect(result.content).toBe('line one\nline two')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // isInstalled — pings both Ollama and LM Studio
  // ═══════════════════════════════════════════════════════════════════════════

  describe('isInstalled', () => {
    it('returns true when Ollama is reachable', async () => {
      vi.spyOn(adapter as AnyAdapter, 'ping')
        .mockResolvedValueOnce(true)    // Ollama
        .mockResolvedValueOnce(false)   // LM Studio

      const result = await adapter.isInstalled()
      expect(result).toBe(true)
    })

    it('returns true when only LM Studio is reachable', async () => {
      vi.spyOn(adapter as AnyAdapter, 'ping')
        .mockResolvedValueOnce(false)   // Ollama
        .mockResolvedValueOnce(true)    // LM Studio

      const result = await adapter.isInstalled()
      expect(result).toBe(true)
    })

    it('returns true when both servers are reachable', async () => {
      vi.spyOn(adapter as AnyAdapter, 'ping')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)

      const result = await adapter.isInstalled()
      expect(result).toBe(true)
    })

    it('returns false when both servers are unreachable', async () => {
      vi.spyOn(adapter as AnyAdapter, 'ping')
        .mockResolvedValue(false)

      const result = await adapter.isInstalled()
      expect(result).toBe(false)
    })

    it('pings the correct URLs', async () => {
      const pingSpy = vi.spyOn(adapter as AnyAdapter, 'ping')
        .mockResolvedValue(false)

      await adapter.isInstalled()

      expect(pingSpy).toHaveBeenCalledTimes(2)
      expect(pingSpy).toHaveBeenCalledWith('http://localhost:11434/api/tags')
      expect(pingSpy).toHaveBeenCalledWith('http://localhost:1234/v1/models')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // isAuthenticated — delegates to isInstalled
  // ═══════════════════════════════════════════════════════════════════════════

  describe('isAuthenticated', () => {
    it('returns true when isInstalled returns true', async () => {
      vi.spyOn(adapter as AnyAdapter, 'ping').mockResolvedValue(true)
      expect(await adapter.isAuthenticated()).toBe(true)
    })

    it('returns false when no servers are reachable', async () => {
      vi.spyOn(adapter as AnyAdapter, 'ping').mockResolvedValue(false)
      expect(await adapter.isAuthenticated()).toBe(false)
    })

    it('delegates to isInstalled (same behavior)', async () => {
      const installSpy = vi.spyOn(adapter, 'isInstalled').mockResolvedValue(true)
      await adapter.isAuthenticated()
      expect(installSpy).toHaveBeenCalledOnce()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // detectServers
  // ═══════════════════════════════════════════════════════════════════════════

  describe('detectServers', () => {
    it('detects Ollama with models', async () => {
      const ollamaData = JSON.stringify({
        models: [
          { name: 'llama3', size: 4_700_000_000 },
          { name: 'mistral', size: 7_200_000_000 },
        ],
      })

      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockImplementation((url: string) => {
          if (url.includes('11434')) return Promise.resolve(ollamaData)
          return Promise.reject(new Error('ECONNREFUSED'))
        })

      const result = await adapter.detectServers()

      expect(result.ollama.connected).toBe(true)
      expect(result.ollama.models).toHaveLength(2)
      expect(result.ollama.models[0]).toEqual({
        name: 'llama3',
        source: 'ollama',
        size: '4.7GB',
      })
      expect(result.ollama.models[1]).toEqual({
        name: 'mistral',
        source: 'ollama',
        size: '7.2GB',
      })
      expect(result.lmstudio.connected).toBe(false)
      expect(result.lmstudio.models).toEqual([])
    })

    it('detects LM Studio with models', async () => {
      const lmStudioData = JSON.stringify({
        data: [{ id: 'TheBloke/Llama-2-13B-GGUF' }, { id: 'lmstudio-community/Phi-3' }],
      })

      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockImplementation((url: string) => {
          if (url.includes('1234')) return Promise.resolve(lmStudioData)
          return Promise.reject(new Error('ECONNREFUSED'))
        })

      const result = await adapter.detectServers()

      expect(result.lmstudio.connected).toBe(true)
      expect(result.lmstudio.models).toHaveLength(2)
      expect(result.lmstudio.models[0]).toEqual({
        name: 'TheBloke/Llama-2-13B-GGUF',
        source: 'lmstudio',
      })
      expect(result.ollama.connected).toBe(false)
    })

    it('detects both servers when both are running', async () => {
      const ollamaData = JSON.stringify({ models: [{ name: 'llama3' }] })
      const lmStudioData = JSON.stringify({ data: [{ id: 'phi-3' }] })

      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockImplementation((url: string) => {
          if (url.includes('11434')) return Promise.resolve(ollamaData)
          return Promise.resolve(lmStudioData)
        })

      const result = await adapter.detectServers()

      expect(result.ollama.connected).toBe(true)
      expect(result.ollama.models).toHaveLength(1)
      expect(result.lmstudio.connected).toBe(true)
      expect(result.lmstudio.models).toHaveLength(1)
    })

    it('returns disconnected state when both servers are unavailable', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await adapter.detectServers()

      expect(result.ollama.connected).toBe(false)
      expect(result.ollama.models).toEqual([])
      expect(result.lmstudio.connected).toBe(false)
      expect(result.lmstudio.models).toEqual([])
    })

    it('handles Ollama response with no models array', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockImplementation((url: string) => {
          if (url.includes('11434')) return Promise.resolve(JSON.stringify({}))
          return Promise.reject(new Error('fail'))
        })

      const result = await adapter.detectServers()
      expect(result.ollama.connected).toBe(true)
      expect(result.ollama.models).toEqual([])
    })

    it('handles LM Studio response with no data array', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockImplementation((url: string) => {
          if (url.includes('1234')) return Promise.resolve(JSON.stringify({}))
          return Promise.reject(new Error('fail'))
        })

      const result = await adapter.detectServers()
      expect(result.lmstudio.connected).toBe(true)
      expect(result.lmstudio.models).toEqual([])
    })

    it('handles model with undefined size', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockImplementation((url: string) => {
          if (url.includes('11434')) return Promise.resolve(JSON.stringify({ models: [{ name: 'tiny' }] }))
          return Promise.reject(new Error('fail'))
        })

      const result = await adapter.detectServers()
      expect(result.ollama.models[0]).toEqual({
        name: 'tiny',
        source: 'ollama',
        size: undefined,
      })
    })

    it('handles invalid JSON from Ollama gracefully', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockImplementation((url: string) => {
          if (url.includes('11434')) return Promise.resolve('not json')
          return Promise.reject(new Error('fail'))
        })

      const result = await adapter.detectServers()
      // JSON.parse throws → caught → not connected
      expect(result.ollama.connected).toBe(false)
    })

    it('handles invalid JSON from LM Studio gracefully', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockImplementation((url: string) => {
          if (url.includes('1234')) return Promise.resolve('{bad')
          return Promise.reject(new Error('fail'))
        })

      const result = await adapter.detectServers()
      expect(result.lmstudio.connected).toBe(false)
    })

    it('calls httpGet with the correct Ollama URL', async () => {
      const httpGetSpy = vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockRejectedValue(new Error('fail'))

      await adapter.detectServers()

      expect(httpGetSpy).toHaveBeenCalledWith('http://localhost:11434/api/tags')
      expect(httpGetSpy).toHaveBeenCalledWith('http://localhost:1234/v1/models')
    })

    it('formats model size correctly (GB)', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockImplementation((url: string) => {
          if (url.includes('11434')) {
            return Promise.resolve(JSON.stringify({
              models: [
                { name: 'small', size: 500_000_000 },    // 0.5GB
                { name: 'medium', size: 3_800_000_000 },  // 3.8GB
                { name: 'large', size: 70_000_000_000 },  // 70.0GB
              ],
            }))
          }
          return Promise.reject(new Error('fail'))
        })

      const result = await adapter.detectServers()
      expect(result.ollama.models[0].size).toBe('0.5GB')
      expect(result.ollama.models[1].size).toBe('3.8GB')
      expect(result.ollama.models[2].size).toBe('70.0GB')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // sendInput
  // ═══════════════════════════════════════════════════════════════════════════

  describe('sendInput', () => {
    it('does not throw for any input string', () => {
      const fakeProc = {} as import('child_process').ChildProcess
      expect(() => adapter.sendInput(fakeProc, 'Hello AI')).not.toThrow()
    })

    it('can be called multiple times', () => {
      const fakeProc = {} as import('child_process').ChildProcess
      adapter.sendInput(fakeProc, 'First message')
      adapter.sendInput(fakeProc, 'Second message')
      adapter.sendInput(fakeProc, 'Third message')
      // No error means conversation history is being accumulated
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // sendSlashCommand
  // ═══════════════════════════════════════════════════════════════════════════

  describe('sendSlashCommand', () => {
    it('delegates to sendInput (does not throw)', () => {
      const fakeProc = {} as import('child_process').ChildProcess
      expect(() => adapter.sendSlashCommand(fakeProc, '/clear')).not.toThrow()
    })

    it('handles various slash commands', () => {
      const fakeProc = {} as import('child_process').ChildProcess
      expect(() => adapter.sendSlashCommand(fakeProc, '/help')).not.toThrow()
      expect(() => adapter.sendSlashCommand(fakeProc, '/model gpt-4')).not.toThrow()
      expect(() => adapter.sendSlashCommand(fakeProc, '/exit')).not.toThrow()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // startSession
  // ═══════════════════════════════════════════════════════════════════════════

  describe('startSession', () => {
    it('returns a fake ChildProcess with stdout, stderr, stdin, pid', () => {
      const options: SessionOptions = { cli: 'copilot', mode: 'interactive' }
      const proc = adapter.startSession(options)

      expect(proc).toBeDefined()
      expect(proc.stdout).toBeDefined()
      expect(proc.stderr).toBeDefined()
      expect(proc.stdin).toBeDefined()
      expect(proc.pid).toBe(-1)
    })

    it('does not call streamChat when no prompt is provided', () => {
      const streamSpy = vi.spyOn(adapter as AnyAdapter, 'streamChat')
      adapter.startSession({ cli: 'copilot', mode: 'interactive' })
      expect(streamSpy).not.toHaveBeenCalled()
    })

    it('calls streamChat with Ollama when model has no slash', async () => {
      const streamSpy = vi.spyOn(adapter as AnyAdapter, 'streamChat')
        .mockResolvedValue('Hello from Ollama')

      const proc = adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'Say hello',
        model: 'llama3',
      })

      const output = await new Promise<string>((resolve) => {
        proc.stdout!.on('data', (data: Buffer) => resolve(data.toString()))
      })

      expect(output).toContain('Hello from Ollama')
      // streamChat(model, isLmStudio, messages)
      expect(streamSpy).toHaveBeenCalledWith(
        'llama3',
        false, // not LM Studio
        expect.arrayContaining([{ role: 'user', content: 'Say hello' }]),
      )
    })

    it('calls streamChat with LM Studio when model has slash', async () => {
      const streamSpy = vi.spyOn(adapter as AnyAdapter, 'streamChat')
        .mockResolvedValue('Hello from LM Studio')

      const proc = adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'Say hello',
        model: 'TheBloke/Llama-2-13B-GGUF',
      })

      const output = await new Promise<string>((resolve) => {
        proc.stdout!.on('data', (data: Buffer) => resolve(data.toString()))
      })

      expect(output).toContain('Hello from LM Studio')
      expect(streamSpy).toHaveBeenCalledWith(
        'TheBloke/Llama-2-13B-GGUF',
        true, // is LM Studio
        expect.any(Array),
      )
    })

    it('defaults model to "llama3" when not specified', async () => {
      const streamSpy = vi.spyOn(adapter as AnyAdapter, 'streamChat')
        .mockResolvedValue('Default response')

      adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'Hello',
      })

      await vi.waitFor(() => {
        expect(streamSpy).toHaveBeenCalled()
      })

      expect(streamSpy).toHaveBeenCalledWith(
        'llama3',
        false,
        expect.any(Array),
      )
    })

    it('emits exit code 0 on successful response', async () => {
      vi.spyOn(adapter as AnyAdapter, 'streamChat').mockResolvedValue('ok')

      const proc = adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'test',
      })

      const exitCode = await new Promise<number>((resolve) => {
        proc.on('exit', (code: number) => resolve(code))
      })

      expect(exitCode).toBe(0)
    })

    it('emits exit code 1 and stderr on streamChat error', async () => {
      vi.spyOn(adapter as AnyAdapter, 'streamChat')
        .mockRejectedValue(new Error('Connection refused'))

      const proc = adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'test',
      })

      const [exitCode, errOutput] = await Promise.all([
        new Promise<number>((resolve) => {
          proc.on('exit', (code: number) => resolve(code))
        }),
        new Promise<string>((resolve) => {
          proc.stderr!.on('data', (data: Buffer) => resolve(data.toString()))
        }),
      ])

      expect(exitCode).toBe(1)
      expect(errOutput).toContain('Connection refused')
    })

    it('emits stdout data with trailing newline', async () => {
      vi.spyOn(adapter as AnyAdapter, 'streamChat').mockResolvedValue('Hello world')

      const proc = adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'test',
      })

      const output = await new Promise<string>((resolve) => {
        proc.stdout!.on('data', (data: Buffer) => resolve(data.toString()))
      })

      expect(output).toBe('Hello world\n')
    })

    it('handles empty response from streamChat', async () => {
      vi.spyOn(adapter as AnyAdapter, 'streamChat').mockResolvedValue('')

      const proc = adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'test',
      })

      const output = await new Promise<string>((resolve) => {
        proc.stdout!.on('data', (data: Buffer) => resolve(data.toString()))
      })

      expect(output).toBe('\n')
    })

    it('stdin write and end are no-ops', () => {
      const proc = adapter.startSession({ cli: 'copilot', mode: 'interactive' })
      expect(() => proc.stdin!.write('test')).not.toThrow()
      expect(() => proc.stdin!.end()).not.toThrow()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // streamChat routing: chatOllama vs chatLmStudio
  // ═══════════════════════════════════════════════════════════════════════════

  describe('streamChat routing', () => {
    it('routes to chatOllama when isLmStudio is false', async () => {
      const ollamaSpy = vi.spyOn(adapter as AnyAdapter, 'chatOllama').mockResolvedValue('ollama response')
      const lmSpy = vi.spyOn(adapter as AnyAdapter, 'chatLmStudio').mockResolvedValue('lm response')

      const result = await (adapter as AnyAdapter).streamChat('llama3', false, [])
      expect(result).toBe('ollama response')
      expect(ollamaSpy).toHaveBeenCalledWith('llama3', [])
      expect(lmSpy).not.toHaveBeenCalled()
    })

    it('routes to chatLmStudio when isLmStudio is true', async () => {
      const ollamaSpy = vi.spyOn(adapter as AnyAdapter, 'chatOllama').mockResolvedValue('ollama response')
      const lmSpy = vi.spyOn(adapter as AnyAdapter, 'chatLmStudio').mockResolvedValue('lm response')

      const result = await (adapter as AnyAdapter).streamChat('org/model', true, [])
      expect(result).toBe('lm response')
      expect(lmSpy).toHaveBeenCalledWith('org/model', [])
      expect(ollamaSpy).not.toHaveBeenCalled()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // chatOllama — parses Ollama response format
  // ═══════════════════════════════════════════════════════════════════════════

  describe('chatOllama', () => {
    it('sends model, messages, stream:false and parses message.content', async () => {
      const httpPostSpy = vi.spyOn(adapter as AnyAdapter, 'httpPost')
        .mockResolvedValue(JSON.stringify({ message: { content: 'Hello!' } }))

      const messages = [{ role: 'user' as const, content: 'Hi' }]
      const result = await (adapter as AnyAdapter).chatOllama('llama3', messages)

      expect(result).toBe('Hello!')
      expect(httpPostSpy).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        JSON.stringify({ model: 'llama3', messages, stream: false }),
      )
    })

    it('returns empty string when response has no message', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpPost')
        .mockResolvedValue(JSON.stringify({}))

      const result = await (adapter as AnyAdapter).chatOllama('llama3', [])
      expect(result).toBe('')
    })

    it('returns empty string when message has no content', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpPost')
        .mockResolvedValue(JSON.stringify({ message: {} }))

      const result = await (adapter as AnyAdapter).chatOllama('llama3', [])
      expect(result).toBe('')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // chatLmStudio — parses OpenAI-compatible response format
  // ═══════════════════════════════════════════════════════════════════════════

  describe('chatLmStudio', () => {
    it('sends model, messages, stream:false and parses choices[0].message.content', async () => {
      const httpPostSpy = vi.spyOn(adapter as AnyAdapter, 'httpPost')
        .mockResolvedValue(JSON.stringify({
          choices: [{ message: { content: 'LM Studio says hi' } }],
        }))

      const messages = [{ role: 'user' as const, content: 'Hi' }]
      const result = await (adapter as AnyAdapter).chatLmStudio('org/model', messages)

      expect(result).toBe('LM Studio says hi')
      expect(httpPostSpy).toHaveBeenCalledWith(
        'http://localhost:1234/v1/chat/completions',
        JSON.stringify({ model: 'org/model', messages, stream: false }),
      )
    })

    it('returns empty string when response has no choices', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpPost')
        .mockResolvedValue(JSON.stringify({}))

      const result = await (adapter as AnyAdapter).chatLmStudio('org/model', [])
      expect(result).toBe('')
    })

    it('returns empty string when choices array is empty', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpPost')
        .mockResolvedValue(JSON.stringify({ choices: [] }))

      const result = await (adapter as AnyAdapter).chatLmStudio('org/model', [])
      expect(result).toBe('')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Conversation history management
  // ═══════════════════════════════════════════════════════════════════════════

  describe('conversation history', () => {
    it('includes messages added via sendInput in next streamChat call', async () => {
      const fakeProc = {} as import('child_process').ChildProcess
      adapter.sendInput(fakeProc, 'First message')
      adapter.sendInput(fakeProc, 'Second message')

      // Capture messages at call time (before .then appends assistant response)
      let capturedMessages: unknown[] = []
      vi.spyOn(adapter as AnyAdapter, 'streamChat')
        .mockImplementation((_m: string, _lm: boolean, msgs: unknown[]) => {
          capturedMessages = [...msgs]
          return Promise.resolve('response')
        })

      adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'Third message',
      })

      await vi.waitFor(() => {
        expect(capturedMessages.length).toBeGreaterThan(0)
      })

      expect(capturedMessages).toHaveLength(3)
      expect(capturedMessages[0]).toEqual({ role: 'user', content: 'First message' })
      expect(capturedMessages[1]).toEqual({ role: 'user', content: 'Second message' })
      expect(capturedMessages[2]).toEqual({ role: 'user', content: 'Third message' })
    })

    it('includes assistant response in history after successful chat', async () => {
      vi.spyOn(adapter as AnyAdapter, 'streamChat').mockResolvedValue('I am AI')

      const proc = adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'Who are you?',
      })

      // Wait for exit (ensures .then handler ran and added assistant message)
      await new Promise<void>((resolve) => { proc.on('exit', () => resolve()) })

      // Now start another session — capture messages at call time
      let capturedMessages: unknown[] = []
      vi.spyOn(adapter as AnyAdapter, 'streamChat')
        .mockImplementation((_m: string, _lm: boolean, msgs: unknown[]) => {
          capturedMessages = [...msgs]
          return Promise.resolve('hi again')
        })

      adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'Follow up',
      })

      await vi.waitFor(() => {
        expect(capturedMessages.length).toBeGreaterThan(0)
      })

      // "Who are you?" (user) + "I am AI" (assistant) + "Follow up" (user)
      expect(capturedMessages).toHaveLength(3)
      expect(capturedMessages[0]).toEqual({ role: 'user', content: 'Who are you?' })
      expect(capturedMessages[1]).toEqual({ role: 'assistant', content: 'I am AI' })
      expect(capturedMessages[2]).toEqual({ role: 'user', content: 'Follow up' })
    })

    it('does not add assistant response on error', async () => {
      vi.spyOn(adapter as AnyAdapter, 'streamChat').mockRejectedValue(new Error('fail'))

      const proc = adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'Will fail',
      })

      await new Promise<void>((resolve) => { proc.on('exit', () => resolve()) })

      // Capture messages at call time
      let capturedMessages: unknown[] = []
      vi.spyOn(adapter as AnyAdapter, 'streamChat')
        .mockImplementation((_m: string, _lm: boolean, msgs: unknown[]) => {
          capturedMessages = [...msgs]
          return Promise.resolve('ok')
        })

      adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'Next',
      })

      await vi.waitFor(() => {
        expect(capturedMessages.length).toBeGreaterThan(0)
      })

      // "Will fail" (user) + "Next" (user) — no assistant message from failed call
      expect(capturedMessages).toHaveLength(2)
      expect(capturedMessages[0]).toEqual({ role: 'user', content: 'Will fail' })
      expect(capturedMessages[1]).toEqual({ role: 'user', content: 'Next' })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Error handling
  // ═══════════════════════════════════════════════════════════════════════════

  describe('error handling', () => {
    it('httpPost error propagates through streamChat to startSession', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpPost')
        .mockRejectedValue(new Error('timeout'))

      const proc = adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'test',
      })

      const exitCode = await new Promise<number>((resolve) => {
        proc.on('exit', (code: number) => resolve(code))
      })

      expect(exitCode).toBe(1)
    })

    it('httpGet error in detectServers is caught per-server', async () => {
      let callCount = 0
      vi.spyOn(adapter as AnyAdapter, 'httpGet')
        .mockImplementation(() => {
          callCount++
          if (callCount === 1) return Promise.reject(new Error('Ollama down'))
          return Promise.resolve(JSON.stringify({ data: [{ id: 'model1' }] }))
        })

      const result = await adapter.detectServers()
      // Ollama failed, LM Studio succeeded
      expect(result.ollama.connected).toBe(false)
      expect(result.lmstudio.connected).toBe(true)
    })

    it('invalid JSON from httpPost causes exit code 1', async () => {
      vi.spyOn(adapter as AnyAdapter, 'httpPost')
        .mockResolvedValue('not-json')

      const proc = adapter.startSession({
        cli: 'copilot',
        mode: 'prompt',
        prompt: 'test',
      })

      const exitCode = await new Promise<number>((resolve) => {
        proc.on('exit', (code: number) => resolve(code))
      })

      expect(exitCode).toBe(1)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HTTP method internals — testing actual http/https module interactions
  // ═══════════════════════════════════════════════════════════════════════════

  describe('HTTP method internals', () => {
    function createMockReq() {
      const req = new EventEmitter() as EventEmitter & {
        destroy: ReturnType<typeof vi.fn>
        write: ReturnType<typeof vi.fn>
        end: ReturnType<typeof vi.fn>
      }
      req.destroy = vi.fn()
      req.write = vi.fn()
      req.end = vi.fn()
      return req
    }

    function createMockRes(statusCode: number) {
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number
        resume: ReturnType<typeof vi.fn>
      }
      res.statusCode = statusCode
      res.resume = vi.fn()
      return res
    }

    // ─── ping ──────────────────────────────────────────────────────────────

    describe('ping (real implementation)', () => {
      it('resolves true when response statusCode is 200', async () => {
        const mockReq = createMockReq()
        const mockRes = createMockRes(200)

        vi.spyOn(http, 'get').mockImplementation((_url: any, _opts: any, cb: any) => {
          cb(mockRes)
          return mockReq as any
        })

        const result = await (adapter as AnyAdapter).ping('http://localhost:11434/api/tags')
        expect(result).toBe(true)
        expect(mockRes.resume).toHaveBeenCalled()
      })

      it('resolves false when response statusCode is not 200', async () => {
        const mockReq = createMockReq()
        const mockRes = createMockRes(500)

        vi.spyOn(http, 'get').mockImplementation((_url: any, _opts: any, cb: any) => {
          cb(mockRes)
          return mockReq as any
        })

        const result = await (adapter as AnyAdapter).ping('http://localhost:11434/api/tags')
        expect(result).toBe(false)
      })

      it('resolves false on error event', async () => {
        const mockReq = createMockReq()

        vi.spyOn(http, 'get').mockImplementation((_url: any, _opts: any, _cb: any) => {
          process.nextTick(() => mockReq.emit('error', new Error('ECONNREFUSED')))
          return mockReq as any
        })

        const result = await (adapter as AnyAdapter).ping('http://localhost:11434/api/tags')
        expect(result).toBe(false)
      })

      it('resolves false on timeout and calls destroy', async () => {
        const mockReq = createMockReq()

        vi.spyOn(http, 'get').mockImplementation((_url: any, _opts: any, _cb: any) => {
          process.nextTick(() => mockReq.emit('timeout'))
          return mockReq as any
        })

        const result = await (adapter as AnyAdapter).ping('http://localhost:11434/api/tags')
        expect(result).toBe(false)
        expect(mockReq.destroy).toHaveBeenCalled()
      })

      it('uses https transport for https URLs', async () => {
        const mockReq = createMockReq()
        const mockRes = createMockRes(200)

        const httpSpy = vi.spyOn(http, 'get').mockImplementation(() => mockReq as any)
        const httpsSpy = vi.spyOn(https, 'get').mockImplementation((_url: any, _opts: any, cb: any) => {
          cb(mockRes)
          return mockReq as any
        })

        await (adapter as AnyAdapter).ping('https://secure.example.com/api/tags')
        expect(httpsSpy).toHaveBeenCalled()
        expect(httpSpy).not.toHaveBeenCalled()
      })

      it('uses http transport for http URLs', async () => {
        const mockReq = createMockReq()
        const mockRes = createMockRes(200)

        const httpSpy = vi.spyOn(http, 'get').mockImplementation((_url: any, _opts: any, cb: any) => {
          cb(mockRes)
          return mockReq as any
        })
        const httpsSpy = vi.spyOn(https, 'get').mockImplementation(() => mockReq as any)

        await (adapter as AnyAdapter).ping('http://localhost:11434/api/tags')
        expect(httpSpy).toHaveBeenCalled()
        expect(httpsSpy).not.toHaveBeenCalled()
      })
    })

    // ─── httpGet ────────────────────────────────────────────────────────────

    describe('httpGet (real implementation)', () => {
      it('resolves with concatenated response data chunks', async () => {
        const mockReq = createMockReq()
        const mockRes = new EventEmitter()

        vi.spyOn(http, 'get').mockImplementation((_url: any, _opts: any, cb: any) => {
          cb(mockRes)
          process.nextTick(() => {
            mockRes.emit('data', 'hello ')
            mockRes.emit('data', 'world')
            mockRes.emit('end')
          })
          return mockReq as any
        })

        const result = await (adapter as AnyAdapter).httpGet('http://localhost:11434/api/tags')
        expect(result).toBe('hello world')
      })

      it('resolves with single data chunk', async () => {
        const mockReq = createMockReq()
        const mockRes = new EventEmitter()

        vi.spyOn(http, 'get').mockImplementation((_url: any, _opts: any, cb: any) => {
          cb(mockRes)
          process.nextTick(() => {
            mockRes.emit('data', '{"models":[]}')
            mockRes.emit('end')
          })
          return mockReq as any
        })

        const result = await (adapter as AnyAdapter).httpGet('http://localhost:11434/api/tags')
        expect(result).toBe('{"models":[]}')
      })

      it('rejects on error event', async () => {
        const mockReq = createMockReq()

        vi.spyOn(http, 'get').mockImplementation((_url: any, _opts: any, _cb: any) => {
          process.nextTick(() => mockReq.emit('error', new Error('ECONNREFUSED')))
          return mockReq as any
        })

        await expect((adapter as AnyAdapter).httpGet('http://localhost:11434/api/tags'))
          .rejects.toThrow('ECONNREFUSED')
      })

      it('rejects with timeout error and calls destroy', async () => {
        const mockReq = createMockReq()

        vi.spyOn(http, 'get').mockImplementation((_url: any, _opts: any, _cb: any) => {
          process.nextTick(() => mockReq.emit('timeout'))
          return mockReq as any
        })

        await expect((adapter as AnyAdapter).httpGet('http://localhost:11434/api/tags'))
          .rejects.toThrow('timeout')
        expect(mockReq.destroy).toHaveBeenCalled()
      })

      it('uses https transport for https URLs', async () => {
        const mockReq = createMockReq()
        const mockRes = new EventEmitter()

        const httpSpy = vi.spyOn(http, 'get').mockImplementation(() => mockReq as any)
        const httpsSpy = vi.spyOn(https, 'get').mockImplementation((_url: any, _opts: any, cb: any) => {
          cb(mockRes)
          process.nextTick(() => {
            mockRes.emit('data', 'ok')
            mockRes.emit('end')
          })
          return mockReq as any
        })

        await (adapter as AnyAdapter).httpGet('https://secure.example.com/api/tags')
        expect(httpsSpy).toHaveBeenCalled()
        expect(httpSpy).not.toHaveBeenCalled()
      })
    })

    // ─── httpPost ───────────────────────────────────────────────────────────

    describe('httpPost (real implementation)', () => {
      it('resolves with response data', async () => {
        const mockReq = createMockReq()
        const mockRes = new EventEmitter()

        vi.spyOn(http, 'request').mockImplementation((_opts: any, cb: any) => {
          cb(mockRes)
          process.nextTick(() => {
            mockRes.emit('data', '{"message":{"content":"hi"}}')
            mockRes.emit('end')
          })
          return mockReq as any
        })

        const body = JSON.stringify({ model: 'llama3', messages: [], stream: false })
        const result = await (adapter as AnyAdapter).httpPost('http://localhost:11434/api/chat', body)
        expect(result).toBe('{"message":{"content":"hi"}}')
      })

      it('calls req.write() with body and req.end()', async () => {
        const mockReq = createMockReq()
        const mockRes = new EventEmitter()

        vi.spyOn(http, 'request').mockImplementation((_opts: any, cb: any) => {
          cb(mockRes)
          process.nextTick(() => {
            mockRes.emit('data', '{}')
            mockRes.emit('end')
          })
          return mockReq as any
        })

        const body = '{"test":"data"}'
        await (adapter as AnyAdapter).httpPost('http://localhost:11434/api/chat', body)
        expect(mockReq.write).toHaveBeenCalledWith(body)
        expect(mockReq.end).toHaveBeenCalled()
      })

      it('sends correct request options (hostname, port, path, method, headers)', async () => {
        const mockReq = createMockReq()
        const mockRes = new EventEmitter()
        let capturedOpts: any = null

        vi.spyOn(http, 'request').mockImplementation((opts: any, cb: any) => {
          capturedOpts = opts
          cb(mockRes)
          process.nextTick(() => {
            mockRes.emit('data', '{}')
            mockRes.emit('end')
          })
          return mockReq as any
        })

        const body = '{"hello":"world"}'
        await (adapter as AnyAdapter).httpPost('http://localhost:11434/api/chat', body)

        expect(capturedOpts.hostname).toBe('localhost')
        expect(capturedOpts.port).toBe('11434')
        expect(capturedOpts.path).toBe('/api/chat')
        expect(capturedOpts.method).toBe('POST')
        expect(capturedOpts.headers['Content-Type']).toBe('application/json')
        expect(capturedOpts.headers['Content-Length']).toBe(Buffer.byteLength(body))
        expect(capturedOpts.timeout).toBe(120000)
      })

      it('rejects on error event', async () => {
        const mockReq = createMockReq()

        vi.spyOn(http, 'request').mockImplementation((_opts: any, _cb: any) => {
          process.nextTick(() => mockReq.emit('error', new Error('ECONNREFUSED')))
          return mockReq as any
        })

        await expect((adapter as AnyAdapter).httpPost('http://localhost:11434/api/chat', '{}'))
          .rejects.toThrow('ECONNREFUSED')
      })

      it('rejects with timeout error and calls destroy', async () => {
        const mockReq = createMockReq()

        vi.spyOn(http, 'request').mockImplementation((_opts: any, _cb: any) => {
          process.nextTick(() => mockReq.emit('timeout'))
          return mockReq as any
        })

        await expect((adapter as AnyAdapter).httpPost('http://localhost:11434/api/chat', '{}'))
          .rejects.toThrow('timeout')
        expect(mockReq.destroy).toHaveBeenCalled()
      })

      it('uses https transport for https: protocol URLs', async () => {
        const mockReq = createMockReq()
        const mockRes = new EventEmitter()

        const httpSpy = vi.spyOn(http, 'request').mockImplementation(() => mockReq as any)
        const httpsSpy = vi.spyOn(https, 'request').mockImplementation((_opts: any, cb: any) => {
          cb(mockRes)
          process.nextTick(() => {
            mockRes.emit('data', '{}')
            mockRes.emit('end')
          })
          return mockReq as any
        })

        await (adapter as AnyAdapter).httpPost('https://secure.example.com/api/chat', '{}')
        expect(httpsSpy).toHaveBeenCalled()
        expect(httpSpy).not.toHaveBeenCalled()
      })

      it('concatenates multiple response data chunks', async () => {
        const mockReq = createMockReq()
        const mockRes = new EventEmitter()

        vi.spyOn(http, 'request').mockImplementation((_opts: any, cb: any) => {
          cb(mockRes)
          process.nextTick(() => {
            mockRes.emit('data', '{"message":')
            mockRes.emit('data', '{"content":')
            mockRes.emit('data', '"hello"}}')
            mockRes.emit('end')
          })
          return mockReq as any
        })

        const result = await (adapter as AnyAdapter).httpPost('http://localhost:11434/api/chat', '{}')
        expect(result).toBe('{"message":{"content":"hello"}}')
      })
    })
  })
})
