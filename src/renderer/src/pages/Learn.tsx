import { useState, useEffect, useCallback } from 'react'

interface Lesson {
  id: string; title: string; type: string; estimatedMinutes: number; description: string
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
    // Keep activePath in sync with refreshed data
    setActivePath((prev) => prev ? p.find((pp) => pp.id === prev.id) ?? prev : null)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const completeLesson = async (lessonId: string, score?: number) => {
    await window.electronAPI.invoke('learn:complete-lesson', {
      lessonId, score, timeMinutes: activeLesson?.estimatedMinutes ?? 2,
    })

    // Refresh data FIRST so activePath gets updated completed IDs
    const [p, prog, ach] = await Promise.all([
      window.electronAPI.invoke('learn:get-paths') as Promise<LearningPath[]>,
      window.electronAPI.invoke('learn:get-progress') as Promise<ProgressData>,
      window.electronAPI.invoke('learn:get-achievements') as Promise<Achievement[]>,
    ])
    setPaths(p)
    setProgress(prog)
    setAchievements(ach)

    // Get the refreshed active path
    const refreshedPath = activePath ? p.find((pp) => pp.id === activePath.id) : null
    if (refreshedPath) setActivePath(refreshedPath)

    // Auto-advance to next lesson or back to path
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

    // Notify sidebar to refresh learn progress
    window.dispatchEvent(new Event('sidebar:refresh'))
  }

  const openPath = (path: LearningPath) => { setActivePath(path); setView('path') }
  const openLesson = (lesson: Lesson) => { setActiveLesson(lesson); setView('lesson') }

  if (loading || !progress) return <div className="p-8 text-center text-gray-400">Loading...</div>

  const completedMap = new Set(
    paths.flatMap((p) => p.modules.flatMap((m) => m.lessons))
      .filter((_, i) => i < progress.completed)
      .map((l) => l.id)
  )

  // ── Lesson View ─────────────────────────────────────────────────────────
  if (view === 'lesson' && activeLesson && activePath) {
    const allLessons = activePath.modules.flatMap((m) => m.lessons)
    const lessonIdx = allLessons.findIndex((l) => l.id === activeLesson.id)
    const modForLesson = activePath.modules.find((m) => m.lessons.some((l) => l.id === activeLesson.id))

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
          <p className="text-sm text-gray-600 mb-6">{activeLesson.description}</p>

          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            {activeLesson.type === 'interactive-walkthrough' && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">👆</div>
                <p className="text-sm text-gray-600 mb-4">This is an interactive walkthrough. It would highlight UI elements in the real app and guide you through each step.</p>
                <p className="text-xs text-gray-400">In a full implementation, this overlays on the actual app with spotlighted elements and instruction tooltips.</p>
              </div>
            )}
            {activeLesson.type === 'guided-task' && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🎯</div>
                <p className="text-sm text-gray-600 mb-4">This is a guided task. You'd perform a real task in the app while a floating instruction panel provides step-by-step guidance.</p>
                <p className="text-xs text-gray-400">Success criteria are auto-detected as you work.</p>
              </div>
            )}
            {activeLesson.type === 'knowledge-check' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">Quick knowledge check — test your understanding:</p>
                {[1, 2, 3].map((q) => (
                  <div key={q} className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-800 mb-2">Sample Question {q}: What does this feature do?</p>
                    <div className="space-y-1.5">
                      {['Option A', 'Option B', 'Option C'].map((opt) => (
                        <button key={opt} className="w-full text-left px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
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
                <p className="text-sm text-gray-600 mb-4">This is a sandbox — a safe practice environment with sample files. Experiment freely without affecting your real projects.</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom nav */}
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
      </div>
    )
  }

  // ── Path Detail View ────────────────────────────────────────────────────
  if (view === 'path' && activePath) {
    const completedLessons = new Set(Object.keys(progress ? {} : {})) // Will be populated from backend
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
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{lesson.type.replace(/-/g, ' ')}</span>
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
          <p className="text-sm text-gray-500">Choose a learning path to get started</p>

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
