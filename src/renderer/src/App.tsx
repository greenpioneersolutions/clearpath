import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { FeatureFlagProvider } from './contexts/FeatureFlagContext'
import { BrandingProvider } from './contexts/BrandingContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Work from './pages/Work'
import Insights from './pages/Insights'
import Configure from './pages/Configure'
import Learn from './pages/Learn'
import SubAgentPopout from './pages/SubAgentPopout'
import PrScores from './pages/PrScores'

export default function App(): JSX.Element {
  return (
    <FeatureFlagProvider>
    <BrandingProvider>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="work" element={<Work />} />
          <Route path="learn" element={<Learn />} />
          <Route path="insights" element={<Insights />} />
          <Route path="pr-scores" element={<PrScores />} />
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
        <Route path="/knowledge" element={<Navigate to="/work" replace />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/settings" element={<Navigate to="/configure" replace />} />
      </Routes>
    </HashRouter>
    </BrandingProvider>
    </FeatureFlagProvider>
  )
}
