import { useFeatureFlags } from '../contexts/FeatureFlagContext'
import CustomDashboard from './CustomDashboard'
import HomeHub from '../components/HomeHub'

export default function Home(): JSX.Element {
  const { flags } = useFeatureFlags()

  // Default: show the simple HomeHub
  // If the user turns off showHomeHub in Feature Flags, show the widget dashboard instead
  if (!flags.showHomeHub) {
    return (
      <div className="p-6">
        <CustomDashboard />
      </div>
    )
  }

  return <HomeHub />
}
