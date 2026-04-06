import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A WizardField is a single question/input the user fills out.
 */
interface WizardField {
  id: string
  label: string            // Shown above the input
  placeholder: string      // Ghost text inside the input
  type: 'text' | 'textarea' // Short input vs multi-line
  required: boolean
  helpText?: string         // Small hint below the input
}

/**
 * A WizardOption is one of the choices shown on the initial screen.
 * Each option leads to its own set of follow-up fields.
 */
interface WizardOption {
  id: string
  label: string             // Button/card label
  description: string       // Subtitle explaining the option
  icon: string              // Emoji icon
  fields: WizardField[]     // The questions shown after picking this option
  promptTemplate: string    // Template string with {{field_id}} placeholders
}

/**
 * A WizardConfig is one complete wizard template.
 * The default config ships with the app; users can customize in Configure.
 */
interface WizardConfig {
  title: string              // Heading shown at the top
  subtitle: string           // Description below the heading
  initialQuestion: string    // The question that helps them choose an option
  options: WizardOption[]    // The choices available
}

interface WizardContextSettings {
  showUseContext: boolean     // Show the "Use Context" option in the wizard
  showMemories: boolean       // Show memories tab in context picker
  showAgents: boolean         // Show agents tab in context picker
  showSkills: boolean         // Show skills tab in context picker
}

