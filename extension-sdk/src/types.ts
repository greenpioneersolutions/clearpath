// ── Extension SDK Types ──────────────────────────────────────────────────────
// These types are used by extension developers building ClearPathAI extensions.

/**
 * Permissions an extension can request in its manifest.
 *
 * Each permission grants access to a specific SDK namespace or capability.
 * The host app presents these to the user for approval at install time.
 *
 * - `'integration:github:read'`  -- Read-only access to GitHub data (repos, PRs, issues) via `sdk.github`.
 * - `'integration:github:write'` -- Write access to GitHub (create/update PRs, issues) via `sdk.github`.
 * - `'notifications:emit'`       -- Emit notifications to the user via `sdk.notifications`.
 * - `'storage'`                  -- Persist key/value data scoped to the extension via `sdk.storage`.
 * - `'env:read'`                 -- Read environment variables configured in the app via `sdk.env`.
 * - `'http:fetch'`               -- Make HTTP requests to allowed domains via `sdk.http`.
 * - `'navigation'`               -- Programmatically navigate the app via `sdk.navigate()`.
 * - `'compliance:log'`           -- Write entries to the compliance audit log.
 * - `'sessions:read'`            -- Read session metadata and message history via `sdk.sessions`.
 * - `'sessions:lifecycle'`       -- Receive session lifecycle hooks (start, stop, turn events).
 * - `'cost:read'`                -- Read cost/usage analytics via `sdk.cost`.
 * - `'feature-flags:read'`       -- Read feature flag values via `sdk.featureFlags`.
 * - `'feature-flags:write'`      -- Toggle feature flags via `sdk.featureFlags.set()`.
 * - `'local-models:access'`      -- Detect and chat with local models (Ollama, LM Studio) via `sdk.localModels`.
 * - `'context:estimate'`         -- Estimate token counts for text via `sdk.context`.
 * - `'notes:read'`               -- Read knowledge-base notes stored by the app.
 * - `'skills:read'`              -- Read registered skills and their metadata.
 */
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

/**
 * Declares a navigation item the extension adds to the app sidebar.
 */
export interface NavContribution {
  /** Unique identifier for this nav item (scoped to the extension). */
  id: string
  /** Route path that the nav item links to (e.g., `"/my-extension/dashboard"`). */
  path: string
  /** Display label shown in the sidebar. */
  label: string
  /** Icon name or SVG reference rendered next to the label. */
  icon: string
  /** Position hint within the sidebar (e.g., `"top"`, `"bottom"`, or a numeric index). */
  position?: string
  /** Feature flag keys that must all be enabled for this nav item to appear. */
  featureGate?: string[]
}

/**
 * Declares a panel the extension renders into a named slot in the host UI.
 *
 * Available slots:
 * - `"sidebar:status"` -- Rendered in the sidebar status area above the divider.
 * - `"home:widgets"` -- Rendered on the Home/Dashboard page as an inline panel.
 * - `"session-summary:after-stats"` -- Rendered below the session statistics in summary view.
 */
export interface PanelContribution {
  /** Unique identifier for this panel (scoped to the extension). */
  id: string
  /** Target slot in the host UI where this panel is rendered. */
  slot: string
  /** Display label for the panel (shown as a header or tooltip). */
  label: string
  /** Key into the extension's `components` map that provides the React component to render. */
  component: string
}

/**
 * Declares a dashboard widget the extension contributes to the customizable dashboard.
 *
 * Widgets are placed on the grid-layout dashboard and can be resized/repositioned by the user.
 */
export interface WidgetContribution {
  /** Unique identifier for this widget (scoped to the extension). */
  id: string
  /** Human-readable widget name shown in the widget picker. */
  name: string
  /** Short description of what the widget displays, shown in the picker. */
  description: string
  /** Default grid size in layout units (columns x rows). */
  defaultSize: { w: number; h: number }
  /** Key into the extension's `components` map that provides the React component to render. */
  component: string
}

/**
 * Declares a tab the extension adds to an existing tabbed page in the host UI.
 *
 * Currently supported pages: `"insights"`.
 */
