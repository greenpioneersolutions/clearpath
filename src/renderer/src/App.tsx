import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { FeatureFlagProvider } from './contexts/FeatureFlagContext'
import { BrandingProvider } from './contexts/BrandingContext'
import { AccessibilityProvider } from './contexts/AccessibilityContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Work from './pages/Work'
import Insights from './pages/Insights'
import Configure from './pages/Configure'
import Connect from './pages/Connect'
import ClearMemory from './pages/ClearMemory'
import Learn from './pages/Learn'
import SubAgentPopout from './pages/SubAgentPopout'
import ExtensionPage from './components/extensions/ExtensionPage'

// Notes is lazy-loaded — it pulls in the full three-pane editor + drawer that
// most users won't open in a typical session.
const Notes = lazy(() => import('./pages/Notes'))

// `__FEATURES__` is a Vite `define` literal (see electron.vite.config.ts) so
// the conditions below are statically replaced at build time. When an
// experimental flag is compiled out (features.json: experimental:true +
// enabled:false), the conditional becomes `false ? lazy(...) : null` and
// Rollup drops the dynamic `import()` along with the page chunk it would
// have produced.
declare const __FEATURES__: import('../../shared/featureFlags.generated').FeatureFlags

const PrScores = __FEATURES__.showPrScores
  ? lazy(() => import('./pages/PrScores'))
  : null
const BackstageExplorer = __FEATURES__.showBackstageExplorer
  ? lazy(() => import('./pages/BackstageExplorer'))
  : null

export default function App(): JSX.Element {
  return (
    <FeatureFlagProvider>
    <BrandingProvider>
    <AccessibilityProvider>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="work" element={<Work />} />
          <Route path="learn" element={<Learn />} />
          <Route path="insights" element={<Insights />} />
          {/* Experimental routes stay registered even when compiled out so
              extensions / sidebar links targeting `#/pr-scores` etc. resolve
              to a real route and React Router still matches the parent
              Layout. When the flag is off the route redirects to /work. */}
          <Route
            path="pr-scores"
            element={
              PrScores ? (
                <Suspense fallback={null}>
                  <PrScores />
                </Suspense>
              ) : (
                <Navigate to="/work" replace />
              )
            }
          />
          <Route
            path="backstage-explorer"
            element={
              BackstageExplorer ? (
                <Suspense fallback={null}>
                  <BackstageExplorer />
                </Suspense>
              ) : (
                <Navigate to="/work" replace />
              )
            }
          />
          <Route path="ext/:extensionId/*" element={<ExtensionPage />} />
          <Route path="connect" element={<Connect />} />
          <Route path="clear-memory" element={<ClearMemory />} />
          <Route path="notes" element={<Suspense fallback={null}><Notes /></Suspense>} />
          <Route path="configure" element={<Configure />} />
        </Route>
        <Route path="/subagent-popout/:id" element={<SubAgentPopout />} />
        {/* Redirects from old routes */}
        <Route path="/sessions" element={<Navigate to="/work" replace />} />
        <Route path="/agents" element={<Navigate to="/work" replace />} />
        <Route path="/memory" element={<Navigate to="/configure" replace />} />
        <Route path="/tools" element={<Navigate to="/work" replace />} />
        <Route path="/subagents" element={<Navigate to="/work" replace />} />
        <Route path="/analytics" element={<Navigate to="/insights" replace />} />
        <Route path="/templates" element={<Navigate to="/work" replace />} />
        <Route path="/team" element={<Navigate to="/configure" replace />} />
        {/* /learn is now a real route, not a redirect */}
        <Route path="/git" element={<Navigate to="/work" replace />} />
        <Route path="/files" element={<Navigate to="/work" replace />} />
        <Route path="/policies" element={<Navigate to="/configure" replace />} />
        <Route path="/workspaces" element={<Navigate to="/configure" replace />} />
        <Route path="/usage" element={<Navigate to="/insights" replace />} />
        <Route path="/compliance" element={<Navigate to="/insights" replace />} />
        <Route path="/schedules" element={<Navigate to="/configure" replace />} />
        <Route path="/connections" element={<Navigate to="/connect?tab=mcp" replace />} />
        <Route path="/knowledge" element={<Navigate to="/work" replace />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/settings" element={<Navigate to="/configure" replace />} />
      </Routes>
    </HashRouter>
    </AccessibilityProvider>
    </BrandingProvider>
    </FeatureFlagProvider>
  )
}
