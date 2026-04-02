import { useState, useEffect } from 'react'

interface TrainingTip {
  id: string
  title: string
  cliCommand: string
  explanation: string
}

// Map of UI actions to their CLI explanations
const TRAINING_TIPS: Record<string, TrainingTip> = {
  'agent-toggle': {
    id: 'agent-toggle', title: 'Agent Toggle',
    cliCommand: '--agent code-reviewer',
    explanation: 'This adds --agent to your session, which tells the CLI to use a specialized agent with custom instructions and tool access.',
  },
  'permission-mode': {
    id: 'permission-mode', title: 'Permission Mode',
    cliCommand: '--permission-mode acceptEdits',
    explanation: 'This controls how the AI handles tool permissions. "acceptEdits" auto-approves file changes but still prompts for shell commands.',
  },
  'model-change': {
    id: 'model-change', title: 'Model Selection',
    cliCommand: '--model claude-sonnet-4.5',
    explanation: 'This sets which AI model the CLI uses. Larger models are more capable but cost more per token.',
  },
  'yolo-mode': {
    id: 'yolo-mode', title: 'YOLO Mode',
    cliCommand: '--yolo',
    explanation: 'This auto-approves ALL tool permissions without prompting. The AI can run any command and modify any file. Use with caution.',
  },
  'new-session': {
    id: 'new-session', title: 'New Session',
    cliCommand: 'copilot --prompt "your message"',
    explanation: 'Each session spawns a new CLI process. In headless mode, your message is sent via --prompt and the CLI exits after responding.',
  },
  'mcp-server': {
    id: 'mcp-server', title: 'MCP Server',
    cliCommand: '--mcp-config servers.json',
    explanation: 'Model Context Protocol servers extend what the AI can do — access databases, APIs, GitHub, etc. Each server is a separate process.',
  },
  'sub-agent-delegate': {
    id: 'sub-agent-delegate', title: 'Delegate Task',
    cliCommand: 'claude -p "task description"',
    explanation: 'Delegation spawns a background CLI process with --print mode. It runs independently and reports results when done.',
  },
  'template-use': {
    id: 'template-use', title: 'Template Use',
    cliCommand: 'cli:send-input with hydrated prompt',
    explanation: 'Templates are reusable prompts with variables. When you fill in the variables, the app sends the completed prompt to your active CLI session.',
  },
}

interface Props {
  actionId: string
  visible: boolean
  onDismiss: () => void
}

export default function TrainingTooltip({ actionId, visible, onDismiss }: Props): JSX.Element {
  const tip = TRAINING_TIPS[actionId]
  if (!visible || !tip) return <></>

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm animate-slide-in">
      <div className="bg-indigo-900 text-white rounded-xl shadow-xl border border-indigo-700 p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-indigo-700 px-2 py-0.5 rounded-full font-medium">Training Mode</span>
            <span className="text-sm font-semibold">{tip.title}</span>
          </div>
          <button onClick={onDismiss} className="text-indigo-400 hover:text-white text-xs flex-shrink-0">
            Dismiss
          </button>
        </div>
        <div className="bg-indigo-950 rounded-lg px-3 py-2 mb-2">
          <code className="text-sm text-green-400 font-mono">{tip.cliCommand}</code>
        </div>
        <p className="text-xs text-indigo-200 leading-relaxed">{tip.explanation}</p>
      </div>
    </div>
  )
}

// Hook to show training tooltips
export function useTrainingMode(): {
  isEnabled: boolean
  showTip: (actionId: string) => void
  activeTip: string | null
  dismissTip: () => void
} {
  const [isEnabled, setIsEnabled] = useState(false)
  const [activeTip, setActiveTip] = useState<string | null>(null)

  useEffect(() => {
    void (window.electronAPI.invoke('onboarding:get-state') as Promise<{ trainingModeEnabled: boolean }>)
      .then((s) => setIsEnabled(s.trainingModeEnabled))
  }, [])

  return {
    isEnabled,
    showTip: (actionId: string) => { if (isEnabled) setActiveTip(actionId) },
    activeTip,
    dismissTip: () => setActiveTip(null),
  }
}
