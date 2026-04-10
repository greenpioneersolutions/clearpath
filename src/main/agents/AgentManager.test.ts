import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const {
  readFileSyncMock,
  writeFileSyncMock,
  existsSyncMock,
  mkdirSyncMock,
  readdirSyncMock,
  unlinkSyncMock,
  mockGet,
  mockSet,
  mockStoreConstructor,
  homedirMock,
  randomUUIDMock,
} = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  existsSyncMock: vi.fn().mockReturnValue(false),
  mkdirSyncMock: vi.fn(),
  readdirSyncMock: vi.fn().mockReturnValue([]),
  unlinkSyncMock: vi.fn(),
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockStoreConstructor: vi.fn(),
  homedirMock: vi.fn().mockReturnValue('/mock/home'),
  randomUUIDMock: vi.fn().mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  readdirSync: readdirSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
  unlinkSync: unlinkSyncMock,
}))

vi.mock('os', () => ({
  homedir: homedirMock,
}))

vi.mock('crypto', () => ({
  randomUUID: randomUUIDMock,
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

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

// ── Dynamic import with resetModules ──────────────────────────────────────────

let AgentManager: typeof import('./AgentManager').AgentManager

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAgentMd(opts: {
  name?: string
  description?: string
  model?: string
  tools?: string[]
  toolsInline?: string
  prompt?: string
}): string {
  const lines = ['---']
  if (opts.name) lines.push(`name: ${opts.name}`)
  if (opts.description) lines.push(`description: ${opts.description}`)
  if (opts.model) lines.push(`model: ${opts.model}`)
  if (opts.toolsInline) {
    lines.push(`tools: ${opts.toolsInline}`)
  } else if (opts.tools?.length) {
    lines.push('tools:')
    for (const t of opts.tools) lines.push(`  - ${t}`)
  }
  lines.push('---', '')
  if (opts.prompt) lines.push(opts.prompt)
  return lines.join('\n')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentManager', () => {
  let manager: InstanceType<typeof AgentManager>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    const mod = await import('./AgentManager')
    AgentManager = mod.AgentManager

    homedirMock.mockReturnValue('/mock/home')
    existsSyncMock.mockReturnValue(false)
    readdirSyncMock.mockReturnValue([])
    mockGet.mockImplementation((key: string) => {
      const defaults: Record<string, unknown> = {
        profiles: [],
        enabledAgentIds: [],
        activeAgents: { copilot: null, claude: null },
      }
      return defaults[key]
    })
    manager = new AgentManager()
  })

  // ──────────────────────────────────────────────────────────────────────────
  // parseFrontmatter (tested indirectly via scanDirectory → listAgents)
  // ──────────────────────────────────────────────────────────────────────────

  describe('parseFrontmatter (via listAgents)', () => {
    beforeEach(() => {
      // Only the global copilot dir exists
      existsSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? true : false
      )
    })

    it('parses basic name/description frontmatter', () => {
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['test.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue(
        makeAgentMd({ name: 'Test Agent', description: 'A helper' })
      )

      const result = manager.listAgents()
      expect(result.copilot).toHaveLength(1)
      expect(result.copilot[0]).toMatchObject({
        id: 'copilot:file:test',
        name: 'Test Agent',
        description: 'A helper',
        cli: 'copilot',
        source: 'file',
      })
    })

    it('parses model field', () => {
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['helper.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue(
        makeAgentMd({ name: 'Helper', description: 'desc', model: 'gpt-5' })
      )

      const result = manager.listAgents()
      expect(result.copilot[0].model).toBe('gpt-5')
    })

    it('parses block-style tool list', () => {
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['tools.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue(
        makeAgentMd({
          name: 'Tooled',
          description: 'has tools',
          tools: ['Read', 'Write', 'Bash'],
        })
      )

      const result = manager.listAgents()
      expect(result.copilot[0].tools).toEqual(['Read', 'Write', 'Bash'])
    })

    it('parses inline comma-separated tool list', () => {
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['inline.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue(
        makeAgentMd({
          name: 'Inline',
          description: 'inline tools',
          toolsInline: 'Read, Write, Bash',
        })
      )

      const result = manager.listAgents()
      expect(result.copilot[0].tools).toEqual(['Read', 'Write', 'Bash'])
    })

    it('parses prompt body', () => {
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['prompt.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue(
        makeAgentMd({ name: 'Prompt', description: 'has body', prompt: 'You are a code reviewer.' })
      )

      const result = manager.listAgents()
      expect(result.copilot[0].prompt).toBe('You are a code reviewer.')
    })

    it('falls back to filename when name is missing from frontmatter', () => {
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['fallback-name.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue('---\ndescription: no name here\n---\nBody')

      const result = manager.listAgents()
      expect(result.copilot[0].name).toBe('fallback-name')
    })

    it('returns empty meta and body when no frontmatter delimiters exist', () => {
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['plain.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue('Just some plain text, no frontmatter.')

      const result = manager.listAgents()
      expect(result.copilot[0].name).toBe('plain')
      expect(result.copilot[0].description).toBe('')
      expect(result.copilot[0].prompt).toBe('Just some plain text, no frontmatter.')
    })

    it('handles empty frontmatter block', () => {
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['empty-fm.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue('---\n\n---\nBody after empty frontmatter')

      const result = manager.listAgents()
      expect(result.copilot[0].name).toBe('empty-fm')
      expect(result.copilot[0].prompt).toBe('Body after empty frontmatter')
    })

    it('handles single-value tools as string (no comma)', () => {
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['single-tool.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue(
        '---\nname: Single Tool\ndescription: one tool\ntools: Read\n---\n'
      )

      const result = manager.listAgents()
      // Single value without comma → stored as plain string → tools becomes [string]
      expect(result.copilot[0].tools).toEqual(['Read'])
    })

    // BUG-003: Inline comma list followed by trailing list items
    describe('BUG-003: inline list override', () => {
      it('documents that inline tools value is parsed as array', () => {
        readdirSyncMock.mockImplementation((p: string) =>
          p === '/mock/home/.github/agents' ? ['bug3.agent.md'] : []
        )
        // Malformed frontmatter: inline list then a bare list item
        readFileSyncMock.mockReturnValue(
          '---\ntools: Read, Write\n  - Execute\n---\nBody'
        )

        const result = manager.listAgents()
        const tools = result.copilot[0].tools
        // BUG-003: The trailing "- Execute" after an inline value for
        // the same key appends to the previous list context instead of
        // being ignored or creating a new key. This documents the bug.
        expect(tools).toBeDefined()
        // The inline parse yields ['Read', 'Write'] and then '- Execute'
        // is pushed to currentList which gets flushed. The result depends
        // on what currentListKey is — since the inline branch sets via
        // meta[key] directly without setting currentListKey, the
        // '- Execute' would push to whatever currentList was set
        // previously. In this case currentListKey is null after flushList
        // so it just gets lost. Document actual behavior:
        expect(tools).toEqual(['Read', 'Write'])
      })

      it('documents list block key followed by inline key does not discard block items', () => {
        readdirSyncMock.mockImplementation((p: string) =>
          p === '/mock/home/.github/agents' ? ['bug3b.agent.md'] : []
        )
        // Block list for tools, then another key with inline value
        readFileSyncMock.mockReturnValue(
          '---\nname: Agent\ndescription: test\ntools:\n  - Read\n  - Write\nmodel: gpt-5\n---\nBody'
        )

        const result = manager.listAgents()
        // The block list should be flushed when 'model' key is encountered
        expect(result.copilot[0].tools).toEqual(['Read', 'Write'])
        expect(result.copilot[0].model).toBe('gpt-5')
      })
    })

    it('handles Windows-style \\r\\n line endings', () => {
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['win.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue(
        '---\r\nname: WinAgent\r\ndescription: windows\r\n---\r\nWindows body'
      )

      const result = manager.listAgents()
      expect(result.copilot[0].name).toBe('WinAgent')
      expect(result.copilot[0].description).toBe('windows')
      expect(result.copilot[0].prompt).toBe('Windows body')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // serializeToMarkdown (tested indirectly via createAgent)
  // ──────────────────────────────────────────────────────────────────────────

  describe('serializeToMarkdown (via createAgent)', () => {
    it('serializes basic agent without tools or model', () => {
      const { filePath } = manager.createAgent({
        name: 'Basic Agent',
        description: 'A basic agent',
        cli: 'copilot',
      })

      expect(writeFileSyncMock).toHaveBeenCalledOnce()
      const content = writeFileSyncMock.mock.calls[0][1] as string
      expect(content).toContain('name: Basic Agent')
      expect(content).toContain('description: A basic agent')
      expect(content).not.toContain('model:')
      expect(content).not.toContain('tools:')
      expect(filePath).toContain('.agent.md')
    })

    it('serializes agent with model', () => {
      manager.createAgent({
        name: 'Model Agent',
        description: 'has model',
        model: 'claude-sonnet-4',
        cli: 'copilot',
      })

      const content = writeFileSyncMock.mock.calls[0][1] as string
      expect(content).toContain('model: claude-sonnet-4')
    })

    it('serializes agent with tools as block list', () => {
      manager.createAgent({
        name: 'Tooled',
        description: 'has tools',
        tools: ['Read', 'Write'],
        cli: 'copilot',
      })

      const content = writeFileSyncMock.mock.calls[0][1] as string
      expect(content).toContain('tools:')
      expect(content).toContain('  - Read')
      expect(content).toContain('  - Write')
    })

    it('serializes agent with prompt body', () => {
      manager.createAgent({
        name: 'Prompted',
        description: 'has prompt',
        prompt: 'You are a code reviewer.\nBe thorough.',
        cli: 'copilot',
      })

      const content = writeFileSyncMock.mock.calls[0][1] as string
      expect(content).toContain('You are a code reviewer.\nBe thorough.')
    })

    it('does not include tools line when tools is empty array', () => {
      manager.createAgent({
        name: 'No Tools',
        description: 'empty tools',
        tools: [],
        cli: 'copilot',
      })

      const content = writeFileSyncMock.mock.calls[0][1] as string
      expect(content).not.toContain('tools:')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // slugify (tested indirectly via createAgent file path)
  // ──────────────────────────────────────────────────────────────────────────

  describe('slugify (via createAgent)', () => {
    it('lowercases and replaces spaces with hyphens', () => {
      manager.createAgent({ name: 'My Agent', description: 'd', cli: 'copilot' })
      const path = writeFileSyncMock.mock.calls[0][0] as string
      expect(path).toContain('my-agent.agent.md')
    })

    it('removes special characters', () => {
      manager.createAgent({ name: 'Agent @#$% v2!', description: 'd', cli: 'copilot' })
      const path = writeFileSyncMock.mock.calls[0][0] as string
      expect(path).toContain('agent-v2.agent.md')
    })

    it('strips leading and trailing hyphens', () => {
      manager.createAgent({ name: '---Leading Trail---', description: 'd', cli: 'copilot' })
      const path = writeFileSyncMock.mock.calls[0][0] as string
      expect(path).toContain('leading-trail.agent.md')
    })

    it('truncates to 60 characters', () => {
      const longName = 'a'.repeat(100)
      manager.createAgent({ name: longName, description: 'd', cli: 'copilot' })
      const path = writeFileSyncMock.mock.calls[0][0] as string
      const filename = path.split('/').pop()!
      // slug is max 60 chars + ".agent.md" suffix
      const slug = filename.replace('.agent.md', '')
      expect(slug.length).toBeLessThanOrEqual(60)
    })

    it('falls back to UUID when name produces empty slug', () => {
      randomUUIDMock.mockReturnValue('12345678-aaaa-bbbb-cccc-dddddddddddd')
      manager.createAgent({ name: '!!!', description: 'd', cli: 'copilot' })
      const path = writeFileSyncMock.mock.calls[0][0] as string
      expect(path).toContain('12345678.agent.md')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // scanDirectory (tested indirectly via listAgents)
  // ──────────────────────────────────────────────────────────────────────────

  describe('scanDirectory (via listAgents)', () => {
    it('returns empty when directory does not exist', () => {
      existsSyncMock.mockReturnValue(false)
      const result = manager.listAgents()
      expect(result.copilot).toEqual([])
      expect(result.claude).toEqual([])
    })

    it('skips files that do not match extension filter', () => {
      existsSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? true : false
      )
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['readme.txt', 'notes.md', 'valid.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue(makeAgentMd({ name: 'Valid', description: 'ok' }))

      const result = manager.listAgents()
      expect(result.copilot).toHaveLength(1)
      expect(result.copilot[0].name).toBe('Valid')
    })

    it('skips files that throw on read', () => {
      existsSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? true : false
      )
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['broken.agent.md', 'ok.agent.md'] : []
      )
      readFileSyncMock.mockImplementation((p: string) => {
        if ((p as string).includes('broken')) throw new Error('EACCES')
        return makeAgentMd({ name: 'OK', description: 'fine' })
      })

      const result = manager.listAgents()
      expect(result.copilot).toHaveLength(1)
      expect(result.copilot[0].name).toBe('OK')
    })

    it('returns empty when readdirSync throws', () => {
      existsSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? true : false
      )
      readdirSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.github/agents') throw new Error('EACCES')
        return []
      })

      const result = manager.listAgents()
      expect(result.copilot).toEqual([])
    })

    it('scans both global and project-level copilot directories', () => {
      existsSyncMock.mockImplementation((p: string) =>
        ['/mock/home/.github/agents', '/project/.github/agents'].includes(p)
      )
      readdirSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.github/agents') return ['global.agent.md']
        if (p === '/project/.github/agents') return ['local.agent.md']
        return []
      })
      readFileSyncMock.mockImplementation((p: string) => {
        if ((p as string).includes('global'))
          return makeAgentMd({ name: 'Global', description: 'global agent' })
        return makeAgentMd({ name: 'Local', description: 'local agent' })
      })

      const result = manager.listAgents('/project')
      expect(result.copilot).toHaveLength(2)
      expect(result.copilot.map((a) => a.name)).toEqual(['Global', 'Local'])
    })

    it('scans both global and project-level claude directories', () => {
      existsSyncMock.mockImplementation((p: string) =>
        ['/mock/home/.claude/agents', '/project/.claude/agents'].includes(p)
      )
      readdirSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.claude/agents') return ['global.md']
        if (p === '/project/.claude/agents') return ['local.md']
        return []
      })
      readFileSyncMock.mockImplementation((p: string) => {
        if ((p as string).includes('global'))
          return makeAgentMd({ name: 'Claude Global', description: 'g' })
        return makeAgentMd({ name: 'Claude Local', description: 'l' })
      })

      const result = manager.listAgents('/project')
      expect(result.claude).toHaveLength(2)
      expect(result.claude.map((a) => a.name)).toEqual(['Claude Global', 'Claude Local'])
    })

    it('does not scan project-level copilot agents when workingDir equals homedir', () => {
      existsSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? true : false
      )
      readdirSyncMock.mockReturnValue([])

      manager.listAgents('/mock/home')
      // Only called once for the global dir
      expect(existsSyncMock).toHaveBeenCalledWith('/mock/home/.github/agents')
      // Should NOT be called a second time for project-level since workingDir === homedir
      const copilotCalls = existsSyncMock.mock.calls.filter(
        (c) => c[0] === '/mock/home/.github/agents'
      )
      expect(copilotCalls).toHaveLength(1)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // createAgent
  // ──────────────────────────────────────────────────────────────────────────

  describe('createAgent', () => {
    it('creates a copilot agent file in working directory', () => {
      const result = manager.createAgent(
        { name: 'Review Bot', description: 'Reviews code', cli: 'copilot' },
        '/my/project'
      )

      expect(mkdirSyncMock).toHaveBeenCalledWith('/my/project/.github/agents', { recursive: true })
      expect(result.filePath).toBe('/my/project/.github/agents/review-bot.agent.md')
      expect(result.agentDef.id).toBe('copilot:file:review-bot')
      expect(result.agentDef.source).toBe('file')
      expect(result.agentDef.cli).toBe('copilot')
    })

    it('creates a claude agent file in working directory', () => {
      const result = manager.createAgent(
        { name: 'Planner', description: 'Plans tasks', cli: 'claude' },
        '/my/project'
      )

      expect(mkdirSyncMock).toHaveBeenCalledWith('/my/project/.claude/agents', { recursive: true })
      expect(result.filePath).toBe('/my/project/.claude/agents/planner.md')
      expect(result.agentDef.id).toBe('claude:file:planner')
    })

    it('falls back to homedir when no workingDir is provided (copilot)', () => {
      manager.createAgent({ name: 'Home Agent', description: 'd', cli: 'copilot' })

      expect(mkdirSyncMock).toHaveBeenCalledWith('/mock/home/.github/agents', { recursive: true })
      const path = writeFileSyncMock.mock.calls[0][0] as string
      expect(path).toContain('/mock/home/.github/agents/')
    })

    it('falls back to homedir when no workingDir is provided (claude)', () => {
      manager.createAgent({ name: 'Home Claude', description: 'd', cli: 'claude' })

      expect(mkdirSyncMock).toHaveBeenCalledWith('/mock/home/.claude/agents', { recursive: true })
    })

    it('returns agentDef with all fields propagated', () => {
      const result = manager.createAgent({
        name: 'Full Agent',
        description: 'full description',
        model: 'opus',
        tools: ['Read', 'Write'],
        prompt: 'Be helpful.',
        cli: 'copilot',
      })

      expect(result.agentDef).toMatchObject({
        name: 'Full Agent',
        description: 'full description',
        model: 'opus',
        tools: ['Read', 'Write'],
        prompt: 'Be helpful.',
        source: 'file',
        cli: 'copilot',
      })
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // readAgentFile / writeAgentFile
  // ──────────────────────────────────────────────────────────────────────────

  describe('readAgentFile', () => {
    it('reads file content and returns it', () => {
      readFileSyncMock.mockReturnValue('---\nname: Test\n---\nBody')
      const content = manager.readAgentFile('/some/path/test.agent.md')
      expect(readFileSyncMock).toHaveBeenCalledWith('/some/path/test.agent.md', 'utf8')
      expect(content).toBe('---\nname: Test\n---\nBody')
    })
  })

  describe('writeAgentFile', () => {
    it('writes content to file', () => {
      manager.writeAgentFile('/some/path/test.agent.md', 'new content')
      expect(writeFileSyncMock).toHaveBeenCalledWith('/some/path/test.agent.md', 'new content', 'utf8')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // deleteAgent
  // ──────────────────────────────────────────────────────────────────────────

  describe('deleteAgent', () => {
    it('deletes file when it exists', () => {
      existsSyncMock.mockReturnValue(true)
      manager.deleteAgent('/some/path/test.agent.md')
      expect(unlinkSyncMock).toHaveBeenCalledWith('/some/path/test.agent.md')
    })

    it('does nothing when file does not exist', () => {
      existsSyncMock.mockReturnValue(false)
      manager.deleteAgent('/some/path/nonexistent.agent.md')
      expect(unlinkSyncMock).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // getEnabledAgentIds / setEnabledAgentIds
  // ──────────────────────────────────────────────────────────────────────────

  describe('enabled agent IDs', () => {
    it('getEnabledAgentIds returns stored IDs', () => {
      mockGet.mockImplementation((key: string) =>
        key === 'enabledAgentIds' ? ['copilot:file:review', 'claude:file:planner'] : []
      )
      expect(manager.getEnabledAgentIds()).toEqual(['copilot:file:review', 'claude:file:planner'])
    })

    it('setEnabledAgentIds stores IDs', () => {
      manager.setEnabledAgentIds(['copilot:file:test'])
      expect(mockSet).toHaveBeenCalledWith('enabledAgentIds', ['copilot:file:test'])
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // getActiveAgents / setActiveAgent
  // ──────────────────────────────────────────────────────────────────────────

  describe('active agents', () => {
    it('getActiveAgents returns stored active agents', () => {
      mockGet.mockImplementation((key: string) =>
        key === 'activeAgents' ? { copilot: 'copilot:file:review', claude: null } : undefined
      )
      expect(manager.getActiveAgents()).toEqual({ copilot: 'copilot:file:review', claude: null })
    })

    it('setActiveAgent updates copilot active agent', () => {
      mockGet.mockImplementation((key: string) =>
        key === 'activeAgents' ? { copilot: null, claude: null } : undefined
      )
      manager.setActiveAgent('copilot', 'copilot:file:review')
      expect(mockSet).toHaveBeenCalledWith('activeAgents', {
        copilot: 'copilot:file:review',
        claude: null,
      })
    })

    it('setActiveAgent updates claude active agent', () => {
      mockGet.mockImplementation((key: string) =>
        key === 'activeAgents' ? { copilot: 'copilot:file:xyz', claude: null } : undefined
      )
      manager.setActiveAgent('claude', 'claude:file:planner')
      expect(mockSet).toHaveBeenCalledWith('activeAgents', {
        copilot: 'copilot:file:xyz',
        claude: 'claude:file:planner',
      })
    })

    it('setActiveAgent can clear active agent with null', () => {
      mockGet.mockImplementation((key: string) =>
        key === 'activeAgents' ? { copilot: 'copilot:file:old', claude: null } : undefined
      )
      manager.setActiveAgent('copilot', null)
      expect(mockSet).toHaveBeenCalledWith('activeAgents', {
        copilot: null,
        claude: null,
      })
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Profiles
  // ──────────────────────────────────────────────────────────────────────────

  describe('profiles', () => {
    it('getProfiles returns stored profiles', () => {
      const profiles = [
        { id: '1', name: 'Profile A', enabledAgentIds: ['a'], createdAt: 1000 },
      ]
      mockGet.mockImplementation((key: string) =>
        key === 'profiles' ? profiles : undefined
      )
      expect(manager.getProfiles()).toEqual(profiles)
    })

    it('saveProfile creates new profile with UUID', () => {
      randomUUIDMock.mockReturnValue('new-uuid-1234-5678-abcdefabcdef')
      mockGet.mockImplementation((key: string) =>
        key === 'profiles' ? [] : undefined
      )

      const profile = manager.saveProfile('Dev Mode', ['agent1', 'agent2'])

      expect(profile.name).toBe('Dev Mode')
      expect(profile.enabledAgentIds).toEqual(['agent1', 'agent2'])
      expect(profile.id).toBe('new-uuid-1234-5678-abcdefabcdef')
      expect(typeof profile.createdAt).toBe('number')
      expect(mockSet).toHaveBeenCalledWith('profiles', [profile])
    })

    it('saveProfile updates existing profile when name matches', () => {
      const existing = {
        id: 'existing-uuid',
        name: 'Existing',
        enabledAgentIds: ['old-agent'],
        createdAt: 1000,
      }
      mockGet.mockImplementation((key: string) =>
        key === 'profiles' ? [existing] : undefined
      )

      const result = manager.saveProfile('Existing', ['new-agent-1', 'new-agent-2'])

      expect(result.id).toBe('existing-uuid')
      expect(result.enabledAgentIds).toEqual(['new-agent-1', 'new-agent-2'])
      // Should update in place, not append
      expect(mockSet).toHaveBeenCalledWith('profiles', [
        expect.objectContaining({ id: 'existing-uuid', enabledAgentIds: ['new-agent-1', 'new-agent-2'] }),
      ])
    })

    it('applyProfile sets enabledAgentIds from profile and returns them', () => {
      const profile = {
        id: 'profile-1',
        name: 'Test',
        enabledAgentIds: ['a1', 'a2'],
        createdAt: 1000,
      }
      mockGet.mockImplementation((key: string) =>
        key === 'profiles' ? [profile] : undefined
      )

      const result = manager.applyProfile('profile-1')
      expect(result).toEqual(['a1', 'a2'])
      expect(mockSet).toHaveBeenCalledWith('enabledAgentIds', ['a1', 'a2'])
    })

    it('applyProfile returns null when profile does not exist', () => {
      mockGet.mockImplementation((key: string) =>
        key === 'profiles' ? [] : undefined
      )

      const result = manager.applyProfile('nonexistent')
      expect(result).toBeNull()
      expect(mockSet).not.toHaveBeenCalled()
    })

    it('deleteProfile removes profile by ID', () => {
      const profiles = [
        { id: 'keep', name: 'Keep', enabledAgentIds: [], createdAt: 1000 },
        { id: 'delete-me', name: 'Delete', enabledAgentIds: [], createdAt: 2000 },
      ]
      mockGet.mockImplementation((key: string) =>
        key === 'profiles' ? profiles : undefined
      )

      manager.deleteProfile('delete-me')
      expect(mockSet).toHaveBeenCalledWith('profiles', [
        expect.objectContaining({ id: 'keep' }),
      ])
    })

    it('deleteProfile is a no-op when ID does not exist', () => {
      mockGet.mockImplementation((key: string) =>
        key === 'profiles' ? [{ id: 'exists', name: 'X', enabledAgentIds: [], createdAt: 1 }] : undefined
      )

      manager.deleteProfile('ghost')
      expect(mockSet).toHaveBeenCalledWith('profiles', [
        expect.objectContaining({ id: 'exists' }),
      ])
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // listAgents — integration-level
  // ──────────────────────────────────────────────────────────────────────────

  describe('listAgents', () => {
    it('returns empty arrays when no directories exist', () => {
      existsSyncMock.mockReturnValue(false)
      const result = manager.listAgents()
      expect(result).toEqual({ copilot: [], claude: [] })
    })

    it('separates copilot and claude agents correctly', () => {
      existsSyncMock.mockImplementation((p: string) =>
        ['/mock/home/.github/agents', '/mock/home/.claude/agents'].includes(p)
      )
      readdirSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.github/agents') return ['copilot-agent.agent.md']
        if (p === '/mock/home/.claude/agents') return ['claude-agent.md']
        return []
      })
      readFileSyncMock.mockImplementation((p: string) => {
        if ((p as string).includes('copilot-agent'))
          return makeAgentMd({ name: 'Copilot Agent', description: 'cp' })
        return makeAgentMd({ name: 'Claude Agent', description: 'cl' })
      })

      const result = manager.listAgents()
      expect(result.copilot).toHaveLength(1)
      expect(result.copilot[0].cli).toBe('copilot')
      expect(result.claude).toHaveLength(1)
      expect(result.claude[0].cli).toBe('claude')
    })

    it('generates correct IDs from filenames', () => {
      existsSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? true : false
      )
      readdirSyncMock.mockImplementation((p: string) =>
        p === '/mock/home/.github/agents' ? ['my-review-bot.agent.md'] : []
      )
      readFileSyncMock.mockReturnValue(makeAgentMd({ name: 'Review Bot', description: 'd' }))

      const result = manager.listAgents()
      expect(result.copilot[0].id).toBe('copilot:file:my-review-bot')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Store lazy initialization
  // ──────────────────────────────────────────────────────────────────────────

  describe('store initialization', () => {
    it('lazily creates Store on first access', () => {
      mockStoreConstructor.mockClear()
      mockGet.mockReturnValue([])

      const mgr = new AgentManager()
      expect(mockStoreConstructor).not.toHaveBeenCalled()

      mgr.getEnabledAgentIds()
      expect(mockStoreConstructor).toHaveBeenCalledOnce()
      expect(mockStoreConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'clear-path-agents',
          encryptionKey: 'test-key',
        })
      )
    })

    it('reuses same Store instance on subsequent access', () => {
      mockStoreConstructor.mockClear()
      mockGet.mockReturnValue([])

      const mgr = new AgentManager()
      mgr.getEnabledAgentIds()
      mgr.getEnabledAgentIds()
      mgr.getProfiles()

      expect(mockStoreConstructor).toHaveBeenCalledOnce()
    })
  })
})
