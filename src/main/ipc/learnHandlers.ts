import type { IpcMain } from 'electron'
import Store from 'electron-store'

// ── Content Types ────────────────────────────────────────────────────────────

interface Lesson {
  id: string
  title: string
  type: 'interactive-walkthrough' | 'guided-task' | 'knowledge-check' | 'video-placeholder' | 'sandbox'
  estimatedMinutes: number
  description: string
  content: unknown // type-specific content
}

interface Module {
  id: string
  title: string
  description: string
  estimatedMinutes: number
  prerequisites: string[]
  lessons: Lesson[]
}

interface LearningPath {
  id: string
  name: string
  description: string
  icon: string
  modules: Module[]
  prerequisitePaths: string[]
  recommended?: boolean
}

interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  criteria: string // human-readable criteria
}

// ── Store ────────────────────────────────────────────────────────────────────

interface LearnStoreSchema {
  completedLessons: Record<string, { completedAt: number; score?: number; skipped?: boolean }>
  selectedPath: string | null
  streak: { lastDate: string; count: number }
  totalTimeMinutes: number
  achievements: Record<string, { unlockedAt: number }>
  helpClicked: string[]
  dismissed: boolean
}

const store = new Store<LearnStoreSchema>({
  name: 'clear-path-learn',
  defaults: {
    completedLessons: {},
    selectedPath: null,
    streak: { lastDate: '', count: 0 },
    totalTimeMinutes: 0,
    achievements: {},
    helpClicked: [],
    dismissed: false,
  },
})

// ── Achievement Definitions ──────────────────────────────────────────────────

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-steps', name: 'First Steps', description: 'Complete the Getting Started path', icon: '🎯' },
  { id: 'session-pro', name: 'Session Pro', description: 'Run 10 sessions', icon: '⚡' },
  { id: 'workflow-architect', name: 'Workflow Architect', description: 'Create and execute 5 workflows', icon: '🏗️' },
  { id: 'template-master', name: 'Template Master', description: 'Use 10 different templates', icon: '📋' },
  { id: 'delegation-expert', name: 'Delegation Expert', description: 'Delegate 20 tasks to sub-agents', icon: '🤖' },
  { id: 'multi-repo-maverick', name: 'Multi-Repo Maverick', description: 'Broadcast a task across 3+ repos', icon: '🌐' },
  { id: 'knowledge-keeper', name: 'Knowledge Keeper', description: 'Generate a knowledge base', icon: '📖' },
  { id: 'cost-conscious', name: 'Cost Conscious', description: 'Set a budget and stay under it for a week', icon: '💰' },
  { id: 'security-sentinel', name: 'Security Sentinel', description: 'Review 5 security events in the audit log', icon: '🛡️' },
  { id: 'connected', name: 'Connected', description: 'Set up at least 2 integrations', icon: '🔗' },
  { id: 'speed-runner', name: 'Speed Runner', description: 'Complete any learning path in under one day', icon: '🏃' },
  { id: 'scholar', name: 'Scholar', description: 'Complete all learning paths (100%)', icon: '🎓' },
  { id: 'streak-master', name: 'Streak Master', description: 'Maintain a 7-day learning streak', icon: '🔥' },
]

// ── Learning Content ─────────────────────────────────────────────────────────

function makeLesson(id: string, title: string, type: Lesson['type'], mins: number, desc: string, content?: unknown): Lesson {
  return { id, title, type, estimatedMinutes: mins, description: desc, content: content ?? {} }
}

function makeModule(id: string, title: string, desc: string, prereqs: string[], lessons: Lesson[]): Module {
  return { id, title, description: desc, estimatedMinutes: lessons.reduce((s, l) => s + l.estimatedMinutes, 0), prerequisites: prereqs, lessons }
}

