import type { FlagDef } from '../../types/settings'

// ── Copilot CLI Flags ───────────────────────────────────────────────────────

export const COPILOT_FLAGS: FlagDef[] = [
  // Mode & Behavior
  { key: 'experimental', flag: '--experimental', label: 'Experimental', description: 'Enable experimental features (autopilot, alt-screen, dynamic retrieval)', type: 'boolean', category: 'Mode & Behavior', cli: 'copilot' },
  { key: 'prompt', flag: '--prompt / -p', label: 'Prompt Mode', description: 'Non-interactive/headless mode. Process single prompt and exit', type: 'boolean', category: 'Mode & Behavior', cli: 'copilot' },
  { key: 'acp', flag: '--acp', label: 'ACP Server', description: 'Start as Agent Client Protocol server for SDK integration', type: 'boolean', category: 'Mode & Behavior', cli: 'copilot' },
  { key: 'banner', flag: '--banner', label: 'Show Banner', description: 'Show the startup banner', type: 'boolean', category: 'Mode & Behavior', cli: 'copilot' },

  // Session Management
  { key: 'resume', flag: '--resume', label: 'Resume Session', description: 'Continue previous session or task. Opens picker if no ID', type: 'string', category: 'Session Management', cli: 'copilot' },
  { key: 'continue', flag: '--continue', label: 'Continue Last', description: 'Resume most recently closed session without picker', type: 'boolean', category: 'Session Management', cli: 'copilot' },
  { key: 'configDir', flag: '--config-dir', label: 'Config Directory', description: 'Override default config directory (~/.copilot)', type: 'string', category: 'Session Management', cli: 'copilot' },

  // Tool & Permission Control
  { key: 'yolo', flag: '--yolo', label: 'YOLO Mode', description: 'Auto-approve ALL tool permissions for session', type: 'boolean', category: 'Tool & Permission Control', cli: 'copilot' },
  { key: 'allowAll', flag: '--allow-all', label: 'Allow All', description: 'Enable all permissions at once', type: 'boolean', category: 'Tool & Permission Control', cli: 'copilot' },
  { key: 'allowAllTools', flag: '--allow-all-tools', label: 'Allow All Tools', description: 'Auto-approve all file system paths in prompt mode', type: 'boolean', category: 'Tool & Permission Control', cli: 'copilot' },
  { key: 'allowedTools', flag: '--allow-tool', label: 'Allowed Tools', description: 'Allow specific tool patterns (repeatable)', type: 'tags', category: 'Tool & Permission Control', cli: 'copilot' },
  { key: 'deniedTools', flag: '--deny-tool', label: 'Denied Tools', description: 'Deny specific tool patterns. Overrides allow rules', type: 'tags', category: 'Tool & Permission Control', cli: 'copilot' },
  { key: 'availableTools', flag: '--available-tools', label: 'Available Tools', description: 'Filter which tools model can use. Supports glob patterns', type: 'tags', category: 'Tool & Permission Control', cli: 'copilot' },
  { key: 'excludedTools', flag: '--excluded-tools', label: 'Excluded Tools', description: 'Exclude specific tools from use', type: 'tags', category: 'Tool & Permission Control', cli: 'copilot' },

  // Model Configuration
  { key: 'model', flag: '--model', label: 'Model', description: 'Specify AI model', type: 'string', category: 'Model Configuration', cli: 'copilot' },
  { key: 'agent', flag: '--agent', label: 'Agent', description: 'Invoke a custom agent', type: 'string', category: 'Model Configuration', cli: 'copilot' },

  // UI & Accessibility
  { key: 'altScreen', flag: '--alt-screen', label: 'Alt Screen', description: 'Alternate screen buffer mode', type: 'enum', enumValues: ['on', 'off'], category: 'UI & Accessibility', cli: 'copilot' },
  { key: 'screenReader', flag: '--screen-reader', label: 'Screen Reader', description: 'Accessibility optimizations for screen readers', type: 'boolean', category: 'UI & Accessibility', cli: 'copilot' },
  { key: 'streamerMode', flag: '--streamer-mode', label: 'Streamer Mode', description: 'Hide preview model names and quota details', type: 'boolean', category: 'UI & Accessibility', cli: 'copilot' },

  // MCP & Extensions
  { key: 'enableAllGithubMcpTools', flag: '--enable-all-github-mcp-tools', label: 'All GitHub MCP Tools', description: 'Enable full suite of GitHub MCP tools including write operations', type: 'boolean', category: 'MCP & Extensions', cli: 'copilot' },
  { key: 'mcpConfig', flag: '--additional-mcp-config', label: 'Additional MCP Config', description: 'Add MCP servers for single session', type: 'string', category: 'MCP & Extensions', cli: 'copilot' },
  { key: 'disableBuiltinMcps', flag: '--disable-builtin-mcps', label: 'Disable Built-in MCPs', description: 'Disable all built-in MCP servers', type: 'boolean', category: 'MCP & Extensions', cli: 'copilot' },
  { key: 'disableMcpServer', flag: '--disable-mcp-server', label: 'Disable MCP Server', description: 'Disable specific built-in MCP server by name', type: 'string', category: 'MCP & Extensions', cli: 'copilot' },
  { key: 'pluginDir', flag: '--plugin-dir', label: 'Plugin Directory', description: 'Load plugin from local directory', type: 'string', category: 'MCP & Extensions', cli: 'copilot' },

  // Output & Logging
  { key: 'outputFormat', flag: '--output-format', label: 'Output Format', description: 'Output format: json (JSONL for programmatic use)', type: 'enum', enumValues: ['json'], category: 'Output & Logging', cli: 'copilot' },
  { key: 'saveGist', flag: '--save-gist', label: 'Save Gist', description: 'Save session as GitHub gist (non-interactive)', type: 'boolean', category: 'Output & Logging', cli: 'copilot' },
  { key: 'stream', flag: '--stream', label: 'Stream', description: 'Controls token-by-token streaming', type: 'boolean', category: 'Output & Logging', cli: 'copilot' },
  { key: 'bashEnv', flag: '--bash-env', label: 'Bash Env', description: 'Source BASH_ENV file in shell sessions', type: 'boolean', category: 'Output & Logging', cli: 'copilot' },
]

