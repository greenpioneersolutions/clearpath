// ── Token Coach shared types ──────────────────────────────────────────────────
// Shared between main and renderer via the `rootDirs` virtual merge configured
// in tsconfig.main.json / tsconfig.renderer.json. Must remain dependency-free
// (no Node, no Electron, no React imports).

/**
 * Per-slice prompt breakdown captured when the renderer assembles a prompt.
 * Threaded through `cli:start-session` / `cli:send-input` so the main process
 * can tokenize each slice independently and attribute tokens correctly on the
 * CostRecord. All fields are optional — when omitted, the legacy single-slice
 * attribution applies (the entire prompt becomes `userPromptTokens`).
 */
export interface PromptSlices {
  /** The user's raw typed text — the only slice they actually authored. */
  userText: string
  /** Agent system prompt prepended by the agent resolver. */
  agentPrompt?: string
  /** Notes framing block produced by `notes:get-bundle-for-prompt`. */
  notesFramed?: string
  /** Concatenated context-source blocks (`context-sources:fetch-multi`). */
  contextSources?: string
  /** Fleet-mode instruction prefix. */
  fleetPrefix?: string
}

/**
 * Per-prompt slice-level token breakdown — produced by `measureMiddleware`
 * and the `tokenizer:count-multi` IPC. The chat-input meter chip and the
 * `cli:prompt-shaped` event share this shape.
 *
 * `injectedTotal` = agentPrompt + notesFramed + contextSources + fleetPrefix.
 * `total` = injectedTotal + userPrompt.
 *
 * `cachedInputTokens` is optional and populated only when a direct-API
 * adapter (LocalModelAdapter pointed at Anthropic, today) reports real cache
 * stats from the response. CLI-passthrough breakdowns leave this undefined —
 * the renderer renders that as "no cache data" rather than "0 cached".
 * Token Coach Phase 3.
 */
export interface SliceTokenBreakdown {
  userPrompt: number
  agentPrompt: number
  notesFramed: number
  contextSources: number
  fleetPrefix: number
  injectedTotal: number
  total: number
  /** Optional — see doc comment above. Undefined on CLI-passthrough turns. */
  cachedInputTokens?: number
  /** Optional — cache creation tokens (writes). Pairs with `cachedInputTokens`. */
  cacheCreationTokens?: number
}

/**
 * Aggregated token breakdown across all turns of a session, returned by the
 * `cost:turn-breakdown` IPC handler. Phase 2's context-meter popover and
 * Phase 5's Efficiency tab both read this shape. `cachedInputTokens` and
 * `cacheCreationTokens` stay 0 until Phase 3 hydrates them.
 */
export interface SessionTurnBreakdown {
  userPromptTokens: number
  injectedContextTokens: number
  agentPromptTokens: number
  notesTokens: number
  contextSourcesTokens: number
  cachedInputTokens: number
  cacheCreationTokens: number
  outputTokens: number
  totalTokens: number
  turnCount: number
}
