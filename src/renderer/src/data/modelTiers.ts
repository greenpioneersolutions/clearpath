// Shared model tier data used by NewSessionModal and ModelChip.
// When users change models mid-session via ModelChip, the chip
// sends a `/model <name>` slash command to the active CLI session.

export interface ModelTier {
  group: string
  models: string[]
}

export const MODEL_TIERS: Record<'copilot' | 'claude', ModelTier[]> = {
  copilot: [
    { group: 'Free', models: ['gpt-5-mini', 'gpt-4.1', 'gpt-4o'] },
    { group: '0.33x', models: ['claude-haiku-4.5', 'gemini-3-flash'] },
    { group: '1x', models: ['claude-sonnet-4.5', 'claude-sonnet-4.6', 'gpt-5', 'gemini-3-pro'] },
    { group: '3x', models: ['claude-opus-4.5', 'claude-opus-4.6'] },
  ],
  claude: [
    { group: 'Claude', models: ['sonnet', 'haiku', 'opus'] },
  ],
}

export function defaultModelLabel(cli: 'copilot' | 'claude'): string {
  return cli === 'copilot' ? 'claude-sonnet-4.5' : 'sonnet'
}
