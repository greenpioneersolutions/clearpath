// ── Extension SDK Types ──────────────────────────────────────────────────────
// These types are used by extension developers building ClearPathAI extensions.

/** Permissions an extension can request. */
export type ExtensionPermission =
  | 'integration:github:read'
  | 'integration:github:write'
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

/** Navigation contribution in the manifest. */
export interface NavContribution {
  id: string
  path: string
  label: string
  icon: string
  position?: string
  featureGate?: string[]
}

/** Panel contribution in the manifest. */
export interface PanelContribution {
  id: string
  slot: string
  label: string
  component: string
}

/** Widget contribution in the manifest. */
export interface WidgetContribution {
  id: string
  name: string
  description: string
  defaultSize: { w: number; h: number }
  component: string
}

/** Tab contribution (for tabbed pages like Insights). */
export interface TabContribution {
  id: string
  /** Target page (e.g., "insights"). */
  page: string
  label: string
  component: string
  /** Position hint: 'start' | 'end' | number. Default: 'end'. */
  position?: 'start' | 'end' | number
}

/** Sidebar widget contribution. */
export interface SidebarWidgetContribution {
  id: string
  label: string
  component: string
  /** Where in the sidebar: 'status' (above divider) | 'bottom' (above collapse). */
  position?: 'status' | 'bottom'
}

/** Session lifecycle hook contribution. */
export interface SessionHookContribution {
  /** Event to hook into. */
  event: 'session:started' | 'session:stopped' | 'turn:started' | 'turn:ended'
  /** IPC channel on the extension's namespace to call when this event fires. */
  handler: string
}

/** Context provider contribution — declares data the extension can inject into AI sessions. */
export interface ContextProviderContribution {
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
  handler: string
  examples: string[]
  maxTokenEstimate?: number
}

/** The clearpath-extension.json manifest schema. */
/** A prerequisite integration the extension needs to function. */
export interface ExtensionRequirement {
  /** Integration key to check (e.g., "github", "atlassian"). */
  integration: string
  /** Human-readable label shown in the UI. */
  label: string
  /** Message shown when the requirement is not met. */
  message: string
}

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
  requires?: ExtensionRequirement[]
  contributes?: {
    navigation?: NavContribution[]
    panels?: PanelContribution[]
    widgets?: WidgetContribution[]
    featureFlags?: string[]
    tabs?: TabContribution[]
    sidebarWidgets?: SidebarWidgetContribution[]
    sessionHooks?: SessionHookContribution[]
    contextProviders?: ContextProviderContribution[]
  }
  ipcNamespace?: string
  ipcChannels?: string[]
  storageQuota?: number
}

/** Theme information provided by the host app. */
export interface ClearPathTheme {
  primary: string
  sidebar: string
  accent: string
  isDark: boolean
}

/** SDK API available to extension renderer code via useSDK(). */
export interface ExtensionSDK {
  readonly extensionId: string

  github: {
    listRepos(opts?: { page?: number; perPage?: number }): Promise<unknown[]>
    listPulls(owner: string, repo: string, opts?: { state?: string }): Promise<unknown[]>
    getPull(owner: string, repo: string, pullNumber: number): Promise<unknown>
    listIssues(owner: string, repo: string, opts?: { state?: string }): Promise<unknown[]>
    search(query: string, type?: 'issues' | 'pulls' | 'code'): Promise<unknown[]>
  }

  notifications: {
    emit(opts: { title: string; message: string; severity?: 'info' | 'warning' }): Promise<void>
  }

  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
    keys(): Promise<string[]>
    quota(): Promise<{ used: number; limit: number }>
  }

  env: {
    get(key: string): Promise<string | undefined>
    keys(): Promise<string[]>
  }

  http: {
    fetch(
      url: string,
      opts?: { method?: string; headers?: Record<string, string>; body?: string },
    ): Promise<{ status: number; headers: Record<string, string>; body: string }>
  }

  theme: {
    get(): Promise<ClearPathTheme>
    onChange(callback: (theme: ClearPathTheme) => void): () => void
  }

  sessions: {
    list(): Promise<
      Array<{
        sessionId: string
        cli: 'copilot' | 'claude'
        name?: string
        status: 'running' | 'stopped'
        startedAt: number
        endedAt?: number
      }>
    >
    getMessages(
      sessionId: string,
    ): Promise<
      Array<{
        type: string
        content: string
        sender?: 'user' | 'ai' | 'system'
        timestamp?: number
        metadata?: Record<string, unknown>
      }>
    >
    getActive(): Promise<string | null>
  }

  cost: {
    summary(): Promise<{
      totalCost: number
      totalTokens: number
      totalInputTokens: number
      totalOutputTokens: number
      totalSessions: number
      totalPrompts: number
      todaySpend: number
      weekSpend: number
      monthSpend: number
      todayTokens: number
      weekTokens: number
      monthTokens: number
      displayMode: 'tokens' | 'monetary'
    }>
    list(opts?: { since?: number; until?: number }): Promise<
      Array<{
        id: string
        sessionId: string
        sessionName: string
        cli: 'copilot' | 'claude'
        model: string
        inputTokens: number
        outputTokens: number
        totalTokens: number
        estimatedCostUsd: number
        promptCount: number
        timestamp: number
      }>
    >
    getBudget(): Promise<{
      dailyCeiling: number | null
      weeklyCeiling: number | null
      monthlyCeiling: number | null
      dailyTokenCeiling: number | null
      weeklyTokenCeiling: number | null
      monthlyTokenCeiling: number | null
      autoPauseAtLimit: boolean
    }>
    bySession(opts?: { since?: number }): Promise<
      Array<{
        sessionId: string
        sessionName: string
        cli: string
        totalCost: number
        totalTokens: number
        promptCount: number
        costPerPrompt: number
      }>
    >
  }

  featureFlags: {
    getAll(): Promise<Record<string, boolean>>
    get(key: string): Promise<boolean>
    set(key: string, value: boolean): Promise<void>
  }

  localModels: {
    detect(): Promise<{
      ollama: { connected: boolean; models: Array<{ name: string; size?: string }> }
      lmstudio: { connected: boolean; models: Array<{ name: string }> }
    }>
    chat(opts: {
      model: string
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      source?: 'ollama' | 'lmstudio'
    }): Promise<{ content: string }>
  }

  context: {
    estimateTokens(text: string): Promise<{ tokens: number; method: 'heuristic' }>
  }

  events: {
    on(event: string, callback: (data: unknown) => void): () => void
  }

  navigate(path: string): Promise<void>
}

/** Context provided to extension main process entries. */
export interface ExtensionMainContext {
  extensionId: string
  extensionPath: string
  registerHandler(channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>): void
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  store: {
    get<T = unknown>(key: string, defaultValue?: T): T
    set(key: string, value: unknown): void
    delete(key: string): void
    keys(): string[]
  }
  log: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
    debug(...args: unknown[]): void
  }
}

/** Options for createExtension(). */
export interface CreateExtensionOptions {
  /** Map of named React component exports. Keys must match manifest contributes references. */
  components: Record<string, React.ComponentType>
  /** Called when the extension is activated in the renderer. */
  activate?: (sdk: ExtensionSDK) => void | Promise<void>
  /** Called when the extension is deactivated. */
  deactivate?: () => void | Promise<void>
}
