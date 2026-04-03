import { useState, useEffect, useCallback } from 'react'

// ── Content type interfaces (mirror learnHandlers.ts) ────────────────────────

interface WalkthroughContent {
  kind: 'walkthrough'
  introduction: string
  steps: Array<{ title: string; description: string; tip?: string }>
  keyTakeaway: string
}

interface GuidedTaskContent {
  kind: 'guided-task'
  introduction: string
  goal: string
  steps: Array<{ title: string; instruction: string; detail: string; successCheck?: string }>
  celebration: string
}

interface KnowledgeCheckContent {
  kind: 'knowledge-check'
  introduction: string
  questions: Array<{
    question: string
    options: Array<{ text: string; correct: boolean }>
    explanation: string
  }>
}

type LessonContent = WalkthroughContent | GuidedTaskContent | KnowledgeCheckContent | Record<string, never>

interface Lesson {
  id: string; title: string; type: string; estimatedMinutes: number; description: string
  content: LessonContent
}
interface Module {
  id: string; title: string; description: string; estimatedMinutes: number; prerequisites: string[]; lessons: Lesson[]
}
interface LearningPath {
  id: string; name: string; description: string; icon: string; modules: Module[]
  unlocked: boolean; progress: { completed: number; total: number; percentage: number }
  completedLessonIds: string[]
}
interface Achievement {
  id: string; name: string; description: string; icon: string; unlocked: boolean; unlockedAt?: number
}
interface ProgressData {
  completed: number; total: number; percentage: number
  streak: { lastDate: string; count: number }; totalTimeMinutes: number
  selectedPath: string | null; nextLesson: Lesson | null; dismissed: boolean
}

type View = 'landing' | 'path' | 'lesson'

// ── Knowledge Check sub-component ────────────────────────────────────────────

