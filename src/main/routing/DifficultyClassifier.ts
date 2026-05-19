/**
 * Token Coach Phase 4 — Difficulty classifier.
 *
 * Pure heuristic — NO LLM call. Cheap enough to run on every keystroke in the
 * renderer's preview path AND on every turn in the main-process pipeline.
 *
 * Output is a 3-bucket difficulty (`trivial | normal | hard`) plus a confidence
 * in [0, 1] and a list of reason strings the UI uses for tooltips so the user
 * understands WHY the chip picked a given tier.
 *
 * Design constraints (per the Phase 4 plan):
 *   - Signals are simple, additive booleans — no thresholds that span both
 *     trivial and hard at the same time. Hard signals dominate trivial signals
 *     when both fire (a long prompt with no fences is still hard).
 *   - Continuation turns (turnIndex > 0) get a mild downgrade because carried
 *     context already pays for the model size — but a substantive code fence
 *     (≥ 5 non-empty lines) overrides the downgrade.
 *   - Confidence is highest when every signal in a tier fires and there are no
 *     conflicting cross-tier signals. Default 0.6 for normal (the "I'm not
 *     sure" tier) keeps the chip from feeling overconfident.
 *
 * NOTE: this file is reachable from BOTH main (pipeline, IPC) and renderer
 * (live preview). Keep it dependency-free.
 */

export type Difficulty = 'trivial' | 'normal' | 'hard'

export interface ClassificationResult {
  difficulty: Difficulty
  /** 0..1 — how confident we are in the bucket. */
  confidence: number
  /**
   * Human-readable reasons in the order they fired. The chip's tooltip
   * surfaces these so the user can see why we routed a given way.
   */
  reasons: string[]
}

export interface ClassifierInput {
  /** The raw user text (post-lint is fine — most signals are length/shape-based). */
  userText: string
  /** Token count from measureMiddleware, or a renderer-side estimate. */
  promptTokens: number
  /** Whether the user attached files (≥ 2 attachments is a hard signal). */
  hasAttachments: boolean
  /** Per-attachment count, used to detect the "≥ 2 attachments" hard signal. */
  attachmentCount?: number
  /** True when prompt starts with `/` (slash command — usually trivial). */
  hasSlashCommand: boolean
  /** True when this is turn 2+ of a session. */
  isContinuation: boolean
}

// ── Constants (tuneable; tests pin the current values) ──────────────────────

/** Trivial: prompts shorter than this in tokens AND under TRIVIAL_MAX_CHARS. */
const TRIVIAL_MAX_TOKENS = 30
const TRIVIAL_MAX_CHARS = 200

/** Hard: prompts longer than this many tokens are always at least normal. */
const HARD_MIN_TOKENS = 400

/** Hard: code fence with this many non-empty content lines counts as substantive. */
const SUBSTANTIVE_FENCE_MIN_LINES = 5

/** Hard: keywords that signal multi-step / architecture work. */
const MULTI_STEP_KEYWORDS = [
  'plan',
  'refactor',
  'implement',
  'across the codebase',
  'walk through',
  'design',
  'architect',
  'rewrite',
]

