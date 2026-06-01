// ── Policy → permission profile, and tool classification ──────────────────────
// Pure, dependency-free logic (no Electron / fs) so it can be unit-tested in
// isolation. The PermissionBroker calls these to turn the active Policy preset
// into per-tool-class defaults and to classify an incoming tool request.

import type {
  PermissionProfile,
  ToolClass,
  ToolBehavior,
} from '../../shared/permissions/types'

/** The subset of the active-policy IPC payload this module needs. */
export interface ActivePolicy {
  activePresetId: string
  presetName: string
  rules: {
    blockedTools?: string[]
    blockedFilePatterns?: string[]
    requiredPermissionMode?: string | null
  }
}

/** Secret-ish files denied for any file-touching tool, even if policy adds none. */
export const DEFAULT_BLOCKED_FILE_PATTERNS = [
  '.env*', '*.pem', '*.key', '*credentials*', '*secret*', 'config/production.*',
]

const ALLOW_ALL: Record<ToolClass, ToolBehavior> = {
  read: 'allow', edit: 'allow', shell: 'allow', mcp: 'allow', other: 'allow',
}
const PROMPT_ALL: Record<ToolClass, ToolBehavior> = {
  read: 'prompt', edit: 'prompt', shell: 'prompt', mcp: 'prompt', other: 'prompt',
}
// Standard: reads are safe and frequent (incl. reading attached files) → allow;
// anything that can change state or reach out → prompt.
const STANDARD: Record<ToolClass, ToolBehavior> = {
  read: 'allow', edit: 'prompt', shell: 'prompt', mcp: 'prompt', other: 'prompt',
}

/**
 * Build the per-class default behaviour for the active policy. Keyed first on the
 * built-in preset ids, then inferred from `requiredPermissionMode` so custom
 * presets still get a sensible profile.
 */
export function permissionProfileForPolicy(policy: ActivePolicy): PermissionProfile {
  const byClass = resolveByClass(policy)
  const blockedFilePatterns = Array.from(
    new Set([...(policy.rules.blockedFilePatterns ?? []), ...DEFAULT_BLOCKED_FILE_PATTERNS]),
  )
  return {
    policyId: policy.activePresetId,
    policyName: policy.presetName,
    byClass,
    blockedTools: policy.rules.blockedTools ?? [],
    blockedFilePatterns,
  }
}

function resolveByClass(policy: ActivePolicy): Record<ToolClass, ToolBehavior> {
  switch (policy.activePresetId) {
    case 'policy-unrestricted': return { ...ALLOW_ALL }
    case 'policy-cautious':     return { ...PROMPT_ALL }
    case 'policy-standard':     return { ...STANDARD }
    default: break
  }
  // Custom preset — infer from the required permission mode.
  const mode = (policy.rules.requiredPermissionMode ?? '').toLowerCase()
  if (mode === 'bypasspermissions' || mode === 'yolo' || mode === 'allow-all' || mode === 'allow-all-tools') {
    return { ...ALLOW_ALL }
  }
  if (mode === 'plan') {
    // Read-only working mode: reads allowed, everything mutating denied.
    return { read: 'allow', edit: 'deny', shell: 'deny', mcp: 'prompt', other: 'prompt' }
  }
  // 'default' / 'acceptedits' / null → Standard-like (broker is authoritative;
  // we intentionally do NOT auto-accept edits — they route through the prompt).
  return { ...STANDARD }
}

// ── Tool classification ───────────────────────────────────────────────────────

const CLAUDE_READ = new Set(['read', 'glob', 'grep', 'ls', 'notebookread', 'webfetch', 'websearch'])
const CLAUDE_EDIT = new Set(['edit', 'write', 'multiedit', 'notebookedit', 'applypatch'])

/**
 * Classify a tool request into a coarse class. Handles both Claude tool names
 * (e.g. "Read", "Bash", "mcp__github__create_issue") and Copilot's
 * action-style names (e.g. "shell", "shell(git status)", "write",
 * "MyMCP(create_issue)").
 */
export function classifyTool(toolName: string): ToolClass {
  const raw = (toolName ?? '').trim()
  if (!raw) return 'other'
  const lower = raw.toLowerCase()
  // Head token before any "(" — "shell(git status)" → "shell".
  const head = lower.split('(')[0].trim()

  // MCP tools: Claude "mcp__server__tool" or Copilot "Server(tool)".
  if (head.startsWith('mcp__')) return 'mcp'

  if (head === 'bash' || head === 'shell' || head === 'execute' || head === 'run' || head === 'terminal') return 'shell'
  // Copilot's write-ish tools (it reports the sub-command as the tool name):
  // create / str_replace / insert / edit_file / etc.
  if (
    CLAUDE_EDIT.has(head) || head === 'write' || head === 'edit' || head === 'apply_patch' ||
    head === 'create' || head === 'create_file' || head === 'write_file' || head === 'edit_file' ||
    head === 'str_replace' || head === 'str_replace_editor' || head === 'insert' ||
    head === 'update_file' || head === 'save_file' || head === 'delete_file' || head === 'remove'
  ) return 'edit'
  if (
    CLAUDE_READ.has(head) || head === 'read' || head === 'fetch' || head === 'view' || head === 'search' ||
    head === 'web_fetch' || head === 'open' || head === 'cat' || head === 'list' || head === 'find'
  ) return 'read'

  // Copilot "Server(tool)" form that isn't a known built-in head → treat as MCP.
  if (raw.includes('(') && !['shell', 'write', 'read'].includes(head)) return 'mcp'

  return 'other'
}

