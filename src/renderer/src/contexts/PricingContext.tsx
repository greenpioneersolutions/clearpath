import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import { DEFAULT_PRICING_TABLE, estimateCost as estimateCostShared } from '../../../shared/pricing'
import type { PricingTable } from '../../../shared/pricing/defaults'

/** Shape returned from `pricing:get-effective` IPC call. */
export interface EffectivePriceEntry {
  input: number
  output: number
  provider: 'anthropic' | 'openai' | 'google'
  aliasOf?: string
  source: 'default' | 'remote' | 'override' | 'included' | 'fallback'
}

export interface EffectivePricingTable {
  lastUpdated: string
  source: string
  models: Record<string, EffectivePriceEntry>
}

interface PricingContextValue {
  /** Effective table: defaults + optional remote + user overrides. */
  table: EffectivePricingTable
  /** True after the first IPC fetch settles (success or failure). */
  loaded: boolean
  /** Force a re-fetch — usually unnecessary since `pricing:changed` push events handle it. */
  refresh: () => void
  /** Convenience: cost for a single turn using the effective table. */
  estimate: (model: string, inputTokens: number, outputTokens: number) => number
}

/**
 * Pre-load default: project the shared defaults into an EffectivePricingTable
 * so consumers can render real numbers before the first IPC round-trip.
 */
const DEFAULT_EFFECTIVE: EffectivePricingTable = {
  lastUpdated: DEFAULT_PRICING_TABLE.lastUpdated,
  source: DEFAULT_PRICING_TABLE.source,
  models: Object.fromEntries(
    Object.entries(DEFAULT_PRICING_TABLE.models).map(([id, entry]) => [
      id,
      { ...entry, source: 'default' as const },
    ]),
  ),
}

const PricingContext = createContext<PricingContextValue>({
  table: DEFAULT_EFFECTIVE,
  loaded: false,
  refresh: () => {},
  estimate: (model, input, output) => estimateCostShared(model, input, output),
})

/**
 * Provider that subscribes to `pricing:changed` and re-fetches the effective
 * table whenever the user changes overrides or a remote sync completes.
 * Falls back to the shared module's defaults when IPC isn't available (tests).
 */
export function PricingProvider({ children }: { children: ReactNode }): JSX.Element {
  const [table, setTable] = useState<EffectivePricingTable>(DEFAULT_EFFECTIVE)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const eff = await window.electronAPI.invoke('pricing:get-effective') as EffectivePricingTable | null
      if (eff && typeof eff === 'object' && eff.models) {
        setTable(eff)
      }
    } catch { /* keep prior table on failure */ }
    setLoaded(true)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const off = window.electronAPI.on?.('pricing:changed', () => { void refresh() })
    return () => { if (typeof off === 'function') off() }
  }, [refresh])

  const value = useMemo<PricingContextValue>(() => {
    // Build a PricingTable shape for the shared helper from our effective table.
    const helperTable: PricingTable = {
      lastUpdated: table.lastUpdated,
      source: table.source,
      models: Object.fromEntries(
        Object.entries(table.models).map(([id, { input, output, provider, aliasOf }]) => [
          id,
          aliasOf ? { input, output, provider, aliasOf } : { input, output, provider },
        ]),
      ),
    }
    return {
      table,
      loaded,
      refresh: () => { void refresh() },
      estimate: (model, input, output) => estimateCostShared(model, input, output, helperTable),
    }
  }, [table, loaded, refresh])

  return <PricingContext.Provider value={value}>{children}</PricingContext.Provider>
}

/** Hook for components that need the live pricing table or to estimate costs. */
export function usePricing(): PricingContextValue {
  return useContext(PricingContext)
}
