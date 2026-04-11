import React, { createContext, useContext, useState, useEffect } from 'react'
import { createSDKClient } from './client'
import type { ExtensionSDK, CreateExtensionOptions } from './types'

// Re-export all types
export type {
  ExtensionSDK,
  ExtensionManifest,
  ExtensionPermission,
  ExtensionMainContext,
  ClearPathTheme,
  CreateExtensionOptions,
  NavContribution,
  PanelContribution,
  WidgetContribution,
  TabContribution,
  SidebarWidgetContribution,
  SessionHookContribution,
  ContextProviderContribution,
  ExtensionRequirement,
} from './types'

// ── SDK Context ──────────────────────────────────────────────────────────────

const SDKContext = createContext<ExtensionSDK | null>(null)

/**
 * React hook to access the ClearPathAI Extension SDK.
 * Must be used within a component rendered by createExtension().
 */
export function useSDK(): ExtensionSDK {
  const sdk = useContext(SDKContext)
  if (!sdk) {
    throw new Error('useSDK() must be used within a ClearPath extension component')
  }
  return sdk
}

/**
 * React context provider that wraps extension components with SDK access.
 * Typically used internally by createExtension() — not called directly.
 */
export function ClearPathProvider({
  sdk,
  children,
}: {
  sdk: ExtensionSDK
  children: React.ReactNode
}): React.ReactElement {
  return React.createElement(SDKContext.Provider, { value: sdk }, children)
}

// ── Extension Entry Point ────────────────────────────────────────────────────

/**
 * Creates a ClearPathAI extension entry point.
 *
 * Extension renderer entries should default-export the result of this function:
 *
 * ```tsx
 * import { createExtension, useSDK } from '@clearpath/extension-sdk'
 *
 * function MyPage() {
 *   const sdk = useSDK()
 *   return <div>Hello from my extension!</div>
 * }
 *
 * export default createExtension({
 *   components: { MyPage },
 *   activate: (sdk) => console.log('Activated!'),
 * })
 * ```
 */
export function createExtension(options: CreateExtensionOptions): {
  components: Record<string, React.ComponentType>
  activate?: (sdk: ExtensionSDK) => void | Promise<void>
  deactivate?: () => void | Promise<void>
  mount: (rootElement: HTMLElement) => void
} {
  return {
    components: options.components,
    activate: options.activate,
    deactivate: options.deactivate,
    mount: (rootElement: HTMLElement) => {
      // This will be called by the iframe bootstrap script.
      // The port is set on window by the host's srcdoc bootstrap.
      const port = (window as unknown as { __clearpath_port?: MessagePort }).__clearpath_port
      const extId = (window as unknown as { __clearpath_extension_id?: string }).__clearpath_extension_id

      if (!port || !extId) {
        console.error('[ClearPath SDK] No MessagePort available. Extension must run inside ClearPathAI.')
        return
      }

      const sdk = createSDKClient(port, extId)

      // Call activate lifecycle hook
      if (options.activate) {
        Promise.resolve(options.activate(sdk)).catch((err) => {
          console.error('[ClearPath SDK] activate() failed:', err)
        })
      }

      // Signal activated to host
      port.postMessage({ type: 'ext:activated' })

      // Render the first component (or a router of components) into the root element
      // Extension developers handle their own rendering from here
      console.log('[ClearPath SDK] Extension mounted. Components:', Object.keys(options.components))
    },
  }
}