/**
 * Does a glob-ish pattern (e.g. ".env*", "config/production.*") match a path?
 * Mirrors complianceHandlers' matcher: `*`→`.*`, `?`→`.`, case-insensitive,
 * tested against both the full path and its basename.
 */
export function fileMatchesPattern(path: string, pattern: string): boolean {
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i')
  const base = path.split(/[/\\]/).pop() ?? path
  return re.test(path) || re.test(base)
}

/** True if any blocked pattern matches the path. */
export function isFileBlocked(path: string, patterns: string[]): boolean {
  return patterns.some((p) => fileMatchesPattern(path, p))
}

/** Simple tool-pattern match for blockedTools (e.g. "shell(rm -rf:*)"). */
export function toolMatchesBlocked(toolName: string, input: unknown, blocked: string[]): boolean {
  const lowerName = (toolName ?? '').toLowerCase()
  const cmd = extractCommand(input)?.toLowerCase() ?? ''
  for (const pat of blocked) {
    const p = pat.toLowerCase()
    // Bare head, e.g. "shell" / "bash" blocks all shell.
    if (!p.includes('(')) {
      if (lowerName === p || lowerName.startsWith(p + '(')) return true
      continue
    }
    // "shell(<expr>)" — match the inner expr (with trailing :* wildcard) against
    // either the toolName's own parenthetical or the command in the input.
    const inner = p.slice(p.indexOf('(') + 1, p.lastIndexOf(')')).replace(/:\*$/, '').trim()
    if (!inner) continue
    const hay = lowerName.includes('(')
      ? lowerName.slice(lowerName.indexOf('(') + 1, lowerName.lastIndexOf(')'))
      : cmd
    if (hay.includes(inner)) return true
  }
  return false
}

/** Classify a tool call into an activity kind for the session activity log. */
export function activityKind(toolClass: ToolClass, target?: string): 'read' | 'write' | 'fetch' | 'shell' | 'tool' {
  if (target && /^https?:\/\//i.test(target)) return 'fetch'
  if (toolClass === 'read') return 'read'
  if (toolClass === 'edit') return 'write'
  if (toolClass === 'shell') return 'shell'
  return 'tool'
}

// Keys that are tool METADATA, not the target the tool acts on — never treat
// these as the path/url even though some (cwd) are path-like.
const META_KEYS = new Set([
  'cwd', 'sessionid', 'session_id', 'timestamp', 'toolname', 'tool', 'name', 'type',
  'behavior', 'permissiondecision', 'reason', 'message', 'id',
])
// Argument keys that hold the path / url / command, in priority order. Covers
// Claude (file_path, command, url) and Copilot (path, target_file, …) shapes.
const TARGET_KEYS = [
  'command', 'cmd', 'script', 'url', 'uri', 'href', 'path', 'file_path', 'filepath',
  'target_file', 'targetfile', 'file', 'filename', 'filepath', 'notebook_path', 'directory', 'dir', 'target',
]

/**
 * Pull the path / url / command a tool acts on out of its (possibly unknown-shape)
 * input object. Copilot's preToolUse args don't use a fixed key, so after the
 * known keys we recursively scan non-metadata string values for the first
 * path-like or url-like value. Used for the prompt preview, the blocked-file
 * check, and the session activity target.
 */
export function extractCommand(input: unknown): string | undefined {
  return findTarget(input, 0)
}

function findTarget(input: unknown, depth: number): string | undefined {
  if (typeof input === 'string') return input || undefined
  if (!input || typeof input !== 'object' || depth > 4) return undefined
  const o = input as Record<string, unknown>
  const lowerToActual: Record<string, string> = {}
  for (const k of Object.keys(o)) lowerToActual[k.toLowerCase()] = k

  // 1. Known target keys, in priority order.
  for (const key of TARGET_KEYS) {
    const actual = lowerToActual[key]
    if (actual) { const v = o[actual]; if (typeof v === 'string' && v.trim()) return v }
  }
  // 2. Fallback: first non-metadata string that looks like a path or URL, then
  //    recurse into nested objects/arrays (Copilot nests args under toolArgs).
  for (const [k, v] of Object.entries(o)) {
    if (META_KEYS.has(k.toLowerCase())) continue
    if (typeof v === 'string' && (v.includes('/') || v.includes('\\') || /^https?:/i.test(v))) return v
    if (v && typeof v === 'object') { const nested = findTarget(v, depth + 1); if (nested) return nested }
  }
  return undefined
}
