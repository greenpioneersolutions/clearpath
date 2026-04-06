import type { HandoffContext, HandoffSuggestion } from '../../renderer/src/types/starter-pack'
import { STARTER_AGENTS } from './agents'

/**
 * Agent Handoff Service
 *
 * Manages the context transfer between agents when a handoff is suggested.
 * Handoffs are not automatic — they are suggestions shown to the user who
 * can accept or dismiss them.
 */

/** Map of valid handoff paths: fromAgentId → toAgentId[] */
export const HANDOFF_MAP: Record<string, string[]> = {
  'communication-coach': ['research-analyst', 'strategy-decision-partner'],
  'research-analyst': ['strategy-decision-partner', 'communication-coach'],
  'chief-of-staff': ['strategy-decision-partner', 'communication-coach'],
  'strategy-decision-partner': ['research-analyst', 'chief-of-staff', 'communication-coach'],
  'technical-reviewer': ['strategy-decision-partner', 'communication-coach'],
}

export class AgentHandoffService {
  /**
   * Check if the current agent's response should trigger a handoff suggestion.
   * Uses keyword matching against the agent's defined handoff triggers.
   */
  checkForHandoff(
    currentAgentId: string,
    responseContent: string,
    userRequest: string,
  ): HandoffSuggestion | null {
    const agent = STARTER_AGENTS.find((a) => a.id === currentAgentId)
    if (!agent) return null

    const combined = (responseContent + ' ' + userRequest).toLowerCase()

    for (const trigger of agent.handoffTriggers) {
      if (this.matchesTriggerCondition(trigger.condition, combined, currentAgentId)) {
        const targetAgent = STARTER_AGENTS.find((a) => a.id === trigger.targetAgentId)
        if (!targetAgent) continue

        return {
          targetAgentId: trigger.targetAgentId,
          targetAgentName: targetAgent.name,
          suggestionText: trigger.suggestionText,
          condition: trigger.condition,
        }
      }
    }

    return null
  }

  /**
   * Build the context transfer object when user accepts a handoff.
   */
  buildHandoffContext(
    fromAgentId: string,
    toAgentId: string,
    previousOutput: string,
    originalRequest: string,
    reason: string,
  ): HandoffContext {
    return {
      fromAgentId,
      toAgentId,
      summary: this.summarizePreviousOutput(previousOutput),
      originalRequest,
      reason,
    }
  }

  /**
   * Inject handoff context into the receiving agent's session.
   * This is prepended to the agent's system prompt for the new session.
   */
  buildHandoffSystemPromptAddition(context: HandoffContext): string {
    const fromAgent = STARTER_AGENTS.find((a) => a.id === context.fromAgentId)
    const fromName = fromAgent?.name ?? context.fromAgentId

    return [
      '<handoff_context>',
      `You are continuing work that was started by the ${fromName} agent.`,
      '',
      `Here is what they produced:`,
      context.summary,
      '',
      `The user's original request was: ${context.originalRequest}`,
      '',
      `You were brought in because: ${context.reason}`,
      '',
      'Continue from here — do not re-ask questions that have already been answered.',
      'When your part is complete, suggest returning to the original agent if appropriate:',
      `"I've finished my part. Want to go back to ${fromName} to continue?"`,
      '</handoff_context>',
    ].join('\n')
  }

  /**
   * Get the full system prompt for an agent, optionally with handoff context prepended.
   */
  getAgentSystemPrompt(agentId: string, handoffContext?: HandoffContext): string {
    const agent = STARTER_AGENTS.find((a) => a.id === agentId)
    if (!agent) return ''

    if (handoffContext) {
      return this.buildHandoffSystemPromptAddition(handoffContext) + '\n\n' + agent.systemPrompt
    }

    return agent.systemPrompt
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Simple keyword-based trigger matching.
   * Checks if the combined response+request text contains keywords
   * that indicate the trigger condition is met.
   */
  private matchesTriggerCondition(
    condition: string,
    combinedText: string,
    _currentAgentId: string,
  ): boolean {
    // Extract key intent phrases from the condition
    const conditionLower = condition.toLowerCase()

    // Research/data needs
    if (conditionLower.includes('research') || conditionLower.includes('data')) {
      const researchSignals = [
        'need more data', 'need more information', 'requires research',
        'verify this', 'fact-check', 'find sources', 'look into',
        'i don\'t have data', 'data point', 'needs verification',
      ]
      if (researchSignals.some((s) => combinedText.includes(s))) return true
    }

    // Decision needs
    if (conditionLower.includes('decision')) {
      const decisionSignals = [
        'should i', 'which option', 'decide between', 'trade-off',
        'pros and cons', 'weigh the options', 'help me decide',
        'which path', 'what should we do', 'evaluate options',
      ]
      if (decisionSignals.some((s) => combinedText.includes(s))) return true
    }

    // Communication needs
    if (conditionLower.includes('communicat') || conditionLower.includes('findings')) {
      const commSignals = [
        'share this with', 'communicate this', 'write a message',
        'email this to', 'present this', 'announce', 'tell the team',
        'share these findings', 'format this for',
      ]
      if (commSignals.some((s) => combinedText.includes(s))) return true
    }

    // Execution plan needs
    if (conditionLower.includes('execution') || conditionLower.includes('plan')) {
      const execSignals = [
        'execution plan', 'action items', 'owners and deadlines',
        'who does what', 'next steps', 'turn this into a plan',
        'make this happen', 'implement this',
      ]
      if (execSignals.some((s) => combinedText.includes(s))) return true
    }

    // Strategic elevation
    if (conditionLower.includes('strategic') || conditionLower.includes('strategy')) {
      const strategySignals = [
        'technology strategy', 'long-term', 'strategic decision',
        'bigger question', 'organizational', 'investment decision',
      ]
      if (strategySignals.some((s) => combinedText.includes(s))) return true
    }

    // Technical explanation for leadership
    if (conditionLower.includes('leadership') || conditionLower.includes('non-technical')) {
      const explainSignals = [
        'explain to my', 'present to leadership', 'tell my vp',
        'non-technical audience', 'executive summary',
      ]
      if (explainSignals.some((s) => combinedText.includes(s))) return true
    }

    // High-stakes follow-up
    if (conditionLower.includes('high-stakes') || conditionLower.includes('high stakes')) {
      const highStakesSignals = [
        'executive', 'vp', 'cto', 'ceo', 'board', 'customer',
        'bad news', 'escalation', 'sensitive',
      ]
      if (highStakesSignals.some((s) => combinedText.includes(s))) return true
    }

    return false
  }

  /**
   * Create a concise summary of the previous agent's output for context transfer.
   */
  private summarizePreviousOutput(output: string): string {
    // Take the first ~2000 chars as a summary — enough context without overwhelming
    if (output.length <= 2000) return output
    return output.slice(0, 2000) + '\n\n[... output truncated for handoff context ...]'
  }
}
