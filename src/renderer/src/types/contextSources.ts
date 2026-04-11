// ── Context Source Types ─────────────────────────────────────────────────────
// Shared types for the context source tagging feature.
// Extensions and integrations can declare themselves as context providers
// that users can tag in sessions to inject live data into AI prompts.

export interface ContextProviderParameter {
  id: string
  label: string
  type: 'text' | 'repo-picker' | 'project-picker' | 'select'
  required?: boolean
  options?: Array<{ value: string; label: string }>
  placeholder?: string
}

export interface ContextProviderDeclaration {
  id: string
  label: string
  description: string
  icon: string
  source: 'extension' | 'integration'
  sourceId: string
  sourceName: string
  parameters: ContextProviderParameter[]
  handler: string
  examples: string[]
  maxTokenEstimate?: number
  connected: boolean
}

export interface SelectedContextSource {
  providerId: string
  label: string
  icon: string
  params: Record<string, string>
  paramSummary: string
}

export interface ContextFetchResult {
  success: boolean
  providerId: string
  context: string
  tokenEstimate: number
  error?: string
  metadata?: {
    itemCount?: number
    truncated?: boolean
  }
}
