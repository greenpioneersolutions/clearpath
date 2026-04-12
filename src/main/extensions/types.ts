// ── Extension System Types ───────────────────────────────────────────────────
// Shared type definitions for the ClearPathAI extension system.

/** Permissions an extension can request in its manifest. */
export type ExtensionPermission =
  | 'integration:github:read'
  | 'integration:github:write'
  | 'integration:backstage:read'
  | 'notifications:emit'
  | 'storage'
  | 'env:read'
  | 'http:fetch'
  | 'navigation'
  | 'compliance:log'
  | 'sessions:read'
  | 'sessions:lifecycle'
  | 'cost:read'
  | 'feature-flags:read'
  | 'feature-flags:write'
  | 'local-models:access'
  | 'context:estimate'
  | 'notes:read'
  | 'skills:read'

/** All valid permission strings for manifest validation. */
export const VALID_PERMISSIONS: ReadonlySet<string> = new Set<ExtensionPermission>([
  'integration:github:read',
  'integration:github:write',
  'integration:backstage:read',
  'notifications:emit',
  'storage',
  'env:read',
  'http:fetch',
  'navigation',
  'compliance:log',
  'sessions:read',
  'sessions:lifecycle',
  'cost:read',
  'feature-flags:read',
  'feature-flags:write',
  'local-models:access',
  'context:estimate',
  'notes:read',
  'skills:read',
])

/** Navigation contribution declared in the manifest. */
export interface ExtensionNavContribution {
  id: string
  path: string
  label: string
  icon: string
  position?: string
  featureGate?: string[]
}

/** Panel contribution (embeddable slot in host pages). */
export interface ExtensionPanelContribution {
  id: string
  slot: string
  label: string
  component: string
}

/** Widget contribution (dashboard widget). */
export interface ExtensionWidgetContribution {
  id: string
  name: string
  description: string
  defaultSize: { w: number; h: number }
  component: string
}

/** Tab contribution (for tabbed pages like Insights). */
export interface ExtensionTabContribution {
  id: string
  /** Target page (e.g., "insights"). */
  page: string
  label: string
  component: string
  /** Position hint: 'start' | 'end' | number. Default: 'end'. */
  position?: 'start' | 'end' | number
}

/** Sidebar widget contribution. */
export interface ExtensionSidebarWidgetContribution {
  id: string
  label: string
  component: string
  /** Where in the sidebar: 'status' (above divider) | 'bottom' (above collapse). */
  position?: 'status' | 'bottom'
}

/** Session lifecycle hook contribution. */
export interface ExtensionSessionHookContribution {
  /** Event to hook into. */
  event: 'session:started' | 'session:stopped' | 'turn:started' | 'turn:ended'
  /** IPC channel on the extension's namespace to call when this event fires. */
  handler: string
}

/** Context provider contribution — declares data the extension can inject into AI sessions. */
export interface ExtensionContextProviderContribution {
  id: string
  label: string
  description: string
  icon: string
  parameters: Array<{
    id: string
    label: string
    type: 'text' | 'repo-picker' | 'project-picker' | 'select'
    required?: boolean
    options?: Array<{ value: string; label: string }>
    placeholder?: string
  }>
  /** IPC channel to call to build context. Must be in the extension's ipcChannels list. */
  handler: string
  /** Example prompts users might ask with this context. */
  examples: string[]
  maxTokenEstimate?: number
}

/** UI contributions declared in the manifest. */
export interface ExtensionContributions {
  navigation?: ExtensionNavContribution[]
  panels?: ExtensionPanelContribution[]
  widgets?: ExtensionWidgetContribution[]
  featureFlags?: string[]
  tabs?: ExtensionTabContribution[]
  sidebarWidgets?: ExtensionSidebarWidgetContribution[]
  sessionHooks?: ExtensionSessionHookContribution[]
  contextProviders?: ExtensionContextProviderContribution[]
}

/** A prerequisite integration the extension needs to function. */
export interface ExtensionRequirement {
  /** Integration key to check (e.g., "github", "atlassian", "servicenow"). */
  integration: string
  /** Human-readable label shown in the UI (e.g., "GitHub"). */
  label: string
  /** Message shown when the requirement is not met. */
  message: string
}

/** The clearpath-extension.json manifest schema. */
export interface ExtensionManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon?: string
  minAppVersion?: string

  main?: string
  renderer?: string

  permissions: ExtensionPermission[]
  allowedDomains?: string[]
  contributes?: ExtensionContributions

  /** Integrations this extension requires to function. */
  requires?: ExtensionRequirement[]

  ipcNamespace?: string
  ipcChannels?: string[]

  storageQuota?: number
}

/** How the extension was installed. */
export type ExtensionSource = 'bundled' | 'user'

/** Registry entry persisted in electron-store. */
export interface InstalledExtension {
  manifest: ExtensionManifest
  installPath: string
  source: ExtensionSource
  enabled: boolean
  installedAt: number
  manifestHash: string
  grantedPermissions: ExtensionPermission[]
  deniedPermissions: ExtensionPermission[]
  errorCount: number
  lastError: string | null
}

/** electron-store schema for the extension registry. */
export interface ExtensionStoreSchema {
  registry: Record<string, InstalledExtension>
}

/** Message from extension iframe to host (request). */
export interface ExtensionRequest {
  type: 'ext:request'
  id: string
  method: string
  params: unknown
}

/** Message from host to extension iframe (response). */
export interface ExtensionResponse {
  type: 'ext:response'
  id: string
  result?: unknown
  error?: { code: string; message: string }
}

/** Message from host to extension iframe (push event). */
export interface ExtensionEvent {
  type: 'ext:event'
  event: string
  data: unknown
}
