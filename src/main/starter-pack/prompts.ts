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
]