export interface TabContribution {
  /** Unique identifier for this tab (scoped to the extension). */
  id: string
  /** Target page to add the tab to (e.g., `"insights"`). */
  page: string
  /** Display label shown on the tab header. */
  label: string
  /** Key into the extension's `components` map that provides the React component rendered when the tab is active. */
  component: string
  /** Where to insert the tab. `'start'` prepends, `'end'` appends (default), or a numeric index for exact placement. */
  position?: 'start' | 'end' | number
}

/**
 * Declares a small widget rendered directly in the app sidebar.
 *
 * Sidebar widgets are compact UI elements (e.g., status indicators, quick actions).
 */
export interface SidebarWidgetContribution {
  /** Unique identifier for this sidebar widget (scoped to the extension). */
  id: string
  /** Tooltip or accessible label for the widget. */
  label: string
  /** Key into the extension's `components` map that provides the React component to render. */
  component: string
  /** Placement within the sidebar. `'status'` renders above the divider; `'bottom'` renders above the collapse button. Default: `'status'`. */
  position?: 'status' | 'bottom'
}

/**
 * Declares a hook the extension registers for session lifecycle events.
 *
 * When the specified event fires, the host invokes the named handler on the
 * extension's IPC namespace, passing event-specific data as the argument.
 *
 * @remarks Requires `sessions:lifecycle` permission.
 */
export interface SessionHookContribution {
  /**
   * The lifecycle event to subscribe to.
   * - `'session:started'` -- Fired when a new CLI session begins.
   * - `'session:stopped'` -- Fired when a CLI session ends.
   * - `'turn:started'`    -- Fired when an AI turn (request/response cycle) begins.
   * - `'turn:ended'`      -- Fired when an AI turn completes.
   */
  event: 'session:started' | 'session:stopped' | 'turn:started' | 'turn:ended'
  /** IPC channel name (within the extension's namespace) that the host calls when the event fires. */
  handler: string
}

/**
 * Declares a context provider -- an extension-supplied data source that users can
 * attach to AI sessions as additional context.
 *
 * When the user selects this provider and fills in its parameters, the host calls
 * the named `handler` on the extension's IPC namespace. The handler should return
 * a string of context to inject into the session.
 */
export interface ContextProviderContribution {
  /** Unique identifier for this context provider (scoped to the extension). */
  id: string
  /** Human-readable name shown in the context picker UI. */
  label: string
  /** Short description of what context this provider supplies. */
  description: string
  /** Icon name or SVG reference shown next to the label in the picker. */
  icon: string
  /**
   * Parameters the user fills in before the provider is invoked.
   * The host renders a form based on these definitions and passes the values to the handler.
   */
  parameters: Array<{
    /** Unique parameter identifier. */
    id: string
    /** Form label displayed to the user. */
    label: string
    /** Input type. `'repo-picker'` and `'project-picker'` render specialized choosers; `'select'` renders a dropdown using `options`. */
    type: 'text' | 'repo-picker' | 'project-picker' | 'select'
    /** Whether the parameter must be filled before invocation. Default: `false`. */
    required?: boolean
    /** Dropdown options when `type` is `'select'`. */
    options?: Array<{ value: string; label: string }>
    /** Placeholder text shown in the input field. */
    placeholder?: string
  }>
  /** IPC channel name (within the extension's namespace) that the host calls with the filled parameters. */
  handler: string
  /** Example prompts or descriptions showing how this provider can be used. */
  examples: string[]
  /** Estimated maximum token count of the returned context, used for budget planning. */
  maxTokenEstimate?: number
}

/** A prerequisite integration the extension needs to function. */
export interface ExtensionRequirement {
  /** Integration key to check (e.g., `"github"`, `"atlassian"`). */
  integration: string
  /** Human-readable label shown in the UI (e.g., `"GitHub Integration"`). */
  label: string
  /** Message shown when the requirement is not met, guiding the user to enable it. */
  message: string
}

