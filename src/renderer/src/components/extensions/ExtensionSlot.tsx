import { useExtensions } from '../../hooks/useExtensions'
import ExtensionHost from './ExtensionHost'

interface ExtensionSlotProps {
  /** Named slot that extensions contribute to (e.g., "work:context-panel"). */
  slotName: string
  className?: string
  /** Dynamic data passed to extensions in this slot via ext:event 'slot:data-changed'. */
  slotData?: Record<string, unknown>
}

/**
 * A named slot where extensions can contribute panels/widgets.
 * Drop this component into any host page to designate an extension injection point.
 *
 * Example: <ExtensionSlot slotName="work:context-panel" className="h-64" />
 *
 * Extensions declare contributions to slots in their manifest:
 *   "contributes": { "panels": [{ "slot": "work:context-panel", ... }] }
 *
 * If no extensions contribute to this slot, the component renders nothing (null).
 * This ensures zero whitespace when no extensions are active for a given slot.
 */
export default function ExtensionSlot({ slotName, className, slotData }: ExtensionSlotProps): JSX.Element | null {
  const { enabledExtensions } = useExtensions()

  // Find extensions that contribute to this slot AND have a renderer entry
  const contributors = enabledExtensions.filter((ext) =>
    ext.manifest.renderer &&
    ext.manifest.contributes?.panels?.some((p) => p.slot === slotName),
  )

  if (contributors.length === 0) return null

  return (
    <div className={className}>
      {contributors.map((ext) => (
        <ExtensionHost
          key={ext.manifest.id}
          extension={ext}
          slotData={slotData}
        />
      ))}
    </div>
  )
}
