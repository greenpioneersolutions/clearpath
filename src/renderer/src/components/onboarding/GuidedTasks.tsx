import { useState, useEffect } from 'react'

interface GuidedTask {
  id: string
  title: string
  description: string
  steps: Array<{ label: string; action: string; hint: string }>
  category: string
}

const TASKS: GuidedTask[] = [
  {
    id: 'review-pr', title: 'Review a PR', category: 'Code Review',
    description: 'Walk through reviewing a pull request using AI assistance',
    steps: [
      { label: 'Start a new session', action: 'Go to Sessions → New Session', hint: 'Choose Copilot or Claude CLI' },
      { label: 'Set review mode', action: 'Select the "Code Review" agent if available', hint: 'Agents panel → toggle on Code Review' },
      { label: 'Send the review prompt', action: 'Type: "Review the changes on branch feature/xyz for bugs and security issues"', hint: 'Replace feature/xyz with your branch' },
      { label: 'Review the output', action: 'Read the AI\'s findings and apply suggestions', hint: 'Each finding will have a file reference and severity' },
    ],
  },
  {
    id: 'fix-test', title: 'Fix a Failing Test', category: 'Bug Fix',
    description: 'Use AI to diagnose and fix a failing test',
    steps: [
      { label: 'Start a session', action: 'Sessions → New Session with working directory set', hint: 'Point to your project root' },
      { label: 'Set accept-edits mode', action: 'Tools → Permission Mode → Accept Edits', hint: 'This lets the AI modify files but asks before running commands' },
      { label: 'Describe the failing test', action: 'Type: "The test X in file Y is failing. Run it, find the root cause, and fix it."', hint: 'Be specific about which test' },
      { label: 'Verify the fix', action: 'Check the output for the fix explanation and run tests', hint: 'The AI should have run the test to verify' },
    ],
  },
  {
    id: 'new-feature', title: 'Create a New Feature', category: 'Development',
    description: 'Build a feature from scratch with AI pair programming',
    steps: [
      { label: 'Start a session', action: 'Sessions → New Session', hint: 'Name it after your feature' },
      { label: 'Describe the feature', action: 'Type a clear description of what you want built', hint: 'Include acceptance criteria and edge cases' },
      { label: 'Review generated code', action: 'Read through the AI\'s implementation', hint: 'The AI will create files and modify existing ones' },
      { label: 'Iterate', action: 'Ask for changes, improvements, or tests', hint: 'You can send follow-up prompts to refine the work' },
    ],
  },
  {
    id: 'security-audit', title: 'Run a Security Audit', category: 'Security',
    description: 'Scan your codebase for security vulnerabilities',
    steps: [
      { label: 'Choose the right model', action: 'Settings → Model → Select a powerful model (Opus or GPT-5)', hint: 'Security audits benefit from stronger models' },
      { label: 'Use the security template', action: 'Templates → Security Audit → Full Security Audit', hint: 'Fill in the target directory' },
      { label: 'Review findings', action: 'Read the severity-rated findings', hint: 'Focus on Critical and High severity first' },
      { label: 'Fix issues', action: 'Send follow-up prompts to fix each finding', hint: '"Fix the SQL injection in file X at line Y"' },
    ],
  },
  {
    id: 'generate-docs', title: 'Generate Documentation', category: 'Documentation',
    description: 'Auto-generate documentation for your codebase',
    steps: [
      { label: 'Start with a plan-mode session', action: 'Set permission mode to "Plan" for read-only analysis first', hint: 'This prevents accidental file changes' },
      { label: 'Use the docs template', action: 'Templates → Documentation → Generate API Docs', hint: 'Specify which directory to document' },
      { label: 'Review output', action: 'Check the generated documentation for accuracy', hint: 'AI may hallucinate API details — verify' },
      { label: 'Switch to acceptEdits and save', action: 'Change permission mode and ask AI to write the docs file', hint: 'Now it can create the actual .md files' },
    ],
  },
]

interface Props {
  completedTaskIds: string[]
  onComplete: (taskId: string) => void
}

export default function GuidedTasks({ completedTaskIds, onComplete }: Props): JSX.Element {
  const [selectedTask, setSelectedTask] = useState<GuidedTask | null>(null)
  const [currentStepIdx, setCurrentStepIdx] = useState(0)

  if (selectedTask) {
    const step = selectedTask.steps[currentStepIdx]
    const isLast = currentStepIdx === selectedTask.steps.length - 1
    const isComplete = completedTaskIds.includes(selectedTask.id)

    return (
      <div className="space-y-4">
        <button onClick={() => { setSelectedTask(null); setCurrentStepIdx(0) }}
          className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
          ← Back to tasks
        </button>

        <div>
          <h3 className="text-sm font-semibold text-gray-900">{selectedTask.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{selectedTask.description}</p>
        </div>

        {/* Step progress */}
        <div className="flex gap-1">
          {selectedTask.steps.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${
              i < currentStepIdx ? 'bg-green-400' : i === currentStepIdx ? 'bg-indigo-500' : 'bg-gray-200'
            }`} />
          ))}
        </div>

        {/* Current step */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
          <div className="text-xs text-indigo-500 font-medium mb-1">Step {currentStepIdx + 1} of {selectedTask.steps.length}</div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2">{step.label}</h4>
          <p className="text-sm text-gray-700 mb-2">{step.action}</p>
          <p className="text-xs text-gray-500 italic">{step.hint}</p>
        </div>

        <div className="flex gap-3">
          {currentStepIdx > 0 && (
            <button onClick={() => setCurrentStepIdx((i) => i - 1)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Previous
            </button>
          )}
          {isLast ? (
            <button
              onClick={() => { onComplete(selectedTask.id); setSelectedTask(null); setCurrentStepIdx(0) }}
              className="flex-1 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-500 transition-colors"
            >
              {isComplete ? 'Done Again' : 'Mark Complete'}
            </button>
          ) : (
            <button onClick={() => setCurrentStepIdx((i) => i + 1)}
              className="flex-1 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors">
              Next Step
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Guided Tasks</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Step-by-step walkthroughs for common workflows
        </p>
      </div>

      <div className="grid gap-3">
        {TASKS.map((task) => {
          const isComplete = completedTaskIds.includes(task.id)
          return (
            <button
              key={task.id}
              onClick={() => setSelectedTask(task)}
              className={`text-left px-4 py-3 rounded-xl border transition-all ${
                isComplete ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {isComplete && (
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span className="text-sm font-medium text-gray-800">{task.title}</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{task.category}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 ml-6">{task.description} · {task.steps.length} steps</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
