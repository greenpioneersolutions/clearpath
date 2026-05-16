import type { IpcMain } from 'electron'
import type { PromptSlices } from '../../shared/tokenization/types'
import { computeBreakdown, type SliceTokenBreakdown } from '../tokenization/computeBreakdown'

/**
 * Renderer-facing token-count IPC. Phase 2's context-meter chip calls this
 * while the user is typing (debounced) so the meter updates without firing a
 * turn. Shares the same `computeBreakdown` helper as `measureMiddleware` so
 * the renderer-side number matches the post-lint number that ships on
 * `cli:prompt-shaped`.
 */
export function registerTokenizerHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'tokenizer:count-multi',
    (_e, args: { slices?: PromptSlices; prompt?: string; model: string }): SliceTokenBreakdown => {
      // `prompt` is the legacy single-blob shape — pass it through so the
      // breakdown helper can attribute it all to userPrompt.
      return computeBreakdown(args.slices, args.model || 'unknown', args.prompt)
    },
  )
}
