import { useParams } from 'react-router-dom'
import ProcessOutputViewer from '../components/subagent/ProcessOutputViewer'

export default function SubAgentPopout(): JSX.Element {
  const { id } = useParams<{ id: string }>()

  if (!id) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">
        No sub-agent ID provided
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-950">
      <ProcessOutputViewer subAgentId={id} isPopout />
    </div>
  )
}
