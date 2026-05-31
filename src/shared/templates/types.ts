// ── Prompt Templates — shared types ───────────────────────────────────────────
// Shared between main and renderer via the `rootDirs` virtual merge configured
// in tsconfig.main.json / tsconfig.renderer.json (same mechanism as
// src/shared/files/types.ts and src/shared/tokenization/types.ts).
// Must remain dependency-free (no Node, no Electron, no React imports).

/**
 * The kind of value a template variable collects, which also decides HOW the
 * filled value flows into the launch:
 *
 *  • Inline types — substituted as a string into the prompt body:
 *      text · longtext · select · directory · file
 *    (`directory`/`file` ALSO patch the session — see below.)
 *
 *  • Config types — they do NOT appear in the prompt text; they patch the
 *    session being launched:
 *      model · agent · skill · note · permissionMode
 *
 * `file`/`directory` are dual: they inline the (validated, relative) path into
 * the prompt AND contribute to the patch (`pickedFiles` / `additionalDirs`).
 */
export type VariableType =
  | 'text'
  | 'longtext'
  | 'select'
  | 'directory'
  | 'file'
  | 'model'
  | 'agent'
  | 'skill'
  | 'note'
  | 'permissionMode'

export const VARIABLE_TYPES: readonly VariableType[] = [
  'text',
  'longtext',
  'select',
  'directory',
  'file',
  'model',
  'agent',
  'skill',
  'note',
  'permissionMode',
] as const

/** Config-type variables patch the session instead of the prompt text. */
export const CONFIG_VARIABLE_TYPES: readonly VariableType[] = [
  'model',
  'agent',
  'skill',
  'note',
  'permissionMode',
] as const

/** Variable types that can only be applied when a session is being created. */
export const LAUNCH_ONLY_VARIABLE_TYPES: readonly VariableType[] = [
  'agent',
  'permissionMode',
] as const

/** Variable types that naturally accept more than one value. */
export const MULTI_CAPABLE_VARIABLE_TYPES: readonly VariableType[] = [
  'file',
  'note',
  'skill',
] as const

export function isConfigVariable(type: VariableType): boolean {
  return CONFIG_VARIABLE_TYPES.includes(type)
}

export function isLaunchOnlyVariable(type: VariableType): boolean {
  return LAUNCH_ONLY_VARIABLE_TYPES.includes(type)
}

/**
 * A single fill-in slot in a template. `name` + `type` + `options` are the
 * source-of-truth derived from the body annotation `{{NAME:type}}`; the
 * remaining fields (`label`/`required`/`multiple`/`default`) are authored in
 * the structured editor and persisted alongside the body (they can't be
 * expressed inline without a brittle DSL).
 */
export interface TemplateVariable {
  name: string
  type: VariableType
  label?: string
  required?: boolean
  multiple?: boolean
  /** Only meaningful for `type: 'select'`. */
  options?: string[]
  default?: string
}

export interface PromptTemplate {
  id: string
  name: string
  category: string
  description: string
  body: string
  recommendedModel?: string
  recommendedPermissionMode?: string
  complexity: 'low' | 'medium' | 'high'
  variables: TemplateVariable[]
  source: 'builtin' | 'user'
  folder?: string
  usageCount: number
  totalCost: number
  lastUsedAt?: number
  createdAt: number
}

export interface TemplateUsageStat {
  templateId: string
  name: string
  category: string
  usageCount: number
  avgCost: number
  totalCost: number
  lastUsedAt?: number
}

/**
 * The result of hydrating a template: the prompt text (inline variables
 * substituted) plus a session patch carrying everything the config-type
 * variables resolved to. Consumers merge `patch` into the launch options
 * (or apply the mid-session subset).
 */
export interface TemplatePatch {
  model?: string
  agent?: string
  permissionMode?: string
  attachedSkills?: { id: string; name: string }[]
  attachedNotes?: string[]
  /** Files the user picked; staged into the workspace at launch (same shape
   *  the launchpad's file chip produces). */
  pickedFiles?: { sourcePath: string; name: string; sizeBytes: number }[]
  additionalDirs?: string[]
}

export interface HydratedTemplate {
  prompt: string
  patch: TemplatePatch
}

export const TEMPLATE_CATEGORIES = [
  'Code Review',
  'Bug Fix',
  'Refactor',
  'Testing',
  'Documentation',
  'Architecture',
  'Security Audit',
  'Performance Optimization',
  'Migration',
  'Git Workflow',
  'PR Creation',
  'Dependency Update',
  'Accomplishments',
  'Custom',
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]