/** Hard: explicit thinking-mode keywords from the user. */
const THINKING_KEYWORDS = [
  'think hard',
  'think step by step',
  'step by step',
  'reason carefully',
  'walk me through',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the count of non-empty lines inside the FIRST fenced code block
 * found in the text. Returns 0 if there's no fence. We only check the first
 * fence because a single substantive paste is enough to bump difficulty —
 * counting all fences would double-count when the user pastes the same log
 * twice.
 */
function firstFenceContentLines(text: string): number {
  // Match ```optional-lang\n ... \n``` non-greedy. The `s` flag lets `.` match
  // newlines inside the fence body.
  const m = /```[^\n]*\n([\s\S]*?)```/m.exec(text)
  if (!m) return 0
  const body = m[1] ?? ''
  return body.split('\n').filter((line) => line.trim().length > 0).length
}

function containsAny(haystack: string, needles: readonly string[]): string | null {
  const lower = haystack.toLowerCase()
  for (const needle of needles) {
    if (lower.includes(needle)) return needle
  }
  return null
}

function isSingleSentence(text: string): boolean {
  // Strip trailing whitespace / single trailing punctuation, then count
  // sentence-terminators. "What time is it in Tokyo?" → one terminator at end → single.
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  // Match . ! ? followed by whitespace OR end-of-string. Any internal
  // terminator (not at end) means multiple sentences.
  const matches = trimmed.match(/[.!?](\s|$)/g)
  if (!matches) return true
  // Allow exactly one terminator and only when it's the final char.
  if (matches.length > 1) return false
  return /[.!?]$/.test(trimmed)
}

// ── Public API ───────────────────────────────────────────────────────────────

export function classify(input: ClassifierInput): ClassificationResult {
  const reasons: string[] = []
  const { userText, promptTokens, hasAttachments, attachmentCount = 0, hasSlashCommand, isContinuation } = input

  // ── Hard signals (collected first; any one bumps to hard) ──────────────────
  const hardSignals: string[] = []

  if (promptTokens >= HARD_MIN_TOKENS) {
    hardSignals.push(`long prompt (${promptTokens} tok)`)
  }

  const fenceLines = firstFenceContentLines(userText)
  if (fenceLines >= SUBSTANTIVE_FENCE_MIN_LINES) {
    hardSignals.push(`code fence with ${fenceLines} lines`)
  }

  const multiStepHit = containsAny(userText, MULTI_STEP_KEYWORDS)
  if (multiStepHit) {
    hardSignals.push(`multi-step keyword "${multiStepHit}"`)
  }

  if (attachmentCount >= 2) {
    hardSignals.push(`${attachmentCount} attachments`)
  }

  const thinkingHit = containsAny(userText, THINKING_KEYWORDS)
  if (thinkingHit) {
    hardSignals.push(`thinking-mode keyword "${thinkingHit}"`)
  }

  // ── Trivial signals (every one must fire for a strong trivial verdict) ─────
  const trivialSignals: string[] = []
  const shortByTokens = promptTokens <= TRIVIAL_MAX_TOKENS
  const shortByChars = userText.length <= TRIVIAL_MAX_CHARS
  if (shortByTokens) trivialSignals.push(`short prompt (${promptTokens} tok)`)
  if (shortByChars && !shortByTokens) trivialSignals.push(`short text (${userText.length} chars)`)
  const hasNoCodeFence = fenceLines === 0
  if (hasNoCodeFence) trivialSignals.push('no code fences')
  const isSingle = isSingleSentence(userText)
  if (isSingle) trivialSignals.push('single sentence')
  const endsWithQuestion = userText.trim().endsWith('?')
  if (endsWithQuestion) trivialSignals.push('question form')
  if (!hasAttachments) trivialSignals.push('no attachments')

  // ── Bucket decision ────────────────────────────────────────────────────────
  let difficulty: Difficulty
  let confidence: number

  if (hardSignals.length > 0) {
    difficulty = 'hard'
    // Confidence climbs with stacked hard signals — 0.7 for one, +0.1 per
    // additional, capped at 0.95 (we never claim certainty from a heuristic).
    confidence = Math.min(0.95, 0.7 + 0.1 * (hardSignals.length - 1))
    for (const r of hardSignals) reasons.push(r)
  } else if (
    shortByTokens
    && shortByChars
    && hasNoCodeFence
    && isSingle
    && !hasAttachments
  ) {
    // Strong trivial: every gate passed. Question-form / slash isn't required
    // but DOES bump confidence further.
    difficulty = 'trivial'
    confidence = 0.85
    if (endsWithQuestion) confidence = Math.min(0.95, confidence + 0.05)
    if (hasSlashCommand) confidence = Math.min(0.95, confidence + 0.05)
    for (const r of trivialSignals) reasons.push(r)
    if (hasSlashCommand) reasons.push('slash command')
  } else if (
    // Weak trivial: short + no fence + no attachments. Don't require question/single-sentence.
    shortByTokens && hasNoCodeFence && !hasAttachments
  ) {
    difficulty = 'trivial'
    // Lower confidence — we matched the cheap signals but not every one.
    confidence = 0.65
    for (const r of trivialSignals) reasons.push(r)
  } else {
    difficulty = 'normal'
    confidence = 0.6
    // Surface the loudest signals so the tooltip still has SOMETHING to show.
    if (promptTokens > 0) reasons.push(`medium prompt (${promptTokens} tok)`)
    if (!hasNoCodeFence && fenceLines > 0) reasons.push(`code fence with ${fenceLines} lines`)
    if (hasAttachments) reasons.push(`${attachmentCount || 1} attachment(s)`)
  }

  // ── Continuation penalty ───────────────────────────────────────────────────
  // Subsequent turns are typically smaller asks — the heavy context is
  // already paid for. We mildly downgrade `hard → normal` and `normal →
  // trivial`. But a substantive code fence overrides the downgrade — pasting
  // a fresh 200-line stack trace mid-conversation IS still a hard turn.
  if (isContinuation && fenceLines < SUBSTANTIVE_FENCE_MIN_LINES) {
    if (difficulty === 'hard') {
      // Only downgrade hard when there's exactly ONE hard signal (the cheap
      // case where length pushed it over). Stacked hard signals stick.
      if (hardSignals.length === 1) {
        difficulty = 'normal'
        confidence = 0.55
        reasons.push('continuation turn — downgraded from hard')
      }
    } else if (difficulty === 'normal') {
      difficulty = 'trivial'
      confidence = 0.55
      reasons.push('continuation turn — downgraded from normal')
    }
  }

  return { difficulty, confidence, reasons }
}

// Exported for test-coverage of the pure helpers (so we don't have to feed
// every possible prompt through `classify` to verify shape parsing).
export const __test_internals = {
  firstFenceContentLines,
  isSingleSentence,
  containsAny,
  MULTI_STEP_KEYWORDS,
  THINKING_KEYWORDS,
  TRIVIAL_MAX_TOKENS,
  HARD_MIN_TOKENS,
  SUBSTANTIVE_FENCE_MIN_LINES,
}