function KnowledgeCheck({ content, onComplete }: {
  content: KnowledgeCheckContent
  onComplete: (score: number) => void
}): JSX.Element {
  const [currentQ, setCurrentQ] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)

  const q = content.questions[currentQ]
  if (!q) return <div />

  const handleSelect = (idx: number) => {
    if (answered) return
    setSelectedIdx(idx)
    setAnswered(true)
    if (q.options[idx].correct) setScore((s) => s + 1)
  }

  const handleNext = () => {
    if (currentQ < content.questions.length - 1) {
      setCurrentQ((i) => i + 1)
      setSelectedIdx(null)
      setAnswered(false)
    } else {
      setFinished(true)
    }
  }

  if (finished) {
    const pct = Math.round((score / content.questions.length) * 100)
    return (
      <div className="text-center py-6 space-y-4">
        <div className="text-4xl">{pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚'}</div>
        <h3 className="text-lg font-semibold text-gray-900">
          {pct >= 80 ? 'Great job!' : pct >= 50 ? 'Good effort!' : 'Keep learning!'}
        </h3>
        <p className="text-sm text-gray-600">You got {score} of {content.questions.length} correct ({pct}%)</p>
        <button
          onClick={() => onComplete(score)}
          className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors"
        >Continue</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{content.introduction}</p>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-indigo-600">Question {currentQ + 1} of {content.questions.length}</span>
        <div className="flex gap-1 flex-1">
          {content.questions.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${
              i < currentQ ? 'bg-green-400' : i === currentQ ? 'bg-indigo-500' : 'bg-gray-200'
            }`} />
          ))}
        </div>
      </div>

      <p className="text-sm font-medium text-gray-900">{q.question}</p>

      <div className="space-y-2">
        {q.options.map((opt, idx) => {
          let borderClass = 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
          if (answered) {
            if (opt.correct) borderClass = 'border-green-400 bg-green-50'
            else if (idx === selectedIdx) borderClass = 'border-red-400 bg-red-50'
            else borderClass = 'border-gray-200 opacity-60'
          }
          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              disabled={answered}
              className={`w-full text-left px-4 py-3 text-sm rounded-lg border transition-colors ${borderClass}`}
            >
              <div className="flex items-center gap-2">
                {answered && opt.correct && (
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                )}
                {answered && !opt.correct && idx === selectedIdx && (
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                )}
                <span className={answered && opt.correct ? 'text-green-800 font-medium' : 'text-gray-700'}>{opt.text}</span>
              </div>
            </button>
          )
        })}
      </div>

      {answered && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
          <p className="text-xs font-medium text-blue-700 mb-1">Explanation</p>
          <p className="text-sm text-blue-800">{q.explanation}</p>
        </div>
      )}

      {answered && (
        <div className="flex justify-end">
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors"
          >{currentQ < content.questions.length - 1 ? 'Next Question' : 'See Results'}</button>
        </div>
      )}
    </div>
  )
}

// ── Walkthrough sub-component ────────────────────────────────────────────────

function WalkthroughContent({ content }: { content: WalkthroughContent }): JSX.Element {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-700 leading-relaxed">{content.introduction}</p>

      <div className="space-y-3">
        {content.steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-gray-900">{step.title}</h4>
              <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{step.description}</p>
              {step.tip && (
                <p className="text-xs text-indigo-600 mt-1 flex items-start gap-1">
                  <span className="flex-shrink-0">💡</span>
                  <span>{step.tip}</span>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mt-4">
        <p className="text-xs font-semibold text-indigo-700 mb-1">Key Takeaway</p>
        <p className="text-sm text-indigo-800">{content.keyTakeaway}</p>
      </div>
    </div>
  )
}

// ── Guided Task sub-component ────────────────────────────────────────────────

function GuidedTaskContent({ content }: { content: GuidedTaskContent }): JSX.Element {
  const [currentStep, setCurrentStep] = useState(0)

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-700 leading-relaxed">{content.introduction}</p>

      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
        <span className="text-green-600 flex-shrink-0 mt-0.5">🎯</span>
        <div>
          <p className="text-xs font-semibold text-green-700">Goal</p>
          <p className="text-sm text-green-800">{content.goal}</p>
        </div>
      </div>

      {/* Step progress bar */}
      <div className="flex gap-1">
        {content.steps.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
            i < currentStep ? 'bg-green-400' : i === currentStep ? 'bg-indigo-500' : 'bg-gray-200'
          }`} />
        ))}
      </div>

      {/* Current step card */}
      <div className="bg-white border-2 border-indigo-200 rounded-xl p-5">
        <div className="text-xs font-medium text-indigo-500 mb-2">Step {currentStep + 1} of {content.steps.length}</div>
        <h4 className="text-sm font-bold text-gray-900 mb-2">{content.steps[currentStep].title}</h4>
        <p className="text-sm text-gray-800 mb-2">{content.steps[currentStep].instruction}</p>
        <p className="text-xs text-gray-500 leading-relaxed">{content.steps[currentStep].detail}</p>
        {content.steps[currentStep].successCheck && (
          <div className="mt-3 flex items-start gap-1.5 text-xs text-green-600">
            <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span>Success check: {content.steps[currentStep].successCheck}</span>
          </div>
        )}
      </div>

      {/* Step navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0}
          className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >Previous</button>
        {currentStep < content.steps.length - 1 ? (
          <button
            onClick={() => setCurrentStep((s) => s + 1)}
            className="px-3 py-1.5 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors"
          >Next Step</button>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            <p className="text-xs text-green-700 font-medium">🎉 {content.celebration}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Learn(): JSX.Element {
  const [view, setView] = useState<View>('landing')
  const [paths, setPaths] = useState<LearningPath[]>([])
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [activePath, setActivePath] = useState<LearningPath | null>(null)
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [p, prog, ach] = await Promise.all([
      window.electronAPI.invoke('learn:get-paths') as Promise<LearningPath[]>,
      window.electronAPI.invoke('learn:get-progress') as Promise<ProgressData>,
      window.electronAPI.invoke('learn:get-achievements') as Promise<Achievement[]>,
    ])
    setPaths(p)
    setProgress(prog)
    setAchievements(ach)
    setActivePath((prev) => prev ? p.find((pp) => pp.id === prev.id) ?? prev : null)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const completeLesson = async (lessonId: string, score?: number) => {
    await window.electronAPI.invoke('learn:complete-lesson', {
      lessonId, score, timeMinutes: activeLesson?.estimatedMinutes ?? 2,
    })

    const [p, prog, ach] = await Promise.all([
      window.electronAPI.invoke('learn:get-paths') as Promise<LearningPath[]>,
      window.electronAPI.invoke('learn:get-progress') as Promise<ProgressData>,
      window.electronAPI.invoke('learn:get-achievements') as Promise<Achievement[]>,
    ])
    setPaths(p)
    setProgress(prog)
    setAchievements(ach)

    const refreshedPath = activePath ? p.find((pp) => pp.id === activePath.id) : null
    if (refreshedPath) setActivePath(refreshedPath)

    if (refreshedPath) {
      const allLessons = refreshedPath.modules.flatMap((m) => m.lessons)
      const idx = allLessons.findIndex((l) => l.id === lessonId)
      if (idx >= 0 && idx < allLessons.length - 1) {
        setActiveLesson(allLessons[idx + 1])
      } else {
        setActiveLesson(null)
        setView('path')
      }
    }

    window.dispatchEvent(new Event('sidebar:refresh'))
  }

  const openPath = (path: LearningPath) => { setActivePath(path); setView('path') }
  const openLesson = (lesson: Lesson) => { setActiveLesson(lesson); setView('lesson') }

  if (loading || !progress) return <div className="p-8 text-center text-gray-400">Loading...</div>

  // ── Lesson View ─────────────────────────────────────────────────────────
  if (view === 'lesson' && activeLesson && activePath) {
    const allLessons = activePath.modules.flatMap((m) => m.lessons)
    const lessonIdx = allLessons.findIndex((l) => l.id === activeLesson.id)
    const modForLesson = activePath.modules.find((m) => m.lessons.some((l) => l.id === activeLesson.id))
    const content = activeLesson.content as LessonContent
    const hasRealContent = content && 'kind' in content

    return (
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <button onClick={() => { setView('path'); setActiveLesson(null) }} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div className="text-xs text-gray-400">
            {activePath.name} &rsaquo; {modForLesson?.title} &rsaquo; <span className="text-gray-700">{activeLesson.title}</span>
          </div>
          <div className="flex-1" />
          <span className="text-xs text-gray-400">{activeLesson.estimatedMinutes} min</span>
          <span className="text-xs text-gray-400">Lesson {lessonIdx + 1} of {allLessons.length}</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{activeLesson.title}</h1>
          <div className="flex items-center gap-2 mb-6">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              activeLesson.type === 'interactive-walkthrough' ? 'bg-blue-100 text-blue-700' :
              activeLesson.type === 'guided-task' ? 'bg-green-100 text-green-700' :
              activeLesson.type === 'knowledge-check' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {activeLesson.type === 'interactive-walkthrough' ? 'Walkthrough' :
               activeLesson.type === 'guided-task' ? 'Guided Task' :
               activeLesson.type === 'knowledge-check' ? 'Knowledge Check' :
               activeLesson.type.replace(/-/g, ' ')}
            </span>
            <span className="text-xs text-gray-400">{activeLesson.estimatedMinutes} min</span>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            {hasRealContent && content.kind === 'walkthrough' && (
              <WalkthroughContent content={content} />
            )}
            {hasRealContent && content.kind === 'guided-task' && (
              <GuidedTaskContent content={content} />
            )}
            {hasRealContent && content.kind === 'knowledge-check' && (
              <KnowledgeCheck content={content} onComplete={(score) => void completeLesson(activeLesson.id, score)} />
            )}
            {!hasRealContent && activeLesson.type === 'interactive-walkthrough' && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">👆</div>
                <p className="text-sm text-gray-600 mb-2">{activeLesson.description}</p>
                <p className="text-xs text-gray-400">Interactive walkthrough content is being developed.</p>
              </div>
            )}
            {!hasRealContent && activeLesson.type === 'guided-task' && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🎯</div>
                <p className="text-sm text-gray-600 mb-2">{activeLesson.description}</p>
                <p className="text-xs text-gray-400">Guided task content is being developed.</p>
              </div>
            )}
            {!hasRealContent && activeLesson.type === 'knowledge-check' && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-sm text-gray-600 mb-2">{activeLesson.description}</p>
                <p className="text-xs text-gray-400">Knowledge check content is being developed.</p>
              </div>
            )}
            {activeLesson.type === 'video-placeholder' && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🎬</div>
                <p className="text-sm text-gray-600 mb-2">Video content coming soon.</p>
                <p className="text-xs text-gray-400">Try the interactive walkthrough for this topic in the meantime.</p>
              </div>
            )}
            {activeLesson.type === 'sandbox' && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🧪</div>
                <p className="text-sm text-gray-600 mb-4">Sandbox environment coming soon.</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom nav — knowledge checks handle their own completion via the quiz flow */}
        {!(hasRealContent && content.kind === 'knowledge-check') && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-white flex-shrink-0">
            <button
              onClick={() => { if (lessonIdx > 0) setActiveLesson(allLessons[lessonIdx - 1]) }}
              disabled={lessonIdx === 0}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >Previous</button>
            <div className="flex gap-1">
              {allLessons.map((l, i) => (
                <div key={l.id} className={`w-2 h-2 rounded-full ${i === lessonIdx ? 'bg-indigo-600' : i < lessonIdx ? 'bg-green-400' : 'bg-gray-300'}`} />
              ))}
            </div>
            <button
              onClick={() => void completeLesson(activeLesson.id)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500"
            >{lessonIdx < allLessons.length - 1 ? 'Complete & Next' : 'Complete Lesson'}</button>
          </div>
        )}
      </div>
    )
  }

  // ── Path Detail View ────────────────────────────────────────────────────
  if (view === 'path' && activePath) {
    return (
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        <button onClick={() => { setView('landing'); setActivePath(null) }} className="text-xs text-gray-500 hover:text-gray-700">&larr; All Paths</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{activePath.icon} {activePath.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{activePath.description}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-200 rounded-full">
              <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${activePath.progress.percentage}%` }} />
            </div>
            <span className="text-xs text-gray-500">{activePath.progress.percentage}%</span>
          </div>
        </div>

        {activePath.modules.map((mod) => (
          <div key={mod.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">{mod.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{mod.description} · {mod.estimatedMinutes} min</p>
            </div>
            <div className="divide-y divide-gray-50">
              {mod.lessons.map((lesson) => {
                const isCompleted = activePath.completedLessonIds?.includes(lesson.id) ?? false
                return (
                  <button key={lesson.id} onClick={() => openLesson(lesson)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isCompleted ? 'bg-green-500 text-white' : 'border-2 border-gray-300'
                    }`}>
                      {isCompleted && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-800">{lesson.title}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          lesson.type === 'interactive-walkthrough' ? 'bg-blue-50 text-blue-600' :
                          lesson.type === 'guided-task' ? 'bg-green-50 text-green-600' :
                          lesson.type === 'knowledge-check' ? 'bg-amber-50 text-amber-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>{lesson.type === 'interactive-walkthrough' ? 'walkthrough' :
                             lesson.type === 'guided-task' ? 'guided task' :
                             lesson.type === 'knowledge-check' ? 'quiz' :
                             lesson.type.replace(/-/g, ' ')}</span>
                        <span className="text-[10px] text-gray-400">{lesson.estimatedMinutes} min</span>
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Landing View ────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto flex gap-8">
        {/* Left: paths */}
        <div className="flex-1 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Learning Center</h1>
          <p className="text-sm text-gray-500">Choose a learning path based on your role. Start with Getting Started — it unlocks everything else.</p>

          {paths.map((path) => (
            <button key={path.id} onClick={() => path.unlocked && openPath(path)} disabled={!path.unlocked}
              className={`w-full text-left bg-white border rounded-xl p-5 transition-all ${
                path.unlocked ? 'border-gray-200 hover:border-indigo-300 hover:shadow-sm' : 'border-gray-100 opacity-60'
              }`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{path.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{path.name}</h3>
                    {!path.unlocked && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Locked</span>}
                    {path.id === progress.selectedPath && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">Selected</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{path.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full">
                      <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${path.progress.percentage}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{path.progress.completed}/{path.progress.total}</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {path.modules.length} modules · {path.modules.reduce((s, m) => s + m.estimatedMinutes, 0)} min
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Right: progress */}
        <div className="w-64 flex-shrink-0 space-y-4">
          {/* Progress ring */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
            <div className="relative w-24 h-24 mx-auto mb-3">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#6366f1" strokeWidth="2.5"
                  strokeDasharray={`${progress.percentage}, 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-gray-900">{progress.percentage}%</span>
              </div>
            </div>
            <p className="text-sm text-gray-700 font-medium">{progress.completed} of {progress.total} lessons</p>
          </div>

          {/* Streak */}
          {progress.streak.count > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
              <span className="text-lg">🔥</span>
              <p className="text-sm font-medium text-gray-800">{progress.streak.count} day streak</p>
            </div>
          )}

          {/* Time invested */}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">Time invested</p>
            <p className="text-sm font-medium text-gray-800">
              {progress.totalTimeMinutes >= 60
                ? `${Math.floor(progress.totalTimeMinutes / 60)}h ${progress.totalTimeMinutes % 60}m`
                : `${progress.totalTimeMinutes}m`}
            </p>
          </div>

          {/* Achievements */}
          {achievements.filter((a) => a.unlocked).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-2">Achievements</p>
              <div className="flex flex-wrap gap-1.5">
                {achievements.filter((a) => a.unlocked).map((a) => (
                  <span key={a.id} title={`${a.name}: ${a.description}`} className="text-lg cursor-default">{a.icon}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