const PATHS: LearningPath[] = [
  {
    id: 'getting-started', name: 'Getting Started', icon: '🚀',
    description: 'Essential basics for all users — required before other paths',
    prerequisitePaths: [],
    modules: [
      makeModule('welcome', 'Welcome to Clear Path', 'Learn what Clear Path does and how to navigate it', [], [
        makeLesson('welcome-1', 'What is Clear Path?', 'interactive-walkthrough', 3, 'Tour the 4 nav items and what each does'),
        makeLesson('welcome-2', 'Your First Look Around', 'interactive-walkthrough', 3, 'Tour Home widgets, Work panels, Insights tabs, Configure tabs'),
        makeLesson('welcome-3', 'Understanding the Basics', 'knowledge-check', 2, 'Quiz on navigation and core concepts'),
      ]),
      makeModule('connecting', 'Connecting Your Tools', 'Set up your CLI connections', ['welcome'], [
        makeLesson('connect-1', 'Setting Up GitHub Copilot CLI', 'guided-task', 4, 'Walk through auth status check and /login flow'),
        makeLesson('connect-2', 'Setting Up Claude Code CLI', 'guided-task', 4, 'Walk through claude auth flow'),
        makeLesson('connect-3', 'Checking Your Connection', 'interactive-walkthrough', 2, 'Understand CLI status dots'),
      ]),
      makeModule('first-session', 'Your First Session', 'Run your first AI-assisted task', ['connecting'], [
        makeLesson('session-1', 'Starting a Session', 'interactive-walkthrough', 3, 'New Session button, dropdown, mode toggle'),
        makeLesson('session-2', 'Talking to the AI', 'guided-task', 5, 'Type a prompt, watch streaming response'),
        makeLesson('session-3', 'Using Slash Commands', 'interactive-walkthrough', 4, 'Autocomplete, /help, /model, /compact'),
        makeLesson('session-4', 'Session Basics Quiz', 'knowledge-check', 3, 'Quiz on sessions, modes, slash commands'),
      ]),
      makeModule('panels', 'Understanding Panels', 'Learn the panel toolbar in the Work view', ['first-session'], [
        makeLesson('panels-1', 'The Panel Toolbar', 'interactive-walkthrough', 4, 'Each panel icon and what it contains'),
        makeLesson('panels-2', 'Working with Panels Open', 'guided-task', 4, 'Open Agents panel, toggle an agent, send a prompt'),
        makeLesson('panels-3', 'Panel Navigation Quiz', 'knowledge-check', 2, 'Quiz on panel usage'),
      ]),
      makeModule('choose-path', 'Choosing Your Path', 'Select your learning track', ['panels'], [
        makeLesson('choose-1', 'What\'s Next?', 'interactive-walkthrough', 3, 'Explore available learning paths and select one'),
      ]),
    ],
  },
  {
    id: 'manager', name: 'Manager Track', icon: '📊',
    description: 'Oversight, analytics, delegation, and compliance for managers',
    prerequisitePaths: ['getting-started'],
    modules: [
      makeModule('delegating', 'Delegating Work to AI', 'Learn to delegate tasks effectively', [], [
        makeLesson('delegate-1', 'What is Delegation?', 'interactive-walkthrough', 3, 'In Session vs Sub-Agent vs Background'),
        makeLesson('delegate-2', 'Your First Delegation', 'guided-task', 5, 'Use Quick Compose delegation badge'),
        makeLesson('delegate-3', 'Monitoring Delegated Work', 'interactive-walkthrough', 4, 'Sub-Agents panel, process cards'),
        makeLesson('delegate-4', 'Delegation Quiz', 'knowledge-check', 3, 'Quiz on delegation types'),
      ]),
      makeModule('mgr-templates', 'Using Templates', 'Leverage reusable prompts', ['delegating'], [
        makeLesson('mgr-tpl-1', 'Browsing the Library', 'interactive-walkthrough', 4, 'Templates panel, search, categories'),
        makeLesson('mgr-tpl-2', 'Running a Template', 'guided-task', 5, 'Fill placeholders, execute'),
        makeLesson('mgr-tpl-3', 'Creating Your Own', 'guided-task', 3, 'Save a prompt as a reusable template'),
      ]),
      makeModule('mgr-workflows', 'Building Workflows', 'Multi-step AI workflows', ['mgr-templates'], [
        makeLesson('mgr-wf-1', 'What is the Composer?', 'interactive-walkthrough', 3, 'Session/Compose toggle, canvas overview'),
        makeLesson('mgr-wf-2', 'Your First Workflow', 'guided-task', 5, 'Create a 2-step workflow'),
        makeLesson('mgr-wf-3', 'Templates in Workflows', 'guided-task', 4, 'Add template-based steps'),
        makeLesson('mgr-wf-4', 'Running and Monitoring', 'interactive-walkthrough', 4, 'Execution view, status, errors'),
        makeLesson('mgr-wf-5', 'Workflow Quiz', 'knowledge-check', 4, 'Quiz on workflows'),
      ]),
      makeModule('mgr-dashboard', 'Reading the Dashboard', 'Understand your metrics', ['mgr-workflows'], [
        makeLesson('mgr-dash-1', 'Understanding Widgets', 'interactive-walkthrough', 4, 'Each dashboard widget explained'),
        makeLesson('mgr-dash-2', 'Customizing Your Dashboard', 'guided-task', 3, 'Add/remove/arrange widgets'),
        makeLesson('mgr-dash-3', 'Key Metrics for Managers', 'interactive-walkthrough', 3, 'Cost, activity, schedule widgets'),
      ]),
      makeModule('mgr-cost', 'Cost and ROI Tracking', 'Track spending and demonstrate value', ['mgr-dashboard'], [
        makeLesson('mgr-cost-1', 'Understanding AI Costs', 'interactive-walkthrough', 4, 'Insights Analytics tab, cost charts'),
        makeLesson('mgr-cost-2', 'Setting Budgets', 'guided-task', 4, 'Configure budget alerts'),
        makeLesson('mgr-cost-3', 'Making the Case for AI', 'interactive-walkthrough', 4, 'ROI metrics, export reports'),
      ]),
      makeModule('mgr-repos', 'Working Across Repos', 'Multi-repo orchestration', ['mgr-cost'], [
        makeLesson('mgr-repo-1', 'Setting Up a Workspace', 'guided-task', 4, 'Add repos to a workspace'),
        makeLesson('mgr-repo-2', 'Broadcasting Tasks', 'guided-task', 4, 'Broadcast prompts across repos'),
        makeLesson('mgr-repo-3', 'Cross-Repo Search', 'guided-task', 4, 'Search across all repos'),
      ]),
      makeModule('mgr-compliance', 'Compliance and Security', 'Enterprise compliance features', ['mgr-repos'], [
        makeLesson('mgr-comp-1', 'Understanding the Audit Trail', 'interactive-walkthrough', 4, 'Compliance tab, audit log'),
        makeLesson('mgr-comp-2', 'Security Guardrails', 'interactive-walkthrough', 3, 'Sensitive data scanner, file protection'),
        makeLesson('mgr-comp-3', 'Exporting Compliance Reports', 'guided-task', 3, 'Generate compliance snapshot'),
      ]),
      makeModule('mgr-integrations', 'Connecting Project Management', 'External service integrations', ['mgr-compliance'], [
        makeLesson('mgr-int-1', 'Connecting GitHub Issues', 'guided-task', 4, 'Configure GitHub integration'),
        makeLesson('mgr-int-2', 'Connecting Jira', 'guided-task', 4, 'Configure Jira integration'),
        makeLesson('mgr-int-3', 'Pulling Tickets into Sessions', 'guided-task', 4, 'Work Items panel, ticket context'),
        makeLesson('mgr-int-4', 'Integrations Quiz', 'knowledge-check', 3, 'Quiz on integrations'),
      ]),
    ],
  },
  {
    id: 'developer', name: 'Developer Track', icon: '💻',
    description: 'Sessions, agents, workflows, git integration for developers',
    prerequisitePaths: ['getting-started'],
    modules: [
      makeModule('adv-sessions', 'Advanced Sessions', 'Master session capabilities', [], [
        makeLesson('dev-sess-1', 'Session Modes', 'interactive-walkthrough', 4, 'Normal, Plan, Autopilot modes'),
        makeLesson('dev-sess-2', 'Resuming and Forking', 'guided-task', 4, 'Resume, fork sessions'),
        makeLesson('dev-sess-3', 'Managing Context', 'interactive-walkthrough', 4, 'Token usage, /compact'),
        makeLesson('dev-sess-4', 'Advanced Session Quiz', 'knowledge-check', 3, 'Quiz'),
      ]),
      makeModule('mastering-agents', 'Mastering Agents', 'Agent power features', ['adv-sessions'], [
        makeLesson('dev-agent-1', 'Built-in vs Custom', 'interactive-walkthrough', 4, 'Agent types explained'),
        makeLesson('dev-agent-2', 'Creating a Custom Agent', 'guided-task', 4, 'Agent creation wizard'),
        makeLesson('dev-agent-3', 'Using Agents in Sessions', 'guided-task', 4, 'Quick Compose agent badge'),
        makeLesson('dev-agent-4', 'Agent Quiz', 'knowledge-check', 3, 'Quiz'),
      ]),
      makeModule('dev-tools', 'Tool and Permission Mastery', 'Control what AI can do', ['mastering-agents'], [
        makeLesson('dev-tool-1', 'Understanding Permissions', 'interactive-walkthrough', 4, 'Tools panel, allow/deny'),
        makeLesson('dev-tool-2', 'Permission Modes', 'interactive-walkthrough', 4, 'default, acceptEdits, auto, yolo'),
        makeLesson('dev-tool-3', 'MCP Server Setup', 'guided-task', 4, 'View and configure MCP servers'),
      ]),
      makeModule('dev-workflows', 'Workflow Composition', 'Build complex multi-step workflows', ['dev-tools'], [
        makeLesson('dev-wf-1', 'Chaining Complex Tasks', 'guided-task', 5, '4-step workflow: explore → plan → implement → test'),
        makeLesson('dev-wf-2', 'Parallel Execution', 'guided-task', 5, 'Parallel steps targeting different repos'),
        makeLesson('dev-wf-3', 'Error Handling', 'interactive-walkthrough', 4, 'Failed steps, retry, skip'),
        makeLesson('dev-wf-4', 'Saving Reusable Workflows', 'guided-task', 4, 'Save as template with placeholders'),
      ]),
      makeModule('dev-git', 'Git Integration', 'AI-assisted git workflows', ['dev-workflows'], [
        makeLesson('dev-git-1', 'The Git Panel', 'interactive-walkthrough', 4, 'Branch status, diffs, history'),
        makeLesson('dev-git-2', 'AI-Assisted PR Workflow', 'guided-task', 4, 'PR builder end-to-end'),
        makeLesson('dev-git-3', 'Worktree Parallel Dev', 'interactive-walkthrough', 4, 'Worktrees for parallel agent work'),
      ]),
      makeModule('dev-files', 'File Explorer and Context', 'Control what the AI sees', ['dev-git'], [
        makeLesson('dev-file-1', 'Navigating Your Codebase', 'interactive-walkthrough', 3, 'Files panel, file watching'),
        makeLesson('dev-file-2', 'Focus Mode', 'guided-task', 4, 'Select files, constrain agent'),
        makeLesson('dev-file-3', 'Drag and Drop', 'guided-task', 3, 'Drag files into session input'),
      ]),
      makeModule('dev-kb', 'Knowledge Base', 'AI-generated documentation', ['dev-files'], [
        makeLesson('dev-kb-1', 'Generating Documentation', 'guided-task', 4, 'Generate KB for a project'),
        makeLesson('dev-kb-2', 'Using Quick Answer', 'guided-task', 4, 'Ask questions about codebase'),
        makeLesson('dev-kb-3', 'Keeping Docs Current', 'interactive-walkthrough', 4, 'Update, auto-refresh'),
      ]),
      makeModule('dev-scheduling', 'Scheduling and Automation', 'Automate recurring tasks', ['dev-kb'], [
        makeLesson('dev-sched-1', 'Creating a Scheduled Task', 'guided-task', 4, 'Nightly test runner'),
        makeLesson('dev-sched-2', 'Managing Schedules', 'interactive-walkthrough', 4, 'History, missed runs'),
        makeLesson('dev-sched-3', 'Automating Workflows', 'guided-task', 4, 'Workflow as scheduled task'),
      ]),
    ],
  },
  {
    id: 'power-user', name: 'Power User Track', icon: '⚡',
    description: 'Advanced features for experienced users',
    prerequisitePaths: ['manager', 'developer'], // Requires EITHER, not both — handled in unlock logic
    modules: [
      makeModule('pu-adv-workflows', 'Advanced Workflow Patterns', 'Complex workflow architectures', [], [
        makeLesson('pu-wf-1', 'Conditional Workflows', 'guided-task', 5, 'Branch based on step outcomes'),
        makeLesson('pu-wf-2', 'Cross-Repo Workflows', 'guided-task', 5, 'Multi-repo mixed execution'),
        makeLesson('pu-wf-3', 'Workflow Templates for Teams', 'guided-task', 5, 'Parameterized team workflows'),
      ]),
      makeModule('pu-agents', 'Custom Agents Deep Dive', 'Master agent customization', ['pu-adv-workflows'], [
        makeLesson('pu-ag-1', 'Agent Markdown Files', 'interactive-walkthrough', 5, '.agent.md format, frontmatter'),
        makeLesson('pu-ag-2', 'Multi-Agent Orchestration', 'guided-task', 5, 'Multiple agents on complex tasks'),
        makeLesson('pu-ag-3', 'Agent Skills', 'guided-task', 5, 'Create and attach skill files'),
      ]),
      makeModule('pu-templates', 'Template Engineering', 'Design effective templates', ['pu-agents'], [
        makeLesson('pu-tpl-1', 'Designing Effective Templates', 'interactive-walkthrough', 4, 'Best practices, placeholder design'),
        makeLesson('pu-tpl-2', 'Template Variables and Defaults', 'guided-task', 4, 'Typed placeholders'),
        makeLesson('pu-tpl-3', 'Sharing Templates', 'guided-task', 4, 'Export, import, team sharing'),
      ]),
      makeModule('pu-analytics', 'Advanced Analytics', 'Deep cost and productivity insights', ['pu-templates'], [
        makeLesson('pu-ana-1', 'Cost Optimization', 'interactive-walkthrough', 4, 'Model cost differences, budget caps'),
        makeLesson('pu-ana-2', 'Productivity Metrics', 'interactive-walkthrough', 4, 'AI leverage ratio, cost per task'),
        makeLesson('pu-ana-3', 'Building Executive Reports', 'guided-task', 4, 'Generate monthly PDF report'),
      ]),
      makeModule('pu-policy', 'Policy and Compliance Design', 'Enterprise guardrails', ['pu-analytics'], [
        makeLesson('pu-pol-1', 'Creating Team Policies', 'guided-task', 4, 'Policy with restrictions'),
        makeLesson('pu-pol-2', 'Distributing Policies', 'guided-task', 4, 'Export, team distribution'),
        makeLesson('pu-pol-3', 'Audit Log Investigation', 'guided-task', 4, 'Trace AI session activity'),
      ]),
      makeModule('pu-local', 'Local Models and Offline', 'Work without internet', ['pu-policy'], [
        makeLesson('pu-local-1', 'Setting Up Ollama', 'guided-task', 5, 'Configure local model connection'),
        makeLesson('pu-local-2', 'Cloud vs Local Tradeoffs', 'knowledge-check', 3, 'When to use which'),
      ]),
    ],
  },
  {
    id: 'admin', name: 'Admin Track', icon: '🔧',
    description: 'Team administration, integrations, and security',
    prerequisitePaths: [],
    modules: [
      makeModule('admin-team', 'Team Configuration', 'Set up teams', [], [
        makeLesson('admin-team-1', 'Creating Config Bundles', 'guided-task', 4, 'Export team config'),
        makeLesson('admin-team-2', 'Onboarding New Members', 'interactive-walkthrough', 4, 'Setup wizard flow'),
        makeLesson('admin-team-3', 'The Agent Marketplace', 'interactive-walkthrough', 4, 'Browse, install agents'),
      ]),
      makeModule('admin-integrations', 'Integration Administration', 'Connect external services', ['admin-team'], [
        makeLesson('admin-int-1', 'Connecting All Platforms', 'guided-task', 4, 'GitHub, Jira, Confluence, ServiceNow'),
        makeLesson('admin-int-2', 'Token Management', 'interactive-walkthrough', 4, 'API tokens, storage, rotation'),
        makeLesson('admin-int-3', 'Testing Connections', 'guided-task', 4, 'Test and troubleshoot'),
        makeLesson('admin-int-4', 'Integration Health', 'interactive-walkthrough', 3, 'Health monitoring widget'),
      ]),
      makeModule('admin-workspaces', 'Workspace Administration', 'Organize multi-repo environments', ['admin-integrations'], [
        makeLesson('admin-ws-1', 'Designing Workspaces', 'guided-task', 4, 'Create for teams/projects'),
        makeLesson('admin-ws-2', 'Batch Operations', 'guided-task', 3, 'Batch pull, branch creation'),
        makeLesson('admin-ws-3', 'Workspace Best Practices', 'knowledge-check', 3, 'Quiz'),
      ]),
      makeModule('admin-security', 'Security Best Practices', 'Protect sensitive data', ['admin-workspaces'], [
        makeLesson('admin-sec-1', 'File Protection Patterns', 'guided-task', 4, 'Configure .env, key globs'),
        makeLesson('admin-sec-2', 'Prompt Scanning', 'interactive-walkthrough', 4, 'Sensitive data scanner'),
        makeLesson('admin-sec-3', 'Security Event Response', 'guided-task', 4, 'Review and respond to events'),
      ]),
      makeModule('admin-adoption', 'Measuring Team Adoption', 'Track and drive usage', ['admin-security'], [
        makeLesson('admin-adopt-1', 'Reading Adoption Metrics', 'interactive-walkthrough', 4, 'Adoption funnel in Insights'),
        makeLesson('admin-adopt-2', 'Driving Adoption', 'knowledge-check', 4, 'Strategies quiz'),
      ]),
    ],
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAllLessons(): Lesson[] {
  const lessons: Lesson[] = []
  for (const path of PATHS) {
    for (const mod of path.modules) {
      lessons.push(...mod.lessons)
    }
  }
  return lessons
}

function getProgress(): {
  completed: number; total: number; percentage: number
  pathProgress: Record<string, { completed: number; total: number; percentage: number }>
} {
  const completedMap = store.get('completedLessons')
  const all = getAllLessons()
  const completed = all.filter((l) => completedMap[l.id]).length
  const total = all.length

  const pathProgress: Record<string, { completed: number; total: number; percentage: number }> = {}
  for (const path of PATHS) {
    const pathLessons = path.modules.flatMap((m) => m.lessons)
    const pathCompleted = pathLessons.filter((l) => completedMap[l.id]).length
    pathProgress[path.id] = {
      completed: pathCompleted,
      total: pathLessons.length,
      percentage: pathLessons.length > 0 ? Math.round((pathCompleted / pathLessons.length) * 100) : 0,
    }
  }

  return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0, pathProgress }
}

function isPathUnlocked(pathId: string): boolean {
  const path = PATHS.find((p) => p.id === pathId)
  if (!path) return false
  if (path.prerequisitePaths.length === 0) return true

  const completedMap = store.get('completedLessons')
  // Power User track: requires completing EITHER manager OR developer
  if (pathId === 'power-user') {
    return path.prerequisitePaths.some((prereqId) => {
      const prereqPath = PATHS.find((p) => p.id === prereqId)
      if (!prereqPath) return false
      return prereqPath.modules.flatMap((m) => m.lessons).every((l) => completedMap[l.id])
    })
  }
  // All other paths: require ALL prerequisites
  return path.prerequisitePaths.every((prereqId) => {
    const prereqPath = PATHS.find((p) => p.id === prereqId)
    if (!prereqPath) return false
    return prereqPath.modules.flatMap((m) => m.lessons).every((l) => completedMap[l.id])
  })
}

function getNextLesson(): Lesson | null {
  const completedMap = store.get('completedLessons')
  for (const path of PATHS) {
    if (!isPathUnlocked(path.id)) continue
    for (const mod of path.modules) {
      for (const lesson of mod.lessons) {
        if (!completedMap[lesson.id]) return lesson
      }
    }
  }
  return null
}

function updateStreak(): { lastDate: string; count: number } {
  const today = new Date().toISOString().slice(0, 10)
  const streak = store.get('streak')
  if (streak.lastDate === today) return streak // Already counted today

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const newStreak = streak.lastDate === yesterday
    ? { lastDate: today, count: streak.count + 1 }
    : { lastDate: today, count: 1 }
  store.set('streak', newStreak)
  return newStreak
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerLearnHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('learn:get-paths', () => {
    const completedMap = store.get('completedLessons')
    return PATHS.map((p) => ({
      ...p,
      unlocked: isPathUnlocked(p.id),
      progress: getProgress().pathProgress[p.id],
      completedLessonIds: Object.keys(completedMap),
    }))
  })

  ipcMain.handle('learn:get-progress', () => {
    const progress = getProgress()
    return {
      ...progress,
      streak: store.get('streak'),
      totalTimeMinutes: store.get('totalTimeMinutes'),
      selectedPath: store.get('selectedPath'),
      nextLesson: getNextLesson(),
      dismissed: store.get('dismissed'),
    }
  })

  ipcMain.handle('learn:complete-lesson', (_e, args: { lessonId: string; score?: number; skipped?: boolean; timeMinutes?: number }) => {
    const completed = store.get('completedLessons')
    completed[args.lessonId] = {
      completedAt: Date.now(),
      score: args.score,
      skipped: args.skipped,
    }
    store.set('completedLessons', completed)

    if (args.timeMinutes) {
      store.set('totalTimeMinutes', store.get('totalTimeMinutes') + args.timeMinutes)
    }

    updateStreak()
    return getProgress()
  })

  ipcMain.handle('learn:select-path', (_e, args: { pathId: string }) => {
    store.set('selectedPath', args.pathId)
    return { success: true }
  })

  ipcMain.handle('learn:get-achievements', () => {
    const unlocked = store.get('achievements')
    return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: !!unlocked[a.id], unlockedAt: unlocked[a.id]?.unlockedAt }))
  })

  ipcMain.handle('learn:unlock-achievement', (_e, args: { id: string }) => {
    const achievements = store.get('achievements')
    if (!achievements[args.id]) {
      achievements[args.id] = { unlockedAt: Date.now() }
      store.set('achievements', achievements)
    }
    return { success: true }
  })

  ipcMain.handle('learn:record-help-click', (_e, args: { panelId: string }) => {
    const clicked = store.get('helpClicked')
    if (!clicked.includes(args.panelId)) {
      clicked.push(args.panelId)
      store.set('helpClicked', clicked)
    }
    return { success: true }
  })

  ipcMain.handle('learn:get-help-clicked', () => store.get('helpClicked'))

  ipcMain.handle('learn:dismiss', () => {
    store.set('dismissed', true)
    return { success: true }
  })

  ipcMain.handle('learn:reset', () => {
    store.set('completedLessons', {})
    store.set('selectedPath', null)
    store.set('streak', { lastDate: '', count: 0 })
    store.set('totalTimeMinutes', 0)
    store.set('achievements', {})
    store.set('helpClicked', [])
    store.set('dismissed', false)
    return { success: true }
  })
}
