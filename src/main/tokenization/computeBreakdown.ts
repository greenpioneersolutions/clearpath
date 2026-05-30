import type { PromptSlices, SliceTokenBreakdown } from '../../shared/tokenization/types'
import { tokenCounter, type TokenCounter } from './TokenCounter'

// Re-export for legacy import paths inside the main process.
export type { SliceTokenBreakdown }

/**
 * Tokenize each slice in `slices` independently using the routing baked into
 * `TokenCounter` (Anthropic / OpenAI / heuristic). When `slices` is undefined,
 * we fall back to tokenizing the full prompt as a single user-text slice — that
 * mirrors the legacy single-slice attribution path on the cost-record side.
 */
export function computeBreakdown(
  slices: PromptSlices | undefined,
  model: string,
  fullPrompt?: string,
  counter: Pick<TokenCounter, 'count'> = tokenCounter,
): SliceTokenBreakdown {
  if (!slices) {
    const userPrompt = fullPrompt ? counter.count(fullPrompt, model) : 0
    return {
      userPrompt,
      agentPrompt: 0,
      notesFramed: 0,
      contextSources: 0,
      fleetPrefix: 0,
      injectedTotal: 0,
      total: userPrompt,
    }
  }

  const userPrompt     = slices.userText        ? counter.count(slices.userText,        model) : 0
  const agentPrompt    = slices.agentPrompt     ? counter.count(slices.agentPrompt,     model) : 0
  const notesFramed    = slices.notesFramed     ? counter.count(slices.notesFramed,     model) : 0
  const filesFramed    = slices.filesFramed     ? counter.count(slices.filesFramed,     model) : 0
  const contextSources = slices.contextSources  ? counter.count(slices.contextSources,  model) : 0
  const fleetPrefix    = slices.fleetPrefix     ? counter.count(slices.fleetPrefix,     model) : 0
  // filesFramed is folded into notesFramed for the breakdown's reference-context
  // bucket — it carries no dedicated field, but it MUST be counted so the meter
  // total matches the assembled prompt (which now includes the file block).
  const injectedTotal  = agentPrompt + notesFramed + filesFramed + contextSources + fleetPrefix
  return {
    userPrompt,
    agentPrompt,
    notesFramed: notesFramed + filesFramed,
    contextSources,
    fleetPrefix,
    injectedTotal,
    total: injectedTotal + userPrompt,
  }
}
