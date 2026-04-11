import { useParams } from 'react-router-dom'
import { useExtensions } from '../../hooks/useExtensions'
import ExtensionHost from './ExtensionHost'

/**
 * Full-page wrapper for extension-contributed routes.
 * Renders the extension inside a full-height ExtensionHost iframe.
 * Route: /ext/:extensionId/*
 */
export default function ExtensionPage(): JSX.Element {
  const { extensionId } = useParams<{ extensionId: string }>()
  const { enabledExtensions, loading } = useExtensions()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Loading extension...
      </div>
    )
  }

  const extension = enabledExtensions.find((e) => e.manifest.id === extensionId)

  if (!extension) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
        <p className="text-lg">Extension not found</p>
        <p className="text-sm text-gray-500">
          The extension &quot;{extensionId}&quot; is not installed or not enabled.
        </p>
      </div>
    )
  }

  if (!extension.manifest.renderer) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
        <p className="text-lg">{extension.manifest.name}</p>
        <p className="text-sm text-gray-500">This extension has no UI component.</p>
      </div>
    )
  }

  return <ExtensionHost extension={extension} className="h-full" />
}
