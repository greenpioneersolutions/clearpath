import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import Store from 'electron-store'
import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import type { PromptTemplate, TemplateVariable } from '../../shared/templates/types'
import { parseTemplateBody, normalizeVariables, mergeVariables } from '../../shared/templates/parse'

// ── Types ────────────────────────────────────────────────────────────────────

interface TemplateStoreSchema {
  templates: PromptTemplate[]
}

/**
 * Merge a template's stored/authored variable metadata with the structure its
 * body declares. Body wins on name/type/options; overlay wins on
 * label/required/multiple/default. Also upgrades legacy `string[]` storage.
 */
function resolveVariables(body: string, stored: unknown): TemplateVariable[] {
  return mergeVariables(parseTemplateBody(body), normalizeVariables(stored))
}

/** Ensure every template leaving the main process carries TemplateVariable[]. */
function normalizeTemplate(t: PromptTemplate): PromptTemplate {
  return { ...t, variables: resolveVariables(t.body, t.variables) }
}

// ── Built-in templates ───────────────────────────────────────────────────────

function makeBuiltin(
  name: string, category: string, description: string, body: string,
  opts?: { model?: string; perm?: string; complexity?: 'low' | 'medium' | 'high' },
): PromptTemplate {
  return {
    id: `builtin-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name, category, description, body,
    recommendedModel: opts?.model,
    recommendedPermissionMode: opts?.perm,
    complexity: opts?.complexity ?? 'medium',
    variables: parseTemplateBody(body),
    source: 'builtin', usageCount: 0, totalCost: 0, createdAt: 0,
  }
}

const BUILTIN_TEMPLATES: PromptTemplate[] = [
  // Code Review (4)
  makeBuiltin('Review PR for Security', 'Code Review', 'Audit a PR branch for security vulnerabilities',
    'Review the changes on branch {{BRANCH_NAME}} for security vulnerabilities. Focus on injection attacks, auth bypasses, credential exposure, and unsafe deserialization. Provide severity ratings.',
    { complexity: 'high', perm: 'plan' }),
  makeBuiltin('General Code Review', 'Code Review', 'Thorough review of recent changes',
    'Review all changes in {{FILE_OR_DIR:directory}} for code quality, maintainability, and correctness. Flag any anti-patterns or potential bugs. Suggest improvements with code examples.',
    { complexity: 'medium' }),
  makeBuiltin('Review for Performance', 'Code Review', 'Check code for performance issues',
    'Analyze {{FILE_OR_DIR:directory}} for performance problems: N+1 queries, unnecessary re-renders, blocking I/O, memory leaks, and inefficient algorithms. Suggest concrete fixes.',
    { complexity: 'high' }),
  makeBuiltin('Review Error Handling', 'Code Review', 'Audit error handling patterns',
    'Review error handling in {{FILE_OR_DIR:directory}}. Check for: unhandled promise rejections, swallowed errors, missing error boundaries, inconsistent error response formats, and missing retry logic.',
    { complexity: 'medium' }),

  // Bug Fix (3)
  makeBuiltin('Fix Failing Test', 'Bug Fix', 'Diagnose and fix a failing test',
    'The test {{TEST_NAME}} in {{TEST_FILE:file}} is failing. Run the test, analyze the failure, determine the root cause, and fix it. Ensure all other tests still pass.',
    { complexity: 'medium', perm: 'acceptEdits' }),
  makeBuiltin('Debug Runtime Error', 'Bug Fix', 'Track down and fix a runtime error',
    'I\'m seeing this error: {{ERROR_MESSAGE}}. It occurs when {{TRIGGER_ACTION}}. Find the root cause in the codebase and fix it. Explain what caused it.',
    { complexity: 'high', perm: 'acceptEdits' }),
  makeBuiltin('Fix Type Errors', 'Bug Fix', 'Resolve TypeScript compilation errors',
    'Run the TypeScript compiler and fix all type errors. Do not use `any` or `@ts-ignore` unless absolutely necessary. Explain each fix.',
    { complexity: 'low', perm: 'acceptEdits' }),

  // Refactor (3)
  makeBuiltin('Extract Component', 'Refactor', 'Extract a reusable component from existing code',
    'Extract the {{FEATURE_DESCRIPTION}} logic from {{SOURCE_FILE:file}} into a standalone reusable component. Maintain the same behavior and update all imports.',
    { complexity: 'medium', perm: 'acceptEdits' }),
  makeBuiltin('Rename Across Codebase', 'Refactor', 'Safely rename a symbol everywhere',
    'Rename {{OLD_NAME}} to {{NEW_NAME}} across the entire codebase. Update all imports, references, tests, and documentation. Verify nothing breaks.',
    { complexity: 'low', perm: 'acceptEdits' }),
  makeBuiltin('Reduce Complexity', 'Refactor', 'Simplify overly complex code',
    'Refactor {{FILE_OR_DIR:directory}} to reduce complexity. Break up long functions, eliminate deep nesting, simplify conditional logic, and improve readability without changing behavior.',
    { complexity: 'high', perm: 'acceptEdits' }),

  // Testing (3)
  makeBuiltin('Write Unit Tests', 'Testing', 'Generate unit tests for a module',
    'Write comprehensive unit tests for {{FILE_PATH:file}}. Cover happy paths, edge cases, error conditions, and boundary values. Use the project\'s existing test framework.',
    { complexity: 'medium', perm: 'acceptEdits' }),
  makeBuiltin('Write Integration Tests', 'Testing', 'Create integration tests for an API endpoint',
    'Write integration tests for the {{ENDPOINT_OR_FEATURE}} endpoint. Test with real database connections, verify response shapes, status codes, and error handling.',
    { complexity: 'high', perm: 'acceptEdits' }),
  makeBuiltin('Increase Coverage', 'Testing', 'Find and fill test coverage gaps',
    'Run the test suite with coverage reporting. Identify uncovered lines in {{FILE_OR_DIR:directory}} and write tests to cover them. Target >{{COVERAGE_TARGET}}% coverage.',
    { complexity: 'medium', perm: 'acceptEdits' }),

  // Documentation (3)
  makeBuiltin('Generate API Docs', 'Documentation', 'Create API documentation from code',
    'Generate comprehensive API documentation for {{FILE_OR_DIR:directory}}. Include function signatures, parameter descriptions, return types, usage examples, and error conditions.',
    { complexity: 'low' }),
  makeBuiltin('Write README', 'Documentation', 'Create or update the project README',
    'Write a README.md for this project covering: what it does, how to install, how to run, configuration options, and contributing guidelines. Keep it concise.',
    { complexity: 'low', perm: 'acceptEdits' }),
  makeBuiltin('Document Architecture', 'Documentation', 'Create an architecture decision record',
    'Document the architecture of {{SYSTEM_OR_FEATURE}}. Include: component diagram, data flow, key design decisions, trade-offs made, and alternatives considered.',
    { complexity: 'medium' }),

  // Architecture (2)
  makeBuiltin('Design System Component', 'Architecture', 'Plan a new system component',
    'Design the architecture for {{FEATURE_NAME}}. Define the API surface, data models, state management approach, error handling strategy, and testing plan. Do not implement yet.',
    { complexity: 'high', perm: 'plan' }),
  makeBuiltin('Evaluate Tech Choice', 'Architecture', 'Compare technology options',
    'Evaluate {{OPTION_A}} vs {{OPTION_B}} for {{USE_CASE}}. Compare on: performance, developer experience, ecosystem maturity, maintenance burden, and cost. Recommend one with justification.',
    { complexity: 'medium', perm: 'plan' }),

  // Security Audit (2)
  makeBuiltin('Full Security Audit', 'Security Audit', 'Comprehensive security review',
    'Perform a security audit of {{FILE_OR_DIR:directory}}. Check for OWASP Top 10 vulnerabilities, hardcoded secrets, insecure dependencies, and missing input validation. Rate each finding by severity.',
    { complexity: 'high', perm: 'plan' }),
  makeBuiltin('Dependency Audit', 'Security Audit', 'Check dependencies for vulnerabilities',
    'Audit all project dependencies for known vulnerabilities. Run npm audit (or equivalent), check for outdated packages with known CVEs, and recommend updates.',
    { complexity: 'medium' }),

  // Performance Optimization (2)
  makeBuiltin('Profile and Optimize', 'Performance Optimization', 'Find and fix performance bottlenecks',
    'Profile {{FILE_OR_DIR:directory}} for performance. Identify the top 3 bottlenecks, explain why they\'re slow, and implement optimizations. Measure before and after.',
    { complexity: 'high', perm: 'acceptEdits' }),
  makeBuiltin('Optimize Bundle Size', 'Performance Optimization', 'Reduce JavaScript bundle size',
    'Analyze the build output for bundle size. Find large dependencies, unnecessary imports, and missing code splitting opportunities. Implement tree-shaking and lazy loading where appropriate.',
    { complexity: 'medium', perm: 'acceptEdits' }),

  // Migration (2)
  makeBuiltin('Migrate to TypeScript', 'Migration', 'Convert JavaScript files to TypeScript',
    'Convert {{FILE_PATH:file}} from JavaScript to TypeScript. Add proper type annotations, fix any type errors, and ensure all tests pass. Do not use `any`.',
    { complexity: 'medium', perm: 'acceptEdits' }),
  makeBuiltin('Upgrade Dependency', 'Migration', 'Upgrade a major dependency version',
    'Upgrade {{PACKAGE_NAME}} from v{{OLD_VERSION}} to v{{NEW_VERSION}}. Follow the migration guide, update breaking API changes, fix deprecation warnings, and verify tests pass.',
    { complexity: 'high', perm: 'acceptEdits' }),

  // Git Workflow (2)
  makeBuiltin('Prepare Release', 'Git Workflow', 'Prepare a release with changelog',
    'Prepare a release for version {{VERSION}}. Update CHANGELOG.md with all changes since the last release, bump version numbers, and create a release commit.',
    { complexity: 'medium', perm: 'acceptEdits' }),
  makeBuiltin('Clean Up Branches', 'Git Workflow', 'Identify and clean stale branches',
    'List all git branches merged into {{BASE_BRANCH}}. Identify stale branches older than {{DAYS}} days. Show which are safe to delete.',
    { complexity: 'low' }),

  // PR Creation (2)
  makeBuiltin('Create Feature PR', 'PR Creation', 'Build a feature and create a PR',
    'Implement {{FEATURE_DESCRIPTION}} on a new branch from {{BASE_BRANCH}}. Write the code, add tests, then create a pull request with a clear description.',
    { complexity: 'high', perm: 'acceptEdits' }),
  makeBuiltin('Write PR Description', 'PR Creation', 'Generate a PR description from changes',
    'Analyze the changes on the current branch compared to {{BASE_BRANCH}}. Write a PR description with: summary, changes made, testing done, and screenshots if applicable.',
    { complexity: 'low' }),

  // Dependency Update (2)
  makeBuiltin('Update All Dependencies', 'Dependency Update', 'Update all project dependencies',
    'Update all dependencies to their latest compatible versions. Run tests after each major update. Report any breaking changes found.',
    { complexity: 'medium', perm: 'acceptEdits' }),
  makeBuiltin('Audit and Update', 'Dependency Update', 'Fix vulnerable dependencies',
    'Run a dependency audit, identify packages with known vulnerabilities, update them to patched versions, and verify the application still works correctly.',
    { complexity: 'medium', perm: 'acceptEdits' }),

  // Session-preset examples — these show off typed variables. Config-type
  // tokens (note/skill/model/agent/directory) are stripped from the prompt
  // text and instead configure the session; keep them on their own lines so
  // the surrounding prose still reads cleanly once they're removed.
  makeBuiltin('Write Accomplishments', 'Accomplishments', 'Summarize what you shipped, using your notes',
    'Draft a summary of what I accomplished during {{TIMEFRAME:text}}. Use my attached notes and the selected skill as source material. Focus on outcomes and impact, grouped by theme, written for a {{AUDIENCE:select:manager|peer team|executive}} audience.\n\n{{SOURCE_NOTES:note}}\n{{WRITING_SKILL:skill}}\n{{MODEL:model}}',
    { complexity: 'medium' }),
  makeBuiltin('Review a File', 'Code Review', 'Deep review of one specific file',
    'Review {{TARGET:file}} for correctness, readability, and edge cases. Explain any issues you find and suggest concrete improvements with code examples.',
    { complexity: 'medium' }),
  makeBuiltin('Refactor a Folder', 'Refactor', 'Refactor everything under a folder',
    'Refactor the code in {{TARGET:directory}} to improve {{GOAL:select:readability|performance|testability|type safety}}. Preserve behavior, update call sites, and keep changes reviewable.\n\n{{MODEL:model}}',
    { complexity: 'high', perm: 'acceptEdits' }),
]

// ── Store ────────────────────────────────────────────────────────────────────

const store = new Store<TemplateStoreSchema>({
  name: 'clear-path-templates',
  encryptionKey: getStoreEncryptionKey(),
  defaults: { templates: [] },
})

function getAllTemplates(): PromptTemplate[] {
  const user = store.get('templates')
  // Merge: user templates override built-in if same ID
  const userIds = new Set(user.map((t) => t.id))
  const builtins = BUILTIN_TEMPLATES.filter((t) => !userIds.has(t.id))
  // Normalize on read so every renderer consumer sees TemplateVariable[] and
  // legacy `string[]` storage is upgraded transparently.
  return [...builtins, ...user].map(normalizeTemplate)
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerTemplateHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('templates:list', (_e, args?: { category?: string; search?: string }) => {
    let templates = getAllTemplates()
    if (args?.category) templates = templates.filter((t) => t.category === args.category)
    if (args?.search) {
      const q = args.search.toLowerCase()
      templates = templates.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q),
      )
    }
    return templates
  })

  ipcMain.handle('templates:get', (_e, args: { id: string }) =>
    getAllTemplates().find((t) => t.id === args.id) ?? null,
  )

  ipcMain.handle('templates:save', (_e, args: {
    name: string; category: string; description: string; body: string;
    recommendedModel?: string; recommendedPermissionMode?: string;
    complexity?: string; folder?: string; id?: string
    variables?: TemplateVariable[]
  }) => {
    const templates = store.get('templates')
    const template: PromptTemplate = {
      id: args.id ?? randomUUID(),
      name: args.name, category: args.category,
      description: args.description, body: args.body,
      recommendedModel: args.recommendedModel,
      recommendedPermissionMode: args.recommendedPermissionMode,
      complexity: (args.complexity as 'low' | 'medium' | 'high') ?? 'medium',
      // Body wins on structure; the editor's per-variable metadata (label,
      // required, multiple, default) is overlaid on top.
      variables: resolveVariables(args.body, args.variables),
      source: 'user', folder: args.folder,
      usageCount: 0, totalCost: 0, createdAt: Date.now(),
    }

    const existing = templates.findIndex((t) => t.id === template.id)
    if (existing >= 0) {
      template.usageCount = templates[existing].usageCount
      template.totalCost = templates[existing].totalCost
      template.lastUsedAt = templates[existing].lastUsedAt
      template.createdAt = templates[existing].createdAt
      templates[existing] = template
    } else {
      templates.push(template)
    }
    store.set('templates', templates)
    return template
  })

  ipcMain.handle('templates:delete', (_e, args: { id: string }) => {
    const templates = store.get('templates').filter((t) => t.id !== args.id)
    store.set('templates', templates)
    return { success: true }
  })

  ipcMain.handle('templates:record-usage', (_e, args: { id: string; cost?: number }) => {
    // Update built-in or user template usage stats
    const templates = store.get('templates')
    const idx = templates.findIndex((t) => t.id === args.id)
    if (idx >= 0) {
      templates[idx].usageCount++
      templates[idx].totalCost += args.cost ?? 0
      templates[idx].lastUsedAt = Date.now()
      store.set('templates', templates)
    } else {
      // Built-in: save a copy to user store to track usage
      const builtin = BUILTIN_TEMPLATES.find((t) => t.id === args.id)
      if (builtin) {
        const copy = { ...builtin, usageCount: 1, totalCost: args.cost ?? 0, lastUsedAt: Date.now() }
        templates.push(copy)
        store.set('templates', templates)
      }
    }
    return { success: true }
  })

  ipcMain.handle('templates:usage-stats', () => {
    const all = getAllTemplates()
    return all
      .filter((t) => t.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount)
      .map((t) => ({
        templateId: t.id,
        name: t.name,
        category: t.category,
        usageCount: t.usageCount,
        avgCost: t.usageCount > 0 ? t.totalCost / t.usageCount : 0,
        totalCost: t.totalCost,
        lastUsedAt: t.lastUsedAt,
      }))
  })

  ipcMain.handle('templates:export', async (_e, args: { id: string }) => {
    const template = getAllTemplates().find((t) => t.id === args.id)
    if (!template) return { error: 'Not found' }

    const md = [
      '---',
      `name: ${template.name}`,
      `category: ${template.category}`,
      `description: ${template.description}`,
      template.recommendedModel ? `recommendedModel: ${template.recommendedModel}` : null,
      template.recommendedPermissionMode ? `recommendedPermissionMode: ${template.recommendedPermissionMode}` : null,
      `complexity: ${template.complexity}`,
      // Single-line JSON so the hand-rolled `key: value` frontmatter parser can
      // read it back without a YAML dependency. Carries label/required/etc.
      template.variables.length > 0 ? `variables: ${JSON.stringify(template.variables)}` : null,
      '---',
      '',
      template.body,
    ].filter(Boolean).join('\n')

    const result = await dialog.showSaveDialog({
      defaultPath: `${template.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    writeFileSync(result.filePath, md, 'utf8')
    return { path: result.filePath }
  })

  ipcMain.handle('templates:import', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    try {
      const raw = readFileSync(result.filePaths[0], 'utf8')
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/)
      if (!fmMatch) return { error: 'No YAML frontmatter found' }

      const fm = fmMatch[1]
      const body = fmMatch[2].trim()
      const get = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()

      // Recover authored variable metadata if the export carried it; otherwise
      // structure is re-derived from the body annotations.
      let storedVars: unknown
      const varsRaw = get('variables')
      if (varsRaw) {
        try { storedVars = JSON.parse(varsRaw) } catch { storedVars = undefined }
      }

      const template: PromptTemplate = {
        id: randomUUID(),
        name: get('name') ?? 'Imported Template',
        category: get('category') ?? 'Custom',
        description: get('description') ?? '',
        body,
        recommendedModel: get('recommendedModel'),
        recommendedPermissionMode: get('recommendedPermissionMode'),
        complexity: (get('complexity') as 'low' | 'medium' | 'high') ?? 'medium',
        variables: resolveVariables(body, storedVars),
        source: 'user',
        usageCount: 0, totalCost: 0, createdAt: Date.now(),
      }

      const templates = store.get('templates')
      templates.push(template)
      store.set('templates', templates)
      return { template }
    } catch (err) {
      return { error: String(err) }
    }
  })
}
