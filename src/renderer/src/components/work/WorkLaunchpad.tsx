import type { SessionInfo } from '../../types/ipc'
import type { BackendId } from '../../../../shared/backends'
import QuickStartCard from './QuickStartCard'
import WorkflowsCard from './WorkflowsCard'
import ActiveSessionsCard from './ActiveSessionsCard'
import RecentSessionsCard from './RecentSessionsCard'
import NotesDiscoveryCard from './NotesDiscoveryCard'

interface Props {
  defaultCli?: BackendId
  /** New chat: spin up a session with the given prompt. */
  onQuickStart: (opts: {
    prompt: string
    displayPrompt?: string
    cli: BackendId
    model?: string
    agent?: string
    permissionMode?: string
    additionalDirs?: string[]
    attachedAgent?: { id: string; name: string }
    attachedSkills?: Array<{ id: string; name: string }>
    attachedNotes?: Array<{ id: string; title: string }>
  }) => void
  /** Open Composer with a saved workflow loaded. */
  onOpenWorkflow: (workflowId: string) => void
  /** Open an existing running session. */
  onOpenActiveSession: (info: SessionInfo) => void
  /** Resume a stopped session from history. */
  onResumeSession: (sessionId: string, cli: BackendId, name?: string) => void
  /** Open the full session manager modal. */
  onSeeMoreSessions: () => void
}

export default function WorkLaunchpad({
  defaultCli,
  onQuickStart,
  onOpenWorkflow,
  onOpenActiveSession,
  onResumeSession,
  onSeeMoreSessions,
}: Props): JSX.Element {
  return (
    <div
      data-testid="work-launchpad"
      className="flex-1 overflow-y-auto p-6"
      style={{ backgroundColor: 'var(--brand-dark-page)' }}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <QuickStartCard onSubmit={onQuickStart} defaultCli={defaultCli} />

        <NotesDiscoveryCard />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WorkflowsCard onOpenWorkflow={onOpenWorkflow} />
          <ActiveSessionsCard onOpenSession={onOpenActiveSession} />
        </div>

        <RecentSessionsCard
          onResumeSession={onResumeSession}
          onSeeMore={onSeeMoreSessions}
        />
      </div>
    </div>
  )
}
