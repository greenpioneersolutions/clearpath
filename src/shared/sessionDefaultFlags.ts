/**
 * Curated allowlist of CLI flags that may be applied as *persistent session
 * defaults* when an in-app session is spawned.
 *
 * Background: the Settings → CLI Flags builder writes every configured flag to
 * `clear-path-settings` under `settings.flags`, keyed `${provider}:${flagKey}`
 * (e.g. `claude:permissionMode`). Historically those values only fed the
 * copy-paste Launch Command Preview — they never reached a real session. The
 * `cli:start-session` handler now merges this curated subset onto the spawned
 * `SessionOptions` so configuring a flag actually takes effect in-app.
 *
 * Each key here is exactly a camelCase `SessionOptions` field name (see
 * `src/renderer/src/types/ipc.ts`), so allowlisted values merge straight onto
 * typed fields — never via the `options.flags` catch-all, which would emit the
 * camelCase name literally (`--permissionMode` instead of `--permission-mode`).
 *
 * This is a *positive* allowlist: any flag not listed is intentionally NOT
 * applied as a default, so flags added to `flagDefs.ts` later stay inert until
 * deliberately opted in here.
 *
 * Deliberately EXCLUDED — operational / one-shot flags that would break an
 * interactive in-app session or are owned by dedicated UI:
 *   print, prompt, acp, resume, continue, sessionId, fromPr, forkSession,
 *   noSessionPersistence, remote, teleport, worktree, init, initOnly,
 *   maintenance, name, outputFormat, inputFormat, jsonSchema,
 *   includePartialMessages, pluginDir (managed via PluginManager / pluginDirs),
 *   mcpConfig (rendered by McpSyncService), agent + model (dedicated pickers),
 *   saveGist, dangerouslySkipPermissions (no SessionOptions field; overlaps
 *   permissionMode: 'bypassPermissions').
 *
 * Budget/turns (`maxBudget`, `maxTurns`) are owned HERE (the CLI Flags tab),
 * not the dormant Session Limits panel — see Settings.tsx.
 */

import type { BackendId } from './backends'
import { providerOf, transportOf } from './backends'

/**
 * Session-default-safe flag keys per provider. These reach both CLI and SDK
 * transports unless the key is also in {@link SDK_INCOMPATIBLE_FLAG_KEYS}.
 */
export const SESSION_DEFAULT_FLAG_KEYS: Record<'copilot' | 'claude', ReadonlySet<string>> = {
  claude: new Set<string>([
    'permissionMode',
    'allowedTools',
    'disallowedTools',
    'tools',
    'permissionPromptTool',
    'appendSystemPrompt',
    'systemPrompt',
    'fallbackModel',
    'betas',
    'verbose',
    'additionalDirs',
    'strictMcpConfig',
    'disableSlashCommands',
    'teammateMode',
    'maxBudget',
    'maxTurns',
    'chrome',
    'ide',
    'debug',
    'settings',
    'settingSources',
  ]),
  copilot: new Set<string>([
    'yolo',
    'allowAll',
    'allowAllTools',
    'allowedTools',
    'deniedTools',
    'availableTools',
    'excludedTools',
    'experimental',
    'altScreen',
    'screenReader',
    'streamerMode',
    'banner',
    'enableAllGithubMcpTools',
    'disableBuiltinMcps',
    'disableMcpServer',
    'stream',
    'bashEnv',
    'configDir',
  ]),
}

/**
 * Keys that only make sense for a CLI binary and are ignored by the SDK
 * adapters (`ClaudeSdkAdapter` / `CopilotSdkAdapter`). Subtracted from the
 * allowlist when the target backend is an `*-sdk` transport so we don't promise
 * an effect the SDK path can't deliver.
 */
export const SDK_INCOMPATIBLE_FLAG_KEYS: ReadonlySet<string> = new Set<string>([
  'chrome',
  'ide',
  'debug',
  'settings',
  'settingSources',
  'configDir',
  'altScreen',
  'screenReader',
  'streamerMode',
  'banner',
  'bashEnv',
])

/**
 * The effective set of session-default flag keys for a concrete backend,
 * narrowed for SDK transports. Use this at spawn time rather than indexing
 * {@link SESSION_DEFAULT_FLAG_KEYS} directly.
 */
export function sessionDefaultFlagKeysFor(backend: BackendId): ReadonlySet<string> {
  const base = SESSION_DEFAULT_FLAG_KEYS[providerOf(backend)]
  if (transportOf(backend) === 'cli') return base
  const narrowed = new Set<string>()
  for (const key of base) {
    if (!SDK_INCOMPATIBLE_FLAG_KEYS.has(key)) narrowed.add(key)
  }
  return narrowed
}