/**
 * The `clearpath-extension.json` manifest schema.
 *
 * Every extension must include a manifest file at its root describing metadata,
 * permissions, and UI contributions. The host reads this file to register the
 * extension without executing any of its code.
 *
 * @example
 * ```json
 * {
 *   "id": "com.example.my-extension",
 *   "name": "My Extension",
 *   "version": "1.0.0",
 *   "description": "Does something useful",
 *   "author": "Your Name",
 *   "permissions": ["storage", "notifications:emit"],
 *   "contributes": {
 *     "navigation": [{ "id": "main", "path": "/my-ext", "label": "My Ext", "icon": "Puzzle" }]
 *   }
 * }
 * ```
 */
export interface ExtensionManifest {
  /** Globally unique extension identifier in reverse-domain format (e.g., `"com.example.my-extension"`). */
  id: string
  /** Human-readable extension name displayed in the UI. */
  name: string
  /** Extension version following semver (e.g., `"1.2.3"`). */
  version: string
  /** Short description of what the extension does. */
  description: string
  /** Author name or organization. */
  author: string
  /** Path to an icon file relative to the extension root, or a bundled icon name. */
  icon?: string
  /** Minimum ClearPathAI app version required (semver). The extension will not load on older versions. */
  minAppVersion?: string
  /** Path to the main-process entry file (Node.js), relative to the extension root. Omit if the extension is renderer-only. */
  main?: string
  /** Path to the renderer entry file (React), relative to the extension root. Omit if the extension is main-process-only. */
  renderer?: string
  /** Permissions this extension requests. Presented to the user at install time. */
  permissions: ExtensionPermission[]
  /** Domains the extension is allowed to make HTTP requests to via `sdk.http.fetch()`. Required when using the `http:fetch` permission. */
  allowedDomains?: string[]
  /** Integrations that must be enabled for this extension to function. */
  requires?: ExtensionRequirement[]
  /** UI contributions the extension registers with the host app. */
  contributes?: {
    /** Navigation items added to the sidebar. */
    navigation?: NavContribution[]
    /** Panels rendered into named slots in the host UI. */
    panels?: PanelContribution[]
    /** Dashboard widgets available in the customizable dashboard. */
    widgets?: WidgetContribution[]
    /** Feature flag keys the extension declares and manages. */
    featureFlags?: string[]
    /** Tabs added to existing tabbed pages (e.g., Insights). */
    tabs?: TabContribution[]
    /** Small widgets rendered directly in the sidebar. */
    sidebarWidgets?: SidebarWidgetContribution[]
    /** Session lifecycle event hooks. */
    sessionHooks?: SessionHookContribution[]
    /** Context providers that supply data to AI sessions. */
    contextProviders?: ContextProviderContribution[]
  }
  /** Custom IPC namespace prefix for this extension's channels. Defaults to the extension `id`. */
  ipcNamespace?: string
  /** IPC channel names (under the namespace) that the extension's main process entry registers. */
  ipcChannels?: string[]
  /** Maximum storage quota in bytes for `sdk.storage`. Default is host-defined. */
  storageQuota?: number
}

/** Theme information provided by the host app, reflecting the current UI color scheme. */
export interface ClearPathTheme {
  /** Primary brand color as a CSS hex string (e.g., `"#5B4FC4"`). */
  primary: string
  /** Sidebar background color as a CSS hex string. */
  sidebar: string
  /** Accent color as a CSS hex string, used for highlights and interactive elements. */
  accent: string
  /** Whether the app is currently in dark mode. */
  isDark: boolean
}

/**
 * SDK API available to extension renderer code via `useSDK()`.
 *
 * Each namespace is gated by one or more permissions declared in the extension manifest.
 * Calling a method without the required permission will reject with an error.
 *
 * @example
 * ```tsx
 * import { useSDK } from '@clearpath/extension-sdk'
 *
 * function MyComponent() {
 *   const sdk = useSDK()
 *   const [repos, setRepos] = useState<unknown[]>([])
 *
 *   useEffect(() => {
 *     sdk.github.listRepos().then(setRepos)
 *   }, [])
 *
 *   return <ul>{repos.map((r: any) => <li key={r.id}>{r.name}</li>)}</ul>
 * }
 * ```
 */
