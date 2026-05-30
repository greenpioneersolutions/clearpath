import type { PromptSuggestion } from '../../renderer/src/types/starter-pack'

export const STARTER_PROMPTS: PromptSuggestion[] = [
  {
    id: 'communication-draft',
    displayText: 'Help me write a message to someone that lands well',
    targetAgentId: 'communication-coach',
    category: 'spotlight',
    displayOrder: 1,
    followUpQuestions: ['Who are you writing to?', "What's the topic or situation?"],
  },
  {
    id: 'research-brief',
    displayText: 'Research a topic and give me a decision brief I can act on',
    targetAgentId: 'research-analyst',
    category: 'spotlight',
    displayOrder: 2,
    followUpQuestions: ['What do you need to decide or understand?'],
  },
  {
    id: 'meeting-followup',
    displayText: 'Turn my meeting notes into decisions, owners, deadlines, and follow-ups',
    targetAgentId: 'chief-of-staff',
    category: 'spotlight',
    displayOrder: 3,
    followUpQuestions: ['Paste or upload your meeting notes.'],
  },
  {
    id: 'decision-analysis',
    displayText: 'Help me decide between my options \u2014 lay out the trade-offs',
    targetAgentId: 'strategy-decision-partner',
    category: 'default',
    displayOrder: 4,
    followUpQuestions: ['What are you deciding between?'],
  },
  {
    id: 'technical-review',
    displayText: 'Review this code or explain a technical concept at my level',
    targetAgentId: 'technical-reviewer',
    category: 'default',
    displayOrder: 5,
    followUpQuestions: ['Paste code for review, or tell me what you want to understand.'],
  },
  {
    id: 'weekly-planning',
    displayText: 'Plan my week \u2014 help me prioritize what matters most',
    targetAgentId: 'chief-of-staff',
    category: 'default',
    displayOrder: 6,
    followUpQuestions: ["What's on your plate this week?"],
  },
  // \u2500\u2500 Launchpad spotlight (Sessions QuickStartCard cold-start chips) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // These are non-technical, project-agnostic prompts that render as small
  // chip buttons below the empty Quick Start textarea. They are filtered out
  // of the Home hub and TryAnExampleModal surfaces \u2014 see PromptSuggestion JSDoc.
  {
    id: 'launchpad-explain-project',
    displayText: "Explain this project like I'm new",
    targetAgentId: 'technical-reviewer',
    category: 'launchpad-spotlight',
    displayOrder: 7,
    followUpQuestions: ["What part of the project do you want explained first?"],
  },
  {
    id: 'launchpad-summarize-week',
    displayText: 'Summarize what changed this week',
    targetAgentId: 'chief-of-staff',
    category: 'launchpad-spotlight',
    displayOrder: 8,
    followUpQuestions: ["Any specific area \u2014 code, docs, decisions \u2014 to focus on?"],
  },
  {
    id: 'launchpad-status-update',
    displayText: 'Draft a status update for my team',
    targetAgentId: 'communication-coach',
    category: 'launchpad-spotlight',
    displayOrder: 9,
    followUpQuestions: ["Who's the audience and what should they take away?"],
  },
]
