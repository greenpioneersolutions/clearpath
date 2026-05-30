/**
 * Centralized user-facing copy for the Sessions launchpad surface.
 *
 * Why this file exists: PR 1 and PR 2 of the Sessions Launchpad UX Redesign
 * (April-May 2026) finalized the wording for QuickStartCard and
 * PickUpWhereYouLeftOffCard. With the chip toolbar refactor (PR 3) we now
 * have one place to look when a copy edit comes in, and tests can assert
 * against the constant instead of duplicating the strings.
 *
 * Out of scope: strings inside ActiveSessionsCard, RecentSessionsCard,
 * WorkflowsCard, and NotesDiscoveryCard. Those surfaces weren't part of
 * the redesign and aren't yet stable enough to centralize — leaving them
 * inline avoids premature consolidation churn.
 */
export const LAUNCHPAD_COPY = {
  quickStart: {
    title: 'Start something new',
    subtitle: "Describe a task. Your AI can read your project, find things, and write for you.",
    placeholder: "What do you want to do? Describe a task and we'll start a new chat.",
    submitLabel: 'New Chat',
    /** Legacy "+ Add context" disclosure was removed in PR 3 and replaced with
     *  the chip toolbar. The toggle test ID stays on the back-compat path for
     *  any external automation that may query this surface. */
    customizeLabel: '⚙ Customize',
    /** Each chip is its own popover trigger. The Files chip is intentionally
     *  visible-but-disabled so the slot exists in the toolbar for a future
     *  file-attach feature. */
    chips: {
      agent: '+ Agent',
      skill: '+ Skill',
      note: '+ Note',
      files: 'Files (soon)',
      filesTooltip: 'File attachments are coming in a future update.',
    },
    /** Hint copy that sits under each picker's label. Kept on
     *  LAUNCHPAD_COPY so a designer or PM can tweak wording without
     *  hunting through the component tree. */
    hints: {
      agent: 'A persona for this chat — e.g. Senior Code Reviewer or Release Manager.',
      skills: 'Capabilities to use — e.g. summarize, find references, write release notes.',
      notes: 'Saved facts to include — e.g. team conventions, project glossary.',
    },
    /** Plain-English permission mode hints (PR 1 of the redesign). The
     *  `value` strings themselves are NOT user copy — they flow unchanged to
     *  the `--permission-mode` CLI flag and live in QuickStartCard.tsx. */
    permissionHints: {
      default: 'Safest. AI pauses for approval on edits.',
      plan: 'Read-only. Good for exploration.',
      acceptEdits: 'Faster. AI edits files without asking.',
      bypassPermissions: 'No prompts. Trust the AI completely.',
    },
    /** Popover-internal labels. Reused by AttachmentPopover headers and
     *  SectionPicker empty states so the names stay in lockstep across
     *  the chip, the popover, and the selected chip pills above the
     *  input. */
    popovers: {
      agentTitle: 'Pick an agent',
      skillTitle: 'Pick skills',
      noteTitle: 'Pick notes',
    },
  },
  pickUp: {
    title: 'Pick up where you left off',
    subtitle: 'Resume an active chat or revisit a recent session.',
    emptyAll: 'No work yet. Start something on the left.',
  },
} as const

export type LaunchpadCopy = typeof LAUNCHPAD_COPY
