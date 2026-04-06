import type { StarterMemoryDefinition } from '../../renderer/src/types/starter-pack'

export const STARTER_MEMORIES: StarterMemoryDefinition[] = [
  // ── 1. Work Profile ────────────────────────────────────────────────────────
  {
    id: 'work-profile',
    name: 'Work Profile',
    description:
      'Core context about your role, function, and industry. Agents use this to calibrate jargon, depth, and formality.',
    setupPhase: 'onboarding',
    setupPrompt:
      'Tell me a bit about your role so I can calibrate my responses to your context.',
    fields: [
      {
        key: 'role',
        label: 'Role',
        type: 'text',
        required: true,
        placeholder: 'e.g., Engineering Manager, Product Lead, VP of Operations',
        helpText: 'Your current role or title',
      },
      {
        key: 'function',
        label: 'Function',
        type: 'select',
        required: true,
        placeholder: '',
        helpText: 'Your primary functional area',
        options: [
          'Engineering',
          'Product',
          'Design',
          'Marketing',
          'Sales',
          'Operations',
          'Finance',
          'HR',
          'Legal',
          'Executive',
          'Other',
        ],
      },
      {
        key: 'industry',
        label: 'Industry',
        type: 'select',
        required: true,
        placeholder: '',
        helpText: 'Your industry',
        options: [
          'Technology',
          'Finance',
          'Healthcare',
          'Education',
          'Retail',
          'Manufacturing',
          'Government',
          'Consulting',
          'Media',
          'Other',
        ],
      },
      {
        key: 'seniority',
        label: 'Seniority',
        type: 'select',
        required: false,
        placeholder: '',
        helpText: 'Your level in the organization',
        options: [
          'Individual Contributor',
          'Team Lead',
          'Manager',
          'Senior Manager',
          'Director',
          'VP',
          'C-Suite',
        ],
      },
      {
        key: 'teamSize',
        label: 'Team Size',
        type: 'text',
        required: false,
        placeholder: 'e.g., 8 direct reports, 30 in org',
        helpText: 'How many people you manage or work with',
      },
      {
        key: 'techComfort',
        label: 'Technical Comfort',
        type: 'select',
        required: false,
        placeholder: '',
        helpText: 'Your comfort level with technical topics',
        options: ['Non-technical', 'Tech-adjacent', 'Technical', 'Deep technical'],
      },
    ],
    example:
      'Role: Engineering Manager | Function: Engineering | Industry: Technology | Seniority: Manager | Team: 8 direct reports | Tech comfort: Technical',
    whatItUnlocks:
      'Agents calibrate jargon, depth, and formality to your role. A VP gets executive summaries; an IC gets implementation details. Technical comfort determines whether code examples or business analogies are used.',
  },

  // ── 2. Stakeholder Map ─────────────────────────────────────────────────────
  {
    id: 'stakeholder-map',
    name: 'Stakeholder Map',
    description:
      'A running map of key people you interact with, their roles, and what they care about. Agents use this to tailor messages and recommendations.',
    setupPhase: 'progressive',
    setupPrompt:
      'You mentioned {{name}}. Want me to remember their role and what they care about so I can tailor messages to them?',
    fields: [
      {
        key: 'name',
        label: 'Name',
        type: 'text',
        required: true,
        placeholder: 'e.g., Sarah Chen',
        helpText: "Person's name",
      },
      {
        key: 'role',
        label: 'Role',
        type: 'text',
        required: true,
        placeholder: 'e.g., VP of Engineering, Direct Report, Client',
        helpText: 'Their role or relationship to you',
      },
      {
        key: 'whatTheyCareAbout',
        label: 'What They Care About',
        type: 'textarea',
        required: false,
        placeholder: 'e.g., Wants data-driven decisions, cares about team morale',
        helpText: 'What matters most to this person',
      },
      {
        key: 'communicationNotes',
        label: 'Communication Notes',
        type: 'textarea',
        required: false,
        placeholder: 'e.g., Prefers Slack over email, direct communicator',
        helpText: 'How they like to communicate',
      },
    ],
    example:
      'Sarah Chen | VP of Engineering | Cares about: technical rigor, team velocity, clear escalation paths | Comms: Prefers concise Slack messages, reads email on Mondays',
    whatItUnlocks:
      'When you write a message to someone in your stakeholder map, the agent automatically calibrates tone, emphasis, and format to what that person cares about \u2014 without you having to explain every time.',
  },

  // ── 3. Current Priorities ──────────────────────────────────────────────────
  {
    id: 'current-priorities',
    name: 'Current Priorities',
    description:
      'Your top 2-3 priorities this quarter. Agents connect their output to what you are actually working on.',
    setupPhase: 'early',
    setupPrompt:
      "I could be more helpful if I knew your top 2-3 priorities right now. What are you focused on this quarter?",
    fields: [
      {
        key: 'priority',
        label: 'Priority',
        type: 'text',
        required: true,
        placeholder: 'e.g., Q3 platform migration',
        helpText: 'Name of the priority or initiative',
      },
      {
        key: 'description',
        label: 'Description',
        type: 'textarea',
        required: false,
        placeholder: 'e.g., Migrating from monolith to microservices, Phase 2 of 3',
        helpText: 'Brief description and current status',
      },
      {
        key: 'deadline',
        label: 'Deadline',
        type: 'text',
        required: false,
        placeholder: 'e.g., End of Q3, September 30',
        helpText: 'Key deadline or milestone',
      },
      {
        key: 'stakeholders',
        label: 'Stakeholders',
        type: 'text',
        required: false,
        placeholder: 'e.g., CTO (sponsor), Platform team (executing)',
        helpText: 'Who is involved',
      },
    ],
    example:
      '1. Q3 Platform Migration \u2014 Phase 2 of monolith breakup, targeting Sept 30, CTO is sponsor\n2. Hiring \u2014 Need 3 senior engineers by August, working with recruiting\n3. Team health \u2014 Address burnout signals from Q2 survey, 1:1 focus',
    whatItUnlocks:
      'Every agent connects its output to your actual priorities. Chief of Staff builds plans around them. Strategy Partner evaluates decisions against them. Communication Coach references them in stakeholder updates.',
  },

  // ── 4. Communication Preferences ───────────────────────────────────────────
  {
    id: 'communication-preferences',
    name: 'Communication Preferences',
    description:
      'Your preferred communication style, tone, length, and format. Agents match their output to how you like to receive information.',
    setupPhase: 'early',
    setupPrompt:
      "Want me to remember your preferred communication style? Based on our conversation, it seems like you prefer {{inferredStyle}}. I can adjust if that's not right.",
    fields: [
      {
        key: 'tone',
        label: 'Tone',
        type: 'select',
        required: false,
        placeholder: '',
        helpText: 'Your default communication tone',
        options: [
          'Direct and concise',
          'Warm and diplomatic',
          'Formal and structured',
          'Casual and conversational',
        ],
      },
      {
        key: 'length',
        label: 'Length',
        type: 'select',
        required: false,
        placeholder: '',
        helpText: 'How long you like responses',
        options: ['As short as possible', 'Concise but complete', 'Thorough and detailed'],
      },
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        required: false,
        placeholder: '',
        helpText: 'Your preferred output format',
        options: ['Bullet points', 'Short paragraphs', 'Structured with headers', 'Whatever fits'],
      },
      {
        key: 'formality',
        label: 'Formality',
        type: 'select',
        required: false,
        placeholder: '',
        helpText: 'Your default formality level',
        options: ['Very formal', 'Professional', 'Conversational', 'Casual'],
      },
    ],
    example:
      'Tone: Direct and concise | Length: Concise but complete | Format: Bullet points | Formality: Professional',
    whatItUnlocks:
      "Every agent response matches your communication style by default. No more asking for 'make it shorter' or 'use bullet points' \u2014 it's already calibrated.",
  },

  // ── 5. Working Preferences & Constraints ───────────────────────────────────
  {
    id: 'working-preferences',
    name: 'Working Preferences & Constraints',
    description:
      'Advanced preferences like time zone, meeting load, approval rules, and confidentiality constraints that help agents respect your organizational reality.',
    setupPhase: 'on-request',
    setupPrompt:
      'Configure advanced working preferences that help agents respect your constraints.',
    fields: [
      {
        key: 'timeZone',
        label: 'Time Zone',
        type: 'text',
        required: false,
        placeholder: 'e.g., US Pacific, GMT+1',
        helpText: 'Your time zone for scheduling and deadline references',
      },
      {
        key: 'meetingLoad',
        label: 'Meeting Load',
        type: 'select',
        required: false,
        placeholder: '',
        helpText: 'How many hours per week you are in meetings',
        options: [
          'Light (< 10 hrs/week)',
          'Moderate (10-20 hrs/week)',
          'Heavy (20-30 hrs/week)',
          'Extreme (30+ hrs/week)',
        ],
      },
      {
        key: 'approvalRules',
        label: 'Approval Rules',
        type: 'textarea',
        required: false,
        placeholder: 'e.g., Anything over $5K needs VP approval, hiring decisions need HR loop-in',
        helpText: 'Organizational rules that affect your decisions',
      },
      {
        key: 'toolConstraints',
        label: 'Tool Constraints',
        type: 'textarea',
        required: false,
        placeholder: 'e.g., Must use Jira for tracking, GitHub for code, Slack for comms',
        helpText: 'Required tools or platforms',
      },
      {
        key: 'confidentiality',
        label: 'Confidentiality',
        type: 'textarea',
        required: false,
        placeholder: 'e.g., Revenue numbers are confidential, don\'t include in Slack messages',
        helpText: 'Topics or data that should not appear in certain contexts',
      },
    ],
    example:
      'TZ: US Pacific | Meeting load: Heavy | Approvals: >$5K needs VP sign-off | Tools: Jira, GitHub, Slack | Confidential: revenue figures, headcount plans',
    whatItUnlocks:
      "Agents respect your organizational reality. Chief of Staff won't plan deep work during your heavy meeting days. Strategy Partner flags when a decision needs VP approval. Communication Coach avoids putting confidential info in Slack messages.",
  },
]