interface WizardStoreSchema {
  config: WizardConfig
  hasCompletedWizard: boolean   // Whether user has ever completed a wizard session
  completedCount: number        // Total completions
  contextSettings: WizardContextSettings
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: WizardConfig = {
  title: 'Session Wizard',
  subtitle: 'Let\'s set up your AI session for the best results. Answer a few questions and we\'ll build the perfect prompt.',
  initialQuestion: 'What are you looking to do?',
  options: [
    {
      id: 'task',
      label: 'Accomplish a Task',
      description: 'I have a specific technical task I need done — code changes, fixes, automation, etc.',
      icon: '🛠️',
      fields: [
        {
          id: 'persona',
          label: 'What role should the AI take on?',
          placeholder: 'e.g., Senior backend developer familiar with Node.js and PostgreSQL',
          type: 'textarea',
          required: true,
          helpText: 'Describe the expertise the AI should bring. Be specific about technologies, frameworks, or domain knowledge.',
        },
        {
          id: 'goal',
          label: 'What is the specific task you need completed?',
          placeholder: 'e.g., Refactor the user authentication module to use JWT tokens instead of session cookies',
          type: 'textarea',
          required: true,
          helpText: 'Be as specific as possible. Include file names, feature names, or ticket numbers if you have them.',
        },
        {
          id: 'process',
          label: 'How should the AI approach this?',
          placeholder: 'e.g., First analyze the current auth flow, then propose the changes before implementing, run tests after',
          type: 'textarea',
          required: false,
          helpText: 'Describe the steps or methodology you\'d like followed. Leave blank to let the AI decide.',
        },
        {
          id: 'verification',
          label: 'How will we know it\'s done correctly?',
          placeholder: 'e.g., All existing tests pass, new JWT tests are added, login/logout flow works end-to-end',
          type: 'textarea',
          required: false,
          helpText: 'Success criteria help the AI know when it\'s finished and self-check its work.',
        },
      ],
      promptTemplate: `You are acting as: {{persona}}

## Task
{{goal}}

## Approach
{{process}}

## Verification & Success Criteria
{{verification}}

Please begin by analyzing the current state, then proceed step by step following the approach outlined above. After completing each step, verify against the success criteria before moving on.`,
    },
    {
      id: 'question',
      label: 'Ask a Question or Get Guidance',
      description: 'I need information, analysis, an explanation, or advice — not necessarily code changes.',
      icon: '💬',
      fields: [
        {
          id: 'persona',
          label: 'What perspective should the AI bring?',
          placeholder: 'e.g., Technical project manager who can explain things in business terms',
          type: 'textarea',
          required: true,
          helpText: 'This shapes how the AI communicates — a developer gives technical depth, a PM gives strategic context.',
        },
        {
          id: 'context',
          label: 'What context does the AI need to know?',
          placeholder: 'e.g., We\'re migrating from AWS to GCP, currently on a Node.js monolith, team of 8 developers',
          type: 'textarea',
          required: true,
          helpText: 'Background information that helps the AI understand your situation. The more context, the better the answer.',
        },
        {
          id: 'goal',
          label: 'What do you want to know or understand?',
          placeholder: 'e.g., What are the risks of this migration and how should we sequence the work?',
          type: 'textarea',
          required: true,
          helpText: 'Your actual question or the problem you\'re trying to solve.',
        },
        {
          id: 'output',
          label: 'What format should the response be in?',
          placeholder: 'e.g., A bullet-point summary with a risk matrix table, written for a non-technical audience',
          type: 'textarea',
          required: false,
          helpText: 'Describe the ideal output: format, length, audience, level of detail. Leave blank for a general response.',
        },
      ],
      promptTemplate: `You are acting as: {{persona}}

## Context
{{context}}

## Question
{{goal}}

## Desired Output
{{output}}

Please provide a thorough, well-structured response. Use the perspective described above and tailor your answer to be actionable and clear.`,
    },
    {
      id: 'review',
      label: 'Review or Analyze Something',
      description: 'I want the AI to examine code, a document, a PR, or a design and give feedback.',
      icon: '🔍',
      fields: [
        {
          id: 'persona',
          label: 'What type of reviewer should the AI be?',
          placeholder: 'e.g., Security-focused code reviewer with experience in OWASP top 10',
          type: 'textarea',
          required: true,
          helpText: 'The review perspective: security, performance, readability, architecture, accessibility, etc.',
        },
        {
          id: 'target',
          label: 'What should be reviewed?',
          placeholder: 'e.g., The changes on the feature/auth-refactor branch, specifically the new middleware files',
          type: 'textarea',
          required: true,
          helpText: 'Be specific about what to review — a file, branch, PR, directory, or concept.',
        },
        {
          id: 'focus',
          label: 'What should the review focus on?',
          placeholder: 'e.g., Security vulnerabilities, error handling, and edge cases',
          type: 'textarea',
          required: false,
          helpText: 'Narrow the focus to get more useful feedback. Leave blank for a general review.',
        },
        {
          id: 'output',
          label: 'How should findings be presented?',
          placeholder: 'e.g., Table with columns: Issue, Severity, Location, Recommendation',
          type: 'textarea',
          required: false,
          helpText: 'Describe the format you want for the review results.',
        },
      ],
      promptTemplate: `You are acting as: {{persona}}

## Review Target
{{target}}

## Review Focus
{{focus}}

## Output Format
{{output}}

Please conduct a thorough review. For each finding, explain what the issue is, why it matters, and how to fix it. Prioritize findings by severity (Critical > High > Medium > Low).`,
    },
  ],
}

// ── Store ────────────────────────────────────────────────────────────────────

const store = new Store<WizardStoreSchema>({
  name: 'clear-path-wizard',
  encryptionKey: getStoreEncryptionKey(),
  defaults: {
    config: DEFAULT_CONFIG,
    hasCompletedWizard: false,
    completedCount: 0,
    contextSettings: {
      showUseContext: true,
      showMemories: true,
      showAgents: true,
      showSkills: true,
    },
  },
})

// ── Registration ─────────────────────────────────────────────────────────────

export function registerWizardHandlers(ipcMain: IpcMain): void {

  ipcMain.handle('wizard:get-config', () => {
    return store.get('config')
  })

  ipcMain.handle('wizard:save-config', (_e, args: { config: WizardConfig }) => {
    store.set('config', args.config)
    return { success: true }
  })

  ipcMain.handle('wizard:reset-config', () => {
    store.set('config', DEFAULT_CONFIG)
    return { success: true, config: DEFAULT_CONFIG }
  })

  ipcMain.handle('wizard:get-state', () => {
    return {
      hasCompletedWizard: store.get('hasCompletedWizard'),
      completedCount: store.get('completedCount'),
    }
  })

  ipcMain.handle('wizard:mark-completed', () => {
    store.set('hasCompletedWizard', true)
    store.set('completedCount', store.get('completedCount') + 1)
    return { success: true }
  })

  // ── Context visibility settings ─────────────────────────────────────────────

  ipcMain.handle('wizard:get-context-settings', () => {
    return store.get('contextSettings')
  })

  ipcMain.handle('wizard:set-context-settings', (_e, args: Partial<WizardContextSettings>) => {
    const current = store.get('contextSettings')
    const updated = { ...current, ...args }
    store.set('contextSettings', updated)
    return updated
  })

  // Build the final prompt from a selected option and field values
  ipcMain.handle('wizard:build-prompt', (_e, args: { optionId: string; values: Record<string, string> }) => {
    const config = store.get('config')
    const option = config.options.find((o) => o.id === args.optionId)
    if (!option) return { success: false, error: 'Option not found' }

    let prompt = option.promptTemplate
    for (const [key, value] of Object.entries(args.values)) {
      const replacement = value.trim() || '(not specified)'
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), replacement)
    }

    // Clean up any unreplaced placeholders
    prompt = prompt.replace(/\{\{[^}]+\}\}/g, '(not specified)')

    return { success: true, prompt }
  })
}
