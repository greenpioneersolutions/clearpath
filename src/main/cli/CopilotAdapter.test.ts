import { describe, it, expect } from 'vitest'
import { CopilotAdapter } from './CopilotAdapter'
import type { SessionOptions } from './types'

describe('CopilotAdapter', () => {
  const adapter = new CopilotAdapter()

  describe('buildArgs', () => {
    it('returns empty args for a minimal interactive session', () => {
      const options: SessionOptions = { mode: 'interactive' }
      const args = adapter.buildArgs(options)
      expect(args).toEqual([])
    })

    it('builds --prompt flag for prompt mode', () => {
      const options: SessionOptions = {
        mode: 'prompt',
        prompt: 'What is this project?',
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--prompt')
      expect(args).toContain('What is this project?')
    })

    it('includes --model when specified', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        model: 'gpt-5',
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--model')
      expect(args).toContain('gpt-5')
    })

    it('includes --yolo flag', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        yolo: true,
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--yolo')
      // yolo should not also add --allow-all
      expect(args).not.toContain('--allow-all')
    })

    it('builds allowed and denied tool flags', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        allowedTools: ['shell(git:*)'],
        deniedTools: ['shell(rm:*)'],
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--allow-tool')
      expect(args).toContain('shell(git:*)')
      expect(args).toContain('--deny-tool')
      expect(args).toContain('shell(rm:*)')
    })

    it('includes --experimental when set to true', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        experimental: true,
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--experimental')
    })

    it('includes --no-experimental when set to false', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        experimental: false,
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--no-experimental')
    })

    it('handles catch-all flags', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        flags: {
          'screen-reader': true,
          'config-dir': '/custom/path',
          'streamer-mode': false,
        },
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--screen-reader')
      expect(args).toContain('--config-dir')
      expect(args).toContain('/custom/path')
      // false flags should be omitted
      expect(args).not.toContain('--streamer-mode')
    })
  })

  describe('parseOutput', () => {
    it('parses plain text output', () => {
      const result = adapter.parseOutput('Hello, how can I help?')
      expect(result.type).toBe('text')
      expect(result.content).toBe('Hello, how can I help?')
    })

    it('returns empty text for blank lines', () => {
      const result = adapter.parseOutput('')
      expect(result.type).toBe('text')
      expect(result.content).toBe('')
    })

    it('detects permission request prompts', () => {
      const result = adapter.parseOutput(
        'Allow copilot to run: `shell(git status)` [y/n/a]?',
      )
      expect(result.type).toBe('permission-request')
      expect(result.content).toContain('Allow copilot to run')
    })

    it('detects error lines', () => {
      const result = adapter.parseOutput('Error: Connection refused')
      expect(result.type).toBe('error')
      expect(result.content).toContain('Connection refused')
    })

    it('strips ANSI escape codes from output', () => {
      const result = adapter.parseOutput(
        '\x1b[31mError: something failed\x1b[0m',
      )
      expect(result.type).toBe('error')
      expect(result.content).not.toContain('\x1b')
      expect(result.content).toContain('something failed')
    })

    it('parses JSON tool_use events', () => {
      const json = JSON.stringify({
        type: 'tool_use',
        name: 'shell',
        input: { command: 'ls' },
      })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('tool-use')
      expect(result.content).toBe('shell')
      expect(result.metadata).toBeDefined()
    })

    it('parses JSON error events', () => {
      const json = JSON.stringify({
        type: 'error',
        message: 'Rate limit exceeded',
      })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('error')
      expect(result.content).toBe('Rate limit exceeded')
    })
  })
})
