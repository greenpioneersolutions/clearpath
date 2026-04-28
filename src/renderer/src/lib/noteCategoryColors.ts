/**
 * Shared category color mapping for notes.
 *
 * Used by both the dark-themed in-session ContextPicker and the dedicated
 * Notes page. Pulled out of ContextPicker so the two surfaces never drift —
 * if we add a category, both update together.
 */
export const NOTE_CATEGORIES = [
  'meeting',
  'conversation',
  'reference',
  'outcome',
  'idea',
  'custom',
] as const

export type NoteCategory = (typeof NOTE_CATEGORIES)[number]

/** Dark-mode badge colors (used by ContextPicker + Notes list cards). */
export const NOTE_CATEGORY_COLORS_DARK: Record<string, string> = {
  meeting: 'bg-blue-900/30 text-blue-400',
  conversation: 'bg-green-900/30 text-green-400',
  reference: 'bg-purple-900/30 text-purple-400',
  outcome: 'bg-amber-900/30 text-amber-400',
  idea: 'bg-pink-900/30 text-pink-400',
  custom: 'bg-gray-800 text-gray-400',
}

export function categoryColorClass(category: string): string {
  return NOTE_CATEGORY_COLORS_DARK[category] ?? NOTE_CATEGORY_COLORS_DARK.custom
}