// ── Claude Code CLI Flags ───────────────────────────────────────────────────

export const CLAUDE_FLAGS: FlagDef[] = [
  // Session Management
  { key: 'continue', flag: '--continue / -c', label: 'Continue', description: 'Continue most recent conversation in current directory', type: 'boolean', category: 'Session Management', cli: 'claude' },
  { key: 'resume', flag: '--resume / -r', label: 'Resume', description: 'Resume specific session by ID/name, or show picker', type: 'string', category: 'Session Management', cli: 'claude' },
  { key: 'fromPr', flag: '--from-pr', label: 'From PR', description: 'Resume sessions linked to specific GitHub PR', type: 'string', category: 'Session Management', cli: 'claude' },
  { key: 'forkSession', flag: '--fork-session', label: 'Fork Session', description: 'Create new session ID when resuming', type: 'boolean', category: 'Session Management', cli: 'claude' },
  { key: 'sessionId', flag: '--session-id', label: 'Session ID', description: 'Use specific session ID (must be valid UUID)', type: 'string', category: 'Session Management', cli: 'claude' },
  { key: 'noSessionPersistence', flag: '--no-session-persistence', label: 'No Persistence', description: 'Disable session persistence (print mode only)', type: 'boolean', category: 'Session Management', cli: 'claude' },
  { key: 'remote', flag: '--remote', label: 'Remote', description: 'Create new web session on claude.ai', type: 'boolean', category: 'Session Management', cli: 'claude' },
  { key: 'teleport', flag: '--teleport', label: 'Teleport', description: 'Resume web session in local terminal', type: 'boolean', category: 'Session Management', cli: 'claude' },
  { key: 'name', flag: '-n / --name', label: 'Session Name', description: 'Set display name for session at startup', type: 'string', category: 'Session Management', cli: 'claude' },

  // Model & Configuration
  { key: 'model', flag: '--model', label: 'Model', description: 'Set model: sonnet, opus, haiku or full ID', type: 'string', category: 'Model & Configuration', cli: 'claude' },
  { key: 'fallbackModel', flag: '--fallback-model', label: 'Fallback Model', description: 'Auto-fallback model when default is overloaded (print mode)', type: 'string', category: 'Model & Configuration', cli: 'claude' },
  { key: 'betas', flag: '--betas', label: 'Beta Headers', description: 'Beta headers for API requests (API key users only)', type: 'string', category: 'Model & Configuration', cli: 'claude' },

  // Permissions & Security
  { key: 'permissionMode', flag: '--permission-mode', label: 'Permission Mode', description: 'Permission mode for tool access', type: 'enum', enumValues: ['default', 'plan', 'acceptEdits', 'bypassPermissions', 'auto'], category: 'Permissions & Security', cli: 'claude' },
  { key: 'allowedTools', flag: '--allowedTools', label: 'Allowed Tools', description: 'Tools that execute without prompting', type: 'tags', category: 'Permissions & Security', cli: 'claude' },
  { key: 'disallowedTools', flag: '--disallowedTools', label: 'Disallowed Tools', description: 'Tools removed from model context entirely', type: 'tags', category: 'Permissions & Security', cli: 'claude' },
  { key: 'tools', flag: '--tools', label: 'Tools', description: 'Restrict built-in tools (empty string to disable all)', type: 'string', category: 'Permissions & Security', cli: 'claude' },
  { key: 'permissionPromptTool', flag: '--permission-prompt-tool', label: 'Permission Prompt Tool', description: 'MCP tool to handle permission prompts in non-interactive mode', type: 'string', category: 'Permissions & Security', cli: 'claude' },
  { key: 'dangerouslySkipPermissions', flag: '--dangerously-skip-permissions', label: 'Skip Permissions', description: 'Skip ALL permission prompts (extreme caution)', type: 'boolean', category: 'Permissions & Security', cli: 'claude' },

  // Output & Format
  { key: 'print', flag: '--print / -p', label: 'Print Mode', description: 'Non-interactive headless/SDK mode', type: 'boolean', category: 'Output & Format', cli: 'claude' },
  { key: 'outputFormat', flag: '--output-format', label: 'Output Format', description: 'Output format', type: 'enum', enumValues: ['text', 'json', 'stream-json'], category: 'Output & Format', cli: 'claude' },
  { key: 'inputFormat', flag: '--input-format', label: 'Input Format', description: 'Input format', type: 'enum', enumValues: ['text', 'stream-json'], category: 'Output & Format', cli: 'claude' },
  { key: 'jsonSchema', flag: '--json-schema', label: 'JSON Schema', description: 'Get validated JSON matching schema (print mode)', type: 'string', category: 'Output & Format', cli: 'claude' },
  { key: 'includePartialMessages', flag: '--include-partial-messages', label: 'Include Partial Messages', description: 'Include partial streaming events', type: 'boolean', category: 'Output & Format', cli: 'claude' },
  { key: 'verbose', flag: '--verbose', label: 'Verbose', description: 'Verbose logging with full turn-by-turn output', type: 'boolean', category: 'Output & Format', cli: 'claude' },

  // System Prompt
  { key: 'systemPrompt', flag: '--system-prompt', label: 'System Prompt', description: 'Replace entire system prompt', type: 'string', category: 'System Prompt', cli: 'claude' },
  { key: 'systemPromptFile', flag: '--system-prompt-file', label: 'System Prompt File', description: 'Load system prompt from file (print mode)', type: 'string', category: 'System Prompt', cli: 'claude' },
  { key: 'appendSystemPrompt', flag: '--append-system-prompt', label: 'Append System Prompt', description: 'Append to default system prompt', type: 'string', category: 'System Prompt', cli: 'claude' },
  { key: 'appendSystemPromptFile', flag: '--append-system-prompt-file', label: 'Append Prompt File', description: 'Append file contents to default prompt (print mode)', type: 'string', category: 'System Prompt', cli: 'claude' },

  // Agent & Sub-Agent
  { key: 'agent', flag: '--agent', label: 'Agent', description: 'Specify agent for session', type: 'string', category: 'Agent & Sub-Agent', cli: 'claude' },
  { key: 'teammateMode', flag: '--teammate-mode', label: 'Teammate Mode', description: 'Agent team display mode', type: 'enum', enumValues: ['auto', 'in-process', 'tmux'], category: 'Agent & Sub-Agent', cli: 'claude' },

  // MCP & Plugins
  { key: 'mcpConfig', flag: '--mcp-config', label: 'MCP Config', description: 'Load MCP servers from JSON file or string', type: 'string', category: 'MCP & Plugins', cli: 'claude' },
  { key: 'strictMcpConfig', flag: '--strict-mcp-config', label: 'Strict MCP Config', description: 'Only use MCP servers from --mcp-config, ignore others', type: 'boolean', category: 'MCP & Plugins', cli: 'claude' },
  { key: 'pluginDir', flag: '--plugin-dir', label: 'Plugin Directory', description: 'Load plugins from directory (repeatable)', type: 'string', category: 'MCP & Plugins', cli: 'claude' },

  // Directory & Workspace
  { key: 'additionalDirs', flag: '--add-dir', label: 'Additional Directories', description: 'Add additional working directories', type: 'tags', category: 'Directory & Workspace', cli: 'claude' },
  { key: 'worktree', flag: '--worktree / -w', label: 'Worktree', description: 'Start in isolated git worktree (branched from HEAD)', type: 'boolean', category: 'Directory & Workspace', cli: 'claude' },

  // Budget & Limits
  { key: 'maxBudget', flag: '--max-budget-usd', label: 'Max Budget ($)', description: 'Maximum dollar amount before stopping (print mode)', type: 'number', category: 'Budget & Limits', cli: 'claude' },
  { key: 'maxTurns', flag: '--max-turns', label: 'Max Turns', description: 'Limit agentic turns (print mode)', type: 'number', category: 'Budget & Limits', cli: 'claude' },

  // Integration
  { key: 'chrome', flag: '--chrome / --no-chrome', label: 'Chrome', description: 'Enable/disable Chrome browser integration', type: 'boolean', category: 'Integration', cli: 'claude' },
  { key: 'ide', flag: '--ide', label: 'IDE', description: 'Auto-connect to IDE on startup', type: 'boolean', category: 'Integration', cli: 'claude' },

  // Debug & Diagnostics
  { key: 'debug', flag: '--debug', label: 'Debug', description: 'Debug mode with optional category filter (e.g., "api,hooks")', type: 'string', category: 'Debug & Diagnostics', cli: 'claude' },

  // Settings Override
  { key: 'settings', flag: '--settings', label: 'Settings Override', description: 'Path to settings JSON or JSON string', type: 'string', category: 'Settings Override', cli: 'claude' },
  { key: 'settingSources', flag: '--setting-sources', label: 'Setting Sources', description: 'Sources to load: user, project, local', type: 'tags', category: 'Settings Override', cli: 'claude' },
  { key: 'disableSlashCommands', flag: '--disable-slash-commands', label: 'Disable Slash Commands', description: 'Disable all skills and slash commands', type: 'boolean', category: 'Settings Override', cli: 'claude' },

  // Init / Maintenance
  { key: 'init', flag: '--init', label: 'Init', description: 'Run initialization hooks + start interactive mode', type: 'boolean', category: 'Debug & Diagnostics', cli: 'claude' },
  { key: 'initOnly', flag: '--init-only', label: 'Init Only', description: 'Run init hooks and exit (no interactive session)', type: 'boolean', category: 'Debug & Diagnostics', cli: 'claude' },
  { key: 'maintenance', flag: '--maintenance', label: 'Maintenance', description: 'Run maintenance hooks and exit', type: 'boolean', category: 'Debug & Diagnostics', cli: 'claude' },
]

export function getFlagsForCli(cli: 'copilot' | 'claude'): FlagDef[] {
  return cli === 'copilot' ? COPILOT_FLAGS : CLAUDE_FLAGS
}

export function getCategoriesForCli(cli: 'copilot' | 'claude'): string[] {
  const flags = getFlagsForCli(cli)
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const f of flags) {
    if (!seen.has(f.category)) {
      seen.add(f.category)
      ordered.push(f.category)
    }
  }
  return ordered
}
