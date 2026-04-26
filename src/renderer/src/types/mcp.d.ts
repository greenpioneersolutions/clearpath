/**
 * Shared types for the centralized MCP management system.
 *
 * The MCP Registry is the source of truth. On every mutation, the registry is
 * rendered to the four CLI-native config files (Copilot + Claude × global + project).
 * The CLIs load those rendered files through their standard precedence rules.
 */
export interface McpRegistryTargets {
    copilot: boolean;
    claude: boolean;
}
export type McpRegistrySource = 'catalog' | 'custom' | 'imported';
export type McpRegistryScope = 'global' | 'project';
export interface McpRegistryEntry {
    /** Stable UUID; surface key used everywhere in the app */
    id: string;
    /** User-visible name + written as `mcpServers[name]` in the rendered file */
    name: string;
    /** Optional description (from catalog or user-entered) */
    description?: string;
    /** The binary/command to spawn (e.g. 'npx', 'node', 'docker') */
    command: string;
    args: string[];
    /** Plain (non-secret) environment variables */
    env: Record<string, string>;
    /** Map of env var name → keychain key for secret values */
    secretRefs: Record<string, string>;
    scope: McpRegistryScope;
    /** Only used when scope === 'project' */
    projectPath?: string;
    /** Which CLIs should render this entry to their config files */
    targets: McpRegistryTargets;
    /** Maps to `disabled: !enabled` in rendered output */
    enabled: boolean;
    /** Where this entry came from */
    source: McpRegistrySource;
    /** Links back to the catalog template id, if installed from one */
    catalogId?: string;
    /** ISO timestamps */
    createdAt: string;
    updatedAt: string;
}
export interface McpCatalogEnvVarSchema {
    name: string;
    description: string;
    secret: boolean;
    required: boolean;
    placeholder?: string;
}
export interface McpCatalogEntry {
    /** Stable catalog id (e.g. 'filesystem', 'github', 'postgres') */
    id: string;
    displayName: string;
    description: string;
    iconUrl?: string;
    homepageUrl: string;
    command: string;
    args: string[];
    envSchema: McpCatalogEnvVarSchema[];
    recommendedFor?: ('copilot' | 'claude')[];
}
/** Shape used to add a new registry entry (id + timestamps assigned by handler). */
export type McpRegistryEntryInput = Omit<McpRegistryEntry, 'id' | 'createdAt' | 'updatedAt'>;
export interface McpRegistryAddRequest {
    entry: McpRegistryEntryInput;
    /**
     * Plaintext secret values keyed by env-var name. The handler stores them in
     * the vault and populates `entry.secretRefs` accordingly.
     */
    secrets?: Record<string, string>;
}
export interface McpRegistryAddResponse {
    success: boolean;
    id?: string;
    error?: string;
    warning?: string;
}
export interface McpRegistryUpdateRequest {
    id: string;
    partial: Partial<McpRegistryEntry>;
    secrets?: Record<string, string>;
}
export interface McpRegistryUpdateResponse {
    success: boolean;
    error?: string;
    warning?: string;
}
export interface McpRegistryRemoveRequest {
    id: string;
}
export interface McpRegistryRemoveResponse {
    success: boolean;
    error?: string;
}
export interface McpRegistryToggleRequest {
    id: string;
    enabled: boolean;
}
export interface McpRegistryToggleResponse {
    success: boolean;
    error?: string;
}
/** Metadata returned from the secrets vault — never includes plaintext values. */
export interface McpSecretsMeta {
    keys: string[];
    unsafeMode: boolean;
}
export interface McpSyncResult {
    success: boolean;
    filesWritten: string[];
    errors: Array<{
        path: string;
        error: string;
    }>;
}
