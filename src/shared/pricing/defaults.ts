/**
 * Canonical default pricing for cost estimation.
 *
 * Values are public retail API pricing in USD per 1 million tokens
 * (input / output respectively). Users can override per-model in their Cost
 * Settings panel — including marking a model as "included in plan" so its
 * cost records show $0.
 *
 * Maintenance: when a provider changes published prices, edit this file. The
 * PricingService merges defaults + optional remote sync + user overrides at
 * runtime so a deploy isn't required for individual users to pin their
 * effective rates.
 */

export type ModelProvider = 'anthropic' | 'openai' | 'google'

export interface ModelPriceEntry {
  /** USD per 1M input tokens. */
  input: number
  /** USD per 1M output tokens. */
  output: number
  /** Which upstream provider issues the model — used for grouping in the UI. */
  provider: ModelProvider
  /**
   * Optional canonical alias target. When set, this entry just points at
   * another model id (`sonnet` → `claude-sonnet-4.5`) so users don't have to
   * memorize the long-form id for cost lookups.
   */
  aliasOf?: string
}

export interface PricingTable {
  lastUpdated: string
  source: string
  models: Record<string, ModelPriceEntry>
}

export const DEFAULT_PRICING_TABLE: PricingTable = {
  lastUpdated: '2026-05-15',
  source: 'Public retail API pricing',
  models: {
    // ── Anthropic ─────────────────────────────────────────────────────────
    'claude-sonnet-4.5': { provider: 'anthropic', input: 3,    output: 15   },
    'claude-sonnet-4.6': { provider: 'anthropic', input: 3,    output: 15   },
    'claude-sonnet-4':   { provider: 'anthropic', input: 3,    output: 15   },
    'claude-haiku-4.5':  { provider: 'anthropic', input: 1,    output: 5    },
    'claude-opus-4.5':   { provider: 'anthropic', input: 5,    output: 25   },
    'claude-opus-4.6':   { provider: 'anthropic', input: 5,    output: 25   },
    // Claude Code aliases. The CLI accepts these short forms as model ids;
    // resolveModelAlias() unwraps them when callers need the canonical entry.
    'sonnet':            { provider: 'anthropic', input: 3,    output: 15,   aliasOf: 'claude-sonnet-4.5' },
    'opus':              { provider: 'anthropic', input: 5,    output: 25,   aliasOf: 'claude-opus-4.5'   },
    'haiku':             { provider: 'anthropic', input: 1,    output: 5,    aliasOf: 'claude-haiku-4.5'  },

    // ── OpenAI ────────────────────────────────────────────────────────────
    'gpt-5':             { provider: 'openai',    input: 5,    output: 15   },
    'gpt-5.1':           { provider: 'openai',    input: 5,    output: 15   },
    'gpt-5.1-codex':     { provider: 'openai',    input: 5,    output: 15   },
    'gpt-5.3-codex':     { provider: 'openai',    input: 5,    output: 15   },
    'gpt-5-mini':        { provider: 'openai',    input: 0.4,  output: 1.6  },
    'gpt-5.4-mini':      { provider: 'openai',    input: 0.4,  output: 1.6  },
    'gpt-4o':            { provider: 'openai',    input: 2.5,  output: 10   },
    'gpt-4.1':           { provider: 'openai',    input: 2,    output: 8    },

    // ── Google ────────────────────────────────────────────────────────────
    'gemini-3-pro':      { provider: 'google',    input: 3.5,  output: 10.5 },
    'gemini-2.5-pro':    { provider: 'google',    input: 3.5,  output: 10.5 },
    'gemini-3-flash':    { provider: 'google',    input: 0.5,  output: 1.5  },
  },
}
