import type { FeatureFlags } from '../contexts/FeatureFlagContext'

export type ProgressionStage = 'new' | 'exploring' | 'comfortable' | 'power'

export interface StageInfo {
  stage: ProgressionStage
  label: string
  description: string
  sessionCount: number
}

/**
 * Maps the user's session count to a progression stage. The thresholds are
 * deliberately gentle so the app gradually reveals features as the user gets
 * comfortable, rather than dumping everything on day one.
 */
export function getProgressionStage(sessionCount: number): ProgressionStage {
  if (sessionCount < 1) return 'new'
  if (sessionCount < 5) return 'exploring'
  if (sessionCount < 15) return 'comfortable'
  return 'power'
}

const STAGE_LABELS: Record<ProgressionStage, { label: string; description: string }> = {
  new: { label: 'New', description: 'Welcome — start with the basics. More features unlock as you go.' },
  exploring: { label: 'Exploring', description: 'You\'re getting the hang of it. A few more options now available.' },
  comfortable: { label: 'Comfortable', description: 'Most features are now available. Connect external tools if helpful.' },
  power: { label: 'Power User', description: 'Everything is available, including advanced settings and background tasks.' },
}

export function getStageInfo(sessionCount: number): StageInfo {
  const stage = getProgressionStage(sessionCount)
  return { stage, sessionCount, ...STAGE_LABELS[stage] }
}

/**
 * Returns flag overrides for a given stage. Only flags explicitly set here are
 * affected — any flag not in the returned object retains the user's stored value.
 *
 * The progression is additive: each stage builds on the previous one.
 */
export function getStageFlagOverrides(stage: ProgressionStage): Partial<FeatureFlags> {
  // New users (0 sessions): minimal surface — Home, Work, Settings only
  const newStage: Partial<FeatureFlags> = {
    showDashboard: true,
    showWork: true,
    showInsights: false,
    showConfigure: true,
    showLearn: true,
    showSetupWizard: true,
    showSettings: true,
    showMemory: true,
    showAgentSelection: false,
    showSkillsManagement: false,
    showSessionWizard: false,
    showWorkspaces: false,
    showTeamHub: false,
    showScheduler: false,
    showComposer: false,
    showSubAgents: false,
    showTemplates: false,
    showKnowledgeBase: false,
    showVoice: false,
    showPolicies: false,
    showIntegrations: false,
    showPlugins: false,
    showEnvVars: false,
    showWebhooks: false,
    showDataManagement: false,
    showCostTracking: false,
  }

  if (stage === 'new') return newStage

  // Exploring (1-4 sessions): unlock Insights, Prompts/Playbooks selection in chat
  const exploring: Partial<FeatureFlags> = {
    ...newStage,
    showInsights: true,
    showAgentSelection: true,
    showSkillsManagement: true,
    showTemplates: true,
    showCostTracking: true,
    showNotes: true,
  }

  if (stage === 'exploring') return exploring

  // Comfortable (5-14 sessions): unlock Connect (integrations/extensions), guided workflows, session wizard
  const comfortable: Partial<FeatureFlags> = {
    ...exploring,
    showSessionWizard: true,
    showIntegrations: true,
    showWorkspaces: true,
    showDataManagement: true,
  }

  if (stage === 'comfortable') return comfortable

  // Power (15+ sessions): unlock everything advanced
  return {
    ...comfortable,
    showComposer: true,
    showSubAgents: true,
    showKnowledgeBase: true,
    showScheduler: true,
    showPolicies: true,
    showTeamHub: true,
    showPlugins: true,
    showEnvVars: true,
    showWebhooks: true,
  }
}

/**
 * Applies stage-based overrides on top of a base flag set. If a flag is explicitly
 * set in `userOverrides`, that value wins (so power users can keep features they
 * manually disabled).
 */
export function mergeStageFlags(
  baseFlags: FeatureFlags,
  stage: ProgressionStage,
  userOverrides: Partial<FeatureFlags> = {},
): FeatureFlags {
  const stageOverrides = getStageFlagOverrides(stage)
  return { ...baseFlags, ...stageOverrides, ...userOverrides }
}