export interface ExtensionSDK {
  /** The unique identifier of this extension, matching the manifest `id`. */
  readonly extensionId: string

  /**
   * GitHub integration namespace.
   * @remarks Requires `integration:github:read` permission for read methods.
   */
  github: {
    /**
     * List repositories accessible to the authenticated GitHub user.
     * @param opts - Pagination options.
     * @returns Array of repository objects.
     */
    listRepos(opts?: { page?: number; perPage?: number }): Promise<unknown[]>
    /**
     * List pull requests for a repository.
     * @param owner - Repository owner (user or org).
     * @param repo - Repository name.
     * @param opts - Filter options.
     * @returns Array of pull request objects.
     */
    listPulls(owner: string, repo: string, opts?: { state?: string }): Promise<unknown[]>
    /**
     * Get a single pull request by number.
     * @param owner - Repository owner.
     * @param repo - Repository name.
     * @param pullNumber - PR number.
     * @returns Pull request object with full details.
     */
    getPull(owner: string, repo: string, pullNumber: number): Promise<unknown>
    /**
     * List issues for a repository.
     * @param owner - Repository owner.
     * @param repo - Repository name.
     * @param opts - Filter options (e.g., `{ state: "open" }`).
     * @returns Array of issue objects.
     */
    listIssues(owner: string, repo: string, opts?: { state?: string }): Promise<unknown[]>
    /**
     * Search across GitHub issues, pulls, or code.
     * @param query - GitHub search query string.
     * @param type - Type of search. Defaults to `'issues'`.
     * @returns Array of search result objects.
     */
    search(query: string, type?: 'issues' | 'pulls' | 'code'): Promise<unknown[]>
  }

  /**
   * Notification namespace for emitting user-facing notifications.
   * @remarks Requires `notifications:emit` permission.
   */
  notifications: {
    /**
     * Emit a notification to the user.
     * @param opts - Notification content and severity.
     */
    emit(opts: { title: string; message: string; severity?: 'info' | 'warning' }): Promise<void>
  }

  /**
   * Key-value storage namespace, scoped to this extension.
   * Data persists across app restarts within the configured quota.
   * @remarks Requires `storage` permission.
   */
  storage: {
    /**
     * Retrieve a value by key.
     * @param key - Storage key.
     * @returns The stored value, or `undefined` if the key does not exist.
     */
    get<T = unknown>(key: string): Promise<T | undefined>
    /**
     * Store a value under the given key. Overwrites any existing value.
     * @param key - Storage key.
     * @param value - Value to store (must be JSON-serializable).
     */
    set(key: string, value: unknown): Promise<void>
    /**
     * Delete a key and its value.
     * @param key - Storage key to remove.
     */
    delete(key: string): Promise<void>
    /**
     * List all keys currently stored by this extension.
     * @returns Array of key strings.
     */
    keys(): Promise<string[]>
    /**
     * Get current storage usage and quota limit.
     * @returns Object with `used` (bytes consumed) and `limit` (max bytes allowed).
     */
    quota(): Promise<{ used: number; limit: number }>
  }

  /**
   * Environment variable namespace for reading app-configured env vars.
   * @remarks Requires `env:read` permission.
   */
  env: {
    /**
     * Get the value of an environment variable.
     * @param key - Environment variable name.
     * @returns The value, or `undefined` if not set.
     */
    get(key: string): Promise<string | undefined>
    /**
     * List all available environment variable names.
     * @returns Array of env var key strings.
     */
    keys(): Promise<string[]>
  }

  /**
   * HTTP namespace for making network requests to allowed domains.
   * @remarks Requires `http:fetch` permission. Only domains listed in `allowedDomains` in the manifest are permitted.
   */
  http: {
    /**
     * Perform an HTTP request.
     * @param url - The URL to fetch. Must match an allowed domain.
     * @param opts - Request options (method, headers, body).
     * @returns Response with status code, headers, and body as a string.
     * @throws If the domain is not in `allowedDomains`.
     */
    fetch(
      url: string,
      opts?: { method?: string; headers?: Record<string, string>; body?: string },
    ): Promise<{ status: number; headers: Record<string, string>; body: string }>
  }

