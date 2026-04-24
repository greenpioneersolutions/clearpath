export interface HandoffTrigger {
    /** Description of when this trigger fires */
    condition: string;
    /** Which agent to hand off to */
    targetAgentId: string;
    /** The message shown to the user suggesting the handoff */
    suggestionText: string;
}
export interface StarterAgentDefinition {
    id: string;
    name: string;
    tagline: string;
    icon: string;
    category: 'spotlight' | 'default';
    displayOrder: number;
    description: string;
    handles: string[];
    doesNotHandle: string[];
    handoffTriggers: HandoffTrigger[];
    systemPrompt: string;
    associatedSkills: string[];
    primaryMemories: string[];
    secondaryMemories: string[];
}
export interface StarterSkillDefinition {
    id: string;
    name: string;
    description: string;
    inputDescription: string;
    outputDescription: string;
    primaryAgents: string[];
    secondaryAgents: string[];
    skillPrompt: string;
}
export interface MemoryFieldDef {
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'multiline-entries';
    required: boolean;
    placeholder: string;
    helpText: string;
    options?: string[];
}
export interface StarterMemoryDefinition {
    id: string;
    name: string;
    description: string;
    setupPhase: 'onboarding' | 'early' | 'progressive' | 'on-request';
    setupPrompt: string;
    fields: MemoryFieldDef[];
    example: string;
    whatItUnlocks: string;
}
export interface PromptSuggestion {
    id: string;
    displayText: string;
    targetAgentId: string;
    followUpQuestions: string[];
    category: 'spotlight' | 'default';
    displayOrder: number;
}
export interface HandoffContext {
    fromAgentId: string;
    toAgentId: string;
    summary: string;
    originalRequest: string;
    reason: string;
}
export interface HandoffSuggestion {
    targetAgentId: string;
    targetAgentName: string;
    suggestionText: string;
    condition: string;
}
export interface MemorySetupState {
    workProfileComplete: boolean;
    communicationPreferencesPrompted: boolean;
    communicationPreferencesComplete: boolean;
    communicationPreferencesDismissCount: number;
    currentPrioritiesPrompted: boolean;
    currentPrioritiesComplete: boolean;
    currentPrioritiesDismissCount: number;
    stakeholderMapEntries: number;
    workingPreferencesComplete: boolean;
    interactionCount: number;
    hasCompletedFirstInteraction: boolean;
}
