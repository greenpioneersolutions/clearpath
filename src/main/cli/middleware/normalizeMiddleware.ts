import type { Middleware } from './pipeline'

/**
 * Whitespace/encoding normalization. CRLF→LF and BOM strip — applied to the
 * full prompt and (when present and matching) the user-text slice. We
 * deliberately keep this trivial: the lint middleware does the more invasive
 * cleanup; this one just makes sure downstream code never has to deal with
 * mixed line endings.
 */
function normalize(text: string): string {
  // Strip BOM at the very start of the string.
  let out = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  // CRLF / CR → LF.
  out = out.replace(/\r\n?/g, '\n')
  return out
}

export const normalizeMiddleware: Middleware = (ctx) => {
  const originalPrompt = ctx.prompt
  const normalizedPrompt = normalize(originalPrompt)
  if (normalizedPrompt === originalPrompt && !ctx.slices) {
    return ctx
  }

  let nextSlices = ctx.slices
  if (ctx.slices) {
    // Only rewrite the slices we care about. If userText was equal to the
    // original prompt we keep it in sync — otherwise we still normalize each
    // slice individually so any per-slice tokenization downstream sees clean
    // text.
    const normalizedUser    = ctx.slices.userText        !== undefined ? normalize(ctx.slices.userText)        : ctx.slices.userText
    const normalizedAgent   = ctx.slices.agentPrompt     !== undefined ? normalize(ctx.slices.agentPrompt)     : ctx.slices.agentPrompt
    const normalizedNotes   = ctx.slices.notesFramed     !== undefined ? normalize(ctx.slices.notesFramed)     : ctx.slices.notesFramed
    const normalizedCtxSrc  = ctx.slices.contextSources  !== undefined ? normalize(ctx.slices.contextSources)  : ctx.slices.contextSources
    const normalizedFleet   = ctx.slices.fleetPrefix     !== undefined ? normalize(ctx.slices.fleetPrefix)     : ctx.slices.fleetPrefix
    nextSlices = {
      ...ctx.slices,
      userText: normalizedUser as string,
      ...(normalizedAgent  !== undefined ? { agentPrompt:    normalizedAgent  } : {}),
      ...(normalizedNotes  !== undefined ? { notesFramed:    normalizedNotes  } : {}),
      ...(normalizedCtxSrc !== undefined ? { contextSources: normalizedCtxSrc } : {}),
      ...(normalizedFleet  !== undefined ? { fleetPrefix:    normalizedFleet  } : {}),
    }
  }

  return { ...ctx, prompt: normalizedPrompt, slices: nextSlices }
}
