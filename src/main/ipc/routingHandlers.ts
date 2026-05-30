import type { IpcMain } from 'electron'
import { classify, type ClassifierInput, type ClassificationResult } from '../routing/DifficultyClassifier'
import { resolveModelForDifficulty, type RoutingRules } from '../routing/RoutingRules'
import { providerOf } from '../../shared/backends'
import type { BackendId } from '../../shared/backends'

/**
 * Token Coach Phase 4 — `routing:classify` IPC handler.
 *
 * The renderer's `ModelRoutingChip` calls this debounced 250ms as the user
 * types so the chip preview matches what the main-process pipeline will
 * decide on send. Without this, the chip would have to ship a duplicated
 * classifier into the renderer bundle — that's brittle (easy to drift) AND
 * means the chip can't see the user's latest stored rules without a
 * separate IPC. Routing through main keeps "what the chip says" and "what
 * the pipeline does" identical.
 *
 * Returns `{ classification, routedModel, enabled }`. When `enabled: false`
 * the chip renders in a muted "routing off" state.
 */
export function registerRoutingHandlers(
  ipcMain: IpcMain,
  deps: { getRules: () => RoutingRules },
): void {
  ipcMain.handle(
    'routing:classify',
    (_event, args: ClassifierInput & { cli: BackendId }): {
      classification: ClassificationResult
      routedModel: string
      enabled: boolean
    } => {
      const rules = deps.getRules()
      const classification = classify({
        userText: args.userText ?? '',
        promptTokens: Math.max(0, Math.floor(args.promptTokens ?? 0)),
        hasAttachments: !!args.hasAttachments,
        attachmentCount: Math.max(0, Math.floor(args.attachmentCount ?? 0)),
        hasSlashCommand: !!args.hasSlashCommand,
        isContinuation: !!args.isContinuation,
      })
      const provider = providerOf(args.cli)
      const routedModel = resolveModelForDifficulty(rules, provider, classification.difficulty)
      return { classification, routedModel, enabled: rules.enabled }
    },
  )

  /**
   * Resolve a tier directly to a model id WITHOUT running the classifier.
   * The chip's tier-pick buttons use this so a user clicking "hard" gets the
   * hard-tier model directly instead of synthesizing a fake prompt that
   * happens to classify hard.
   */
  ipcMain.handle(
    'routing:resolve-tier',
    (_event, args: { cli: BackendId; tier: 'trivial' | 'normal' | 'hard' }): { model: string } => {
      const rules = deps.getRules()
      const provider = providerOf(args.cli)
      const tier = args.tier === 'trivial' || args.tier === 'normal' || args.tier === 'hard'
        ? args.tier
        : 'normal'
      return { model: resolveModelForDifficulty(rules, provider, tier) }
    },
  )
}
