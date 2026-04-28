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
  // Claude Code's `--model` flag accepts the family aliases (which auto-update
  // to the latest snapshot in that family) AND fully-pinned IDs. We expose
  // both so users can lock a session to a specific snapshot when they need
  // reproducibility.
  claude: [
    { group: 'Latest (auto-update)', models: ['sonnet', 'opus', 'haiku'] },
    { group: 'Pinned versions', models: [
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
    ] },
  ],
}

export function defaultModelLabel(cli: 'copilot' | 'claude'): string {
  return cli === 'copilot' ? 'claude-sonnet-4.5' : 'sonnet'
}