  /** Theme namespace for reading and reacting to the host app's color scheme. */
  theme: {
    /**
     * Get the current theme.
     * @returns The active theme colors and mode.
     */
    get(): Promise<ClearPathTheme>
    /**
     * Subscribe to theme changes (e.g., when the user toggles dark mode).
     * @param callback - Called with the new theme whenever it changes.
     * @returns An unsubscribe function. Call it to stop receiving updates.
     */
    onChange(callback: (theme: ClearPathTheme) => void): () => void
  }

  /**
   * Sessions namespace for reading CLI session metadata and messages.
   * @remarks Requires `sessions:read` permission.
   */
  sessions: {
    /**
     * List all sessions (running and stopped).
     * @returns Array of session summary objects.
     */
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
    /**
     * Get the message history for a specific session.
     * @param sessionId - The session to retrieve messages for.
     * @returns Array of message objects in chronological order.
     */
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
    /**
     * Get the ID of the currently active (running) session, if any.
     * @returns The active session ID, or `null` if no session is running.
     */
    getActive(): Promise<string | null>
  }

  /**
   * Cost and usage analytics namespace.
   * @remarks Requires `cost:read` permission.
   */
  cost: {
    /**
     * Get an aggregate cost summary across all sessions.
     * @returns Summary with totals, period breakdowns, and display mode.
     */
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
    /**
     * List individual cost records, optionally filtered by time range.
     * @param opts - Time range filter using epoch milliseconds.
     * @returns Array of per-turn cost records.
     */
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
    /**
     * Get the current budget configuration and ceilings.
     * @returns Budget limits and auto-pause setting. `null` values mean no limit is set.
     */
    getBudget(): Promise<{
      dailyCeiling: number | null
      weeklyCeiling: number | null
      monthlyCeiling: number | null
      dailyTokenCeiling: number | null
      weeklyTokenCeiling: number | null
      monthlyTokenCeiling: number | null
      autoPauseAtLimit: boolean
    }>
    /**
     * Get cost data aggregated by session.
     * @param opts - Optional filter; `since` is an epoch timestamp in milliseconds.
     * @returns Array of per-session cost aggregates.
     */
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

  /**
   * Feature flags namespace for reading and toggling feature flags.
   * @remarks Requires `feature-flags:read` for reading, `feature-flags:write` for toggling.
   */
  featureFlags: {
    /**
     * Get all feature flags and their current values.
     * @returns Map of flag key to boolean enabled state.
     */
    getAll(): Promise<Record<string, boolean>>
    /**
     * Get the value of a single feature flag.
     * @param key - Feature flag key.
     * @returns `true` if enabled, `false` otherwise.
     */
    get(key: string): Promise<boolean>
    /**
     * Set the value of a feature flag.
     * @param key - Feature flag key.
     * @param value - Whether the flag should be enabled.
     * @remarks Requires `feature-flags:write` permission.
     */
    set(key: string, value: boolean): Promise<void>
  }

  /**
   * Local models namespace for interacting with locally-running AI models (Ollama, LM Studio).
   * @remarks Requires `local-models:access` permission.
   */
  localModels: {
    /**
     * Detect locally-running model servers and list their available models.
     * @returns Connection status and model lists for Ollama and LM Studio.
     */
    detect(): Promise<{
      ollama: { connected: boolean; models: Array<{ name: string; size?: string }> }
      lmstudio: { connected: boolean; models: Array<{ name: string }> }
    }>
    /**
     * Send a chat completion request to a local model.
     * @param opts - Chat options including model name, message history, and optional source.
     * @returns The model's response content.
     */
    chat(opts: {
      model: string
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      source?: 'ollama' | 'lmstudio'
    }): Promise<{ content: string }>
  }

  /**
   * Context utilities namespace.
   * @remarks Requires `context:estimate` permission.
   */
  context: {
    /**
     * Estimate the token count for a string of text.
     * @param text - The text to estimate.
     * @returns Token count and the estimation method used.
     */
    estimateTokens(text: string): Promise<{ tokens: number; method: 'heuristic' }>
  }

  /**
   * Event subscription namespace for listening to host app events.
   *
   * Events include session lifecycle events, theme changes, and custom events
   * emitted by other extensions or the host.
   */
  events: {
    /**
     * Subscribe to a named event.
     * @param event - Event name (e.g., `"session:started"`, `"theme-changed"`).
     * @param callback - Called with event-specific data each time the event fires.
     * @returns An unsubscribe function. Call it to stop receiving this event.
     */
    on(event: string, callback: (data: unknown) => void): () => void
  }

  /**
   * Navigate the host app to a given route path.
   * @param path - The route to navigate to (e.g., `"/insights"`, `"/my-extension/page"`).
   * @remarks Requires `navigation` permission.
   */
  navigate(path: string): Promise<void>
}

/**
 * Context provided to extension main-process entries.
 *
 * The host passes this object to the extension's `main` entry point `activate(ctx)` function,
 * giving the extension access to IPC registration, storage, and logging within the Node.js main process.
 */
export interface ExtensionMainContext {
  /** The unique identifier of this extension, matching the manifest `id`. */
  extensionId: string
  /** Absolute filesystem path to the extension's root directory. */
  extensionPath: string
  /**
   * Register an IPC handler on a channel within this extension's namespace.
   * The host and renderer code can invoke this channel to communicate with the extension's main process.
   * @param channel - Channel name (automatically prefixed with the extension's IPC namespace).
   * @param handler - Async handler called when the channel is invoked. Return value is sent back to the caller.
   */
  registerHandler(channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>): void
  /**
   * Invoke an IPC channel registered by the host or another extension.
   * @param channel - Channel name to invoke.
   * @param args - Arguments forwarded to the handler.
   * @returns The handler's return value.
   */
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  /**
   * Synchronous key-value store scoped to this extension, backed by electron-store.
   * Data persists across app restarts.
   */
  store: {
    /**
     * Get a stored value.
     * @param key - Storage key.
     * @param defaultValue - Value to return if the key does not exist.
     * @returns The stored value, or `defaultValue`.
     */
    get<T = unknown>(key: string, defaultValue?: T): T
    /**
     * Store a value. Must be JSON-serializable.
     * @param key - Storage key.
     * @param value - Value to store.
     */
    set(key: string, value: unknown): void
    /**
     * Delete a key and its value.
     * @param key - Storage key to remove.
     */
    delete(key: string): void
    /**
     * List all keys stored by this extension.
     * @returns Array of key strings.
     */
    keys(): string[]
  }
  /** Structured logger that outputs to the host app's log system, prefixed with the extension ID. */
  log: {
    /** Log an informational message. */
    info(...args: unknown[]): void
    /** Log a warning message. */
    warn(...args: unknown[]): void
    /** Log an error message. */
    error(...args: unknown[]): void
    /** Log a debug message (only visible when debug logging is enabled). */
    debug(...args: unknown[]): void
  }
}

/**
 * Options for `createExtension()`, the renderer-side entry point for a ClearPathAI extension.
 */
export interface CreateExtensionOptions {
  /**
   * Map of named React component exports.
   * Keys must match the `component` references in the manifest's `contributes` sections
   * (e.g., panels, widgets, tabs, sidebar widgets, navigation pages).
   *
   * @example
   * ```tsx
   * { DashboardWidget: MyDashboardWidget, SettingsPanel: MySettings }
   * ```
   */
  components: Record<string, React.ComponentType>
  /**
   * Called when the extension is activated in the renderer.
   * Use this to perform one-time setup such as subscribing to events or loading initial data.
   * @param sdk - The fully initialized SDK client.
   */
  activate?: (sdk: ExtensionSDK) => void | Promise<void>
  /**
   * Called when the extension is deactivated (e.g., disabled by the user or app shutdown).
   * Use this to clean up subscriptions, timers, or other resources.
   */
  deactivate?: () => void | Promise<void>
}
