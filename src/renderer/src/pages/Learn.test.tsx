// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

const PATH_DATA = [
  {
    id: 'path-1',
    name: 'Getting Started',
    description: 'Learn the basics',
    icon: '📘',
    unlocked: true,
    progress: { completed: 1, total: 4, percentage: 25 },
    completedLessonIds: [],
    modules: [
      {
        id: 'mod-1',
        title: 'First Steps',
        description: 'Your first module',
        estimatedMinutes: 10,
        prerequisites: [],
        lessons: [
          { id: 'lesson-1', title: 'Introduction', type: 'walkthrough', estimatedMinutes: 5, description: 'An introduction', content: {} },
          { id: 'lesson-2', title: 'Advanced Topics', type: 'walkthrough', estimatedMinutes: 8, description: 'Deeper dive', content: {} },
        ],
      },
    ],
  },
]

const PROGRESS_DATA = {
  completed: 1,
  total: 4,
  percentage: 25,
  streak: { lastDate: '2026-04-10', count: 3 },
  totalTimeMinutes: 10,
  selectedPath: null,
  nextLesson: null,
  dismissed: false,
}

function setupLearnAPI() {
  const api = setupElectronAPI({
    'learn:get-paths': PATH_DATA,
    'learn:get-progress': PROGRESS_DATA,
    'learn:get-achievements': [],
    'learn:complete-lesson': null,
  })
  mockInvoke = api.mockInvoke
  return api
}

beforeEach(() => {
  setupLearnAPI()
})

import Learn from './Learn'

describe('Learn', () => {
  it('shows loading state initially', () => {
    render(<Learn />)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('calls learn IPC channels on mount', () => {
    render(<Learn />)
    expect(mockInvoke).toHaveBeenCalledWith('learn:get-paths')
    expect(mockInvoke).toHaveBeenCalledWith('learn:get-progress')
    expect(mockInvoke).toHaveBeenCalledWith('learn:get-achievements')
  })

  it('renders learning path after loading', async () => {
    render(<Learn />)
    await waitFor(() => {
      expect(screen.getByText('Getting Started')).toBeInTheDocument()
    })
  })

  it('shows progress information', async () => {
    render(<Learn />)
    await waitFor(() => {
      expect(screen.getByText(/25%/)).toBeInTheDocument()
    })
  })

  it('shows Learning Center heading after load', async () => {
    render(<Learn />)
    await waitFor(() => {
      expect(screen.getByText('Learning Center')).toBeInTheDocument()
    })
  })

  it('shows streak when streak count > 0', async () => {
    render(<Learn />)
    await waitFor(() => {
      expect(screen.getByText(/3 day streak/)).toBeInTheDocument()
    })
  })

  it('shows time invested', async () => {
    render(<Learn />)
    await waitFor(() => {
      expect(screen.getByText('10m')).toBeInTheDocument()
    })
  })

  it('navigates to path view when clicking on a path', async () => {
    render(<Learn />)
    await waitFor(() => expect(screen.getByText('Getting Started')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Getting Started'))
    await waitFor(() => {
      // Path view shows "All Paths" back button and module name
      expect(screen.getByText(/All Paths/)).toBeInTheDocument()
      expect(screen.getByText('First Steps')).toBeInTheDocument()
    })
  })

  it('back button in path view returns to landing', async () => {
    render(<Learn />)
    await waitFor(() => expect(screen.getByText('Getting Started')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Getting Started'))
    await waitFor(() => expect(screen.getByText(/All Paths/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/All Paths/))
    await waitFor(() => {
      expect(screen.getByText('Learning Center')).toBeInTheDocument()
    })
  })

  it('navigates to lesson view when clicking a lesson', async () => {
    render(<Learn />)
    await waitFor(() => expect(screen.getByText('Getting Started')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Getting Started'))
    await waitFor(() => expect(screen.getByText('Introduction')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Introduction'))
    await waitFor(() => {
      // Lesson view shows lesson heading and Complete button
      expect(screen.getByText('Complete & Next')).toBeInTheDocument()
    })
  })

  it('back button in lesson view returns to path view', async () => {
    render(<Learn />)
    await waitFor(() => expect(screen.getByText('Getting Started')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Getting Started'))
    await waitFor(() => expect(screen.getByText('Introduction')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Introduction'))
    await waitFor(() => expect(screen.getByText('Complete & Next')).toBeInTheDocument())
    // Click the back arrow (SVG button)
    const backButton = screen.getAllByRole('button')[0]
    fireEvent.click(backButton)
    await waitFor(() => {
      expect(screen.getByText(/All Paths/)).toBeInTheDocument()
    })
  })

  it('completes a lesson by clicking Complete & Next', async () => {
    render(<Learn />)
    await waitFor(() => expect(screen.getByText('Getting Started')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Getting Started'))
    await waitFor(() => expect(screen.getByText('Introduction')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Introduction'))
    await waitFor(() => expect(screen.getByText('Complete & Next')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Complete & Next'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('learn:complete-lesson', expect.objectContaining({ lessonId: 'lesson-1' }))
    })
  })

  it('shows Complete Lesson for last lesson', async () => {
    render(<Learn />)
    await waitFor(() => expect(screen.getByText('Getting Started')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Getting Started'))
    await waitFor(() => expect(screen.getByText('Advanced Topics')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Advanced Topics'))
    await waitFor(() => {
      expect(screen.getByText('Complete Lesson')).toBeInTheDocument()
    })
  })

  it('renders with achievements when provided', async () => {
    const api = setupElectronAPI({
      'learn:get-paths': PATH_DATA,
      'learn:get-progress': PROGRESS_DATA,
      'learn:get-achievements': [
        { id: 'ach-1', name: 'First Lesson', description: 'Completed your first lesson', icon: '🏆', unlocked: true, unlockedAt: Date.now() },
      ],
    })
    mockInvoke = api.mockInvoke
    render(<Learn />)
    await waitFor(() => {
      expect(screen.getByText('Achievements')).toBeInTheDocument()
    })
  })

  it('shows time invested in hours+minutes when >= 60 minutes', async () => {
    const api = setupElectronAPI({
      'learn:get-paths': PATH_DATA,
      'learn:get-progress': { ...PROGRESS_DATA, totalTimeMinutes: 90 },
      'learn:get-achievements': [],
    })
    mockInvoke = api.mockInvoke
    render(<Learn />)
    await waitFor(() => {
      expect(screen.getByText('1h 30m')).toBeInTheDocument()
    })
  })

  it('shows Selected badge on currently selected path', async () => {
    const api = setupElectronAPI({
      'learn:get-paths': PATH_DATA,
      'learn:get-progress': { ...PROGRESS_DATA, selectedPath: 'path-1' },
      'learn:get-achievements': [],
    })
    mockInvoke = api.mockInvoke
    render(<Learn />)
    await waitFor(() => {
      expect(screen.getByText('Selected')).toBeInTheDocument()
    })
  })

  it('renders walkthrough lesson content with WalkthroughContent sub-component', async () => {
    const walkthroughPath = [{
      id: 'path-wt',
      name: 'Walkthrough Path',
      description: 'Walkthroughs',
      icon: '📘',
      unlocked: true,
      progress: { completed: 0, total: 1, percentage: 0 },
      completedLessonIds: [],
      modules: [{
        id: 'mod-wt',
        title: 'Walkthroughs Module',
        description: 'Learn walkthroughs',
        estimatedMinutes: 10,
        prerequisites: [],
        lessons: [{
          id: 'wt-1',
          title: 'Walkthrough Lesson',
          type: 'interactive-walkthrough',
          estimatedMinutes: 5,
          description: 'A walkthrough',
          content: {
            kind: 'walkthrough',
            introduction: 'This is the intro text',
            steps: [{ title: 'Step One', description: 'Do this first', tip: 'A helpful tip' }],
            keyTakeaway: 'Remember this takeaway',
          },
        }],
      }],
    }]
    const api = setupElectronAPI({
      'learn:get-paths': walkthroughPath,
      'learn:get-progress': PROGRESS_DATA,
      'learn:get-achievements': [],
      'learn:complete-lesson': null,
    })
    mockInvoke = api.mockInvoke
    render(<Learn />)
    await waitFor(() => screen.getByText('Walkthrough Path'))
    fireEvent.click(screen.getByText('Walkthrough Path'))
    await waitFor(() => screen.getByText('Walkthrough Lesson'))
    fireEvent.click(screen.getByText('Walkthrough Lesson'))
    await waitFor(() => {
      expect(screen.getByText('This is the intro text')).toBeInTheDocument()
      expect(screen.getByText('Step One')).toBeInTheDocument()
      expect(screen.getByText('A helpful tip')).toBeInTheDocument()
      expect(screen.getByText('Remember this takeaway')).toBeInTheDocument()
    })
  })

  it('renders guided-task lesson content with GuidedTaskContent sub-component', async () => {
    const guidedPath = [{
      id: 'path-gt',
      name: 'Guided Task Path',
      description: 'Tasks',
      icon: '🎯',
      unlocked: true,
      progress: { completed: 0, total: 1, percentage: 0 },
      completedLessonIds: [],
      modules: [{
        id: 'mod-gt',
        title: 'Tasks Module',
        description: 'Guided tasks',
        estimatedMinutes: 10,
        prerequisites: [],
        lessons: [{
          id: 'gt-1',
          title: 'Guided Task Lesson',
          type: 'guided-task',
          estimatedMinutes: 5,
          description: 'A guided task',
          content: {
            kind: 'guided-task',
            introduction: 'Task intro text',
            goal: 'Complete the mission',
            steps: [
              { title: 'Task Step 1', instruction: 'Do the first thing', detail: 'Here are details', successCheck: 'Check you did it' },
              { title: 'Task Step 2', instruction: 'Do the second thing', detail: 'More details' },
            ],
            celebration: 'Great work!',
          },
        }],
      }],
    }]
    const api = setupElectronAPI({
      'learn:get-paths': guidedPath,
      'learn:get-progress': PROGRESS_DATA,
      'learn:get-achievements': [],
      'learn:complete-lesson': null,
    })
    mockInvoke = api.mockInvoke
    render(<Learn />)
    await waitFor(() => screen.getByText('Guided Task Path'))
    fireEvent.click(screen.getByText('Guided Task Path'))
    await waitFor(() => screen.getByText('Guided Task Lesson'))
    fireEvent.click(screen.getByText('Guided Task Lesson'))
    await waitFor(() => {
      expect(screen.getByText('Task intro text')).toBeInTheDocument()
      expect(screen.getByText('Complete the mission')).toBeInTheDocument()
      expect(screen.getByText('Task Step 1')).toBeInTheDocument()
      expect(screen.getByText(/Success check:/)).toBeInTheDocument()
    })
  })

  it('guided-task next/previous navigation works', async () => {
    const guidedPath = [{
      id: 'path-gt2',
      name: 'Guided Nav Path',
      description: 'Nav test',
      icon: '🎯',
      unlocked: true,
      progress: { completed: 0, total: 1, percentage: 0 },
      completedLessonIds: [],
      modules: [{
        id: 'mod-gt2',
        title: 'Nav Module',
        description: 'Nav test',
        estimatedMinutes: 10,
        prerequisites: [],
        lessons: [{
          id: 'gt-nav',
          title: 'Nav Task Lesson',
          type: 'guided-task',
          estimatedMinutes: 5,
          description: 'Nav task',
          content: {
            kind: 'guided-task',
            introduction: 'Intro',
            goal: 'Navigate steps',
            steps: [
              { title: 'First Step', instruction: 'Do first', detail: 'Step 1 details' },
              { title: 'Second Step', instruction: 'Do second', detail: 'Step 2 details' },
            ],
            celebration: 'Done!',
          },
        }],
      }],
    }]
    const api = setupElectronAPI({
      'learn:get-paths': guidedPath,
      'learn:get-progress': PROGRESS_DATA,
      'learn:get-achievements': [],
      'learn:complete-lesson': null,
    })
    mockInvoke = api.mockInvoke
    render(<Learn />)
    await waitFor(() => screen.getByText('Guided Nav Path'))
    fireEvent.click(screen.getByText('Guided Nav Path'))
    await waitFor(() => screen.getByText('Nav Task Lesson'))
    fireEvent.click(screen.getByText('Nav Task Lesson'))
    await waitFor(() => screen.getByText('First Step'))
    // Click Next Step (in the guided task content)
    fireEvent.click(screen.getByText('Next Step'))
    await waitFor(() => {
      expect(screen.getByText('Second Step')).toBeInTheDocument()
    })
    // Click Previous in the GuidedTaskContent (first "Previous" button, the step nav one)
    const prevButtons = screen.getAllByText('Previous')
    fireEvent.click(prevButtons[0])
    await waitFor(() => {
      expect(screen.getByText('First Step')).toBeInTheDocument()
    })
  })

  it('renders knowledge-check lesson and shows quiz questions', async () => {
    const quizPath = [{
      id: 'path-quiz',
      name: 'Quiz Path',
      description: 'Quizzes',
      icon: '✅',
      unlocked: true,
      progress: { completed: 0, total: 1, percentage: 0 },
      completedLessonIds: [],
      modules: [{
        id: 'mod-quiz',
        title: 'Quiz Module',
        description: 'Quizzes',
        estimatedMinutes: 10,
        prerequisites: [],
        lessons: [{
          id: 'quiz-1',
          title: 'Quiz Lesson',
          type: 'knowledge-check',
          estimatedMinutes: 5,
          description: 'A quiz',
          content: {
            kind: 'knowledge-check',
            introduction: 'Test your knowledge',
            questions: [{
              question: 'What is 2+2?',
              options: [
                { text: '3', correct: false },
                { text: '4', correct: true },
                { text: '5', correct: false },
              ],
              explanation: 'Basic arithmetic: 2+2=4',
            }],
          },
        }],
      }],
    }]
    const api = setupElectronAPI({
      'learn:get-paths': quizPath,
      'learn:get-progress': PROGRESS_DATA,
      'learn:get-achievements': [],
      'learn:complete-lesson': null,
    })
    mockInvoke = api.mockInvoke
    render(<Learn />)
    await waitFor(() => screen.getByText('Quiz Path'))
    fireEvent.click(screen.getByText('Quiz Path'))
    await waitFor(() => screen.getByText('Quiz Lesson'))
    fireEvent.click(screen.getByText('Quiz Lesson'))
    await waitFor(() => {
      expect(screen.getByText('Test your knowledge')).toBeInTheDocument()
      expect(screen.getByText('What is 2+2?')).toBeInTheDocument()
    })
  })

  it('knowledge-check: selecting correct answer shows explanation then See Results', async () => {
    const quizPath = [{
      id: 'path-quiz2',
      name: 'Quiz Path 2',
      description: 'Quizzes',
      icon: '✅',
      unlocked: true,
      progress: { completed: 0, total: 1, percentage: 0 },
      completedLessonIds: [],
      modules: [{
        id: 'mod-quiz2',
        title: 'Quiz Module 2',
        description: 'Quizzes',
        estimatedMinutes: 10,
        prerequisites: [],
        lessons: [{
          id: 'quiz-2',
          title: 'Quiz Lesson 2',
          type: 'knowledge-check',
          estimatedMinutes: 5,
          description: 'A quiz',
          content: {
            kind: 'knowledge-check',
            introduction: 'Test your knowledge',
            questions: [{
              question: 'What is the CLI command?',
              options: [
                { text: 'copilot', correct: true },
                { text: 'claude', correct: false },
              ],
              explanation: 'The CLI command is copilot',
            }],
          },
        }],
      }],
    }]
    const api = setupElectronAPI({
      'learn:get-paths': quizPath,
      'learn:get-progress': PROGRESS_DATA,
      'learn:get-achievements': [],
      'learn:complete-lesson': null,
    })
    mockInvoke = api.mockInvoke
    render(<Learn />)
    await waitFor(() => screen.getByText('Quiz Path 2'))
    fireEvent.click(screen.getByText('Quiz Path 2'))
    await waitFor(() => screen.getByText('Quiz Lesson 2'))
    fireEvent.click(screen.getByText('Quiz Lesson 2'))
    await waitFor(() => screen.getByText('What is the CLI command?'))
    // Select the correct answer
    fireEvent.click(screen.getByText('copilot'))
    await waitFor(() => {
      expect(screen.getByText('The CLI command is copilot')).toBeInTheDocument()
      expect(screen.getByText('See Results')).toBeInTheDocument()
    })
    // Click See Results to show the score screen
    fireEvent.click(screen.getByText('See Results'))
    await waitFor(() => {
      expect(screen.getByText(/Great job!/)).toBeInTheDocument()
      expect(screen.getByText('Continue')).toBeInTheDocument()
    })
  })

  it('knowledge-check Continue calls onComplete to advance to next lesson', async () => {
    const quizPath = [{
      id: 'path-quiz3',
      name: 'Quiz Path 3',
      description: 'Quizzes',
      icon: '✅',
      unlocked: true,
      progress: { completed: 0, total: 1, percentage: 0 },
      completedLessonIds: [],
      modules: [{
        id: 'mod-quiz3',
        title: 'Quiz Module 3',
        description: 'Quizzes',
        estimatedMinutes: 10,
        prerequisites: [],
        lessons: [{
          id: 'quiz-3',
          title: 'Quiz Lesson 3',
          type: 'knowledge-check',
          estimatedMinutes: 5,
          description: 'A quiz',
          content: {
            kind: 'knowledge-check',
            introduction: 'Test knowledge',
            questions: [{
              question: 'Simple question?',
              options: [{ text: 'Yes', correct: true }],
              explanation: 'Yes is correct',
            }],
          },
        }],
      }],
    }]
    const api = setupElectronAPI({
      'learn:get-paths': quizPath,
      'learn:get-progress': PROGRESS_DATA,
      'learn:get-achievements': [],
      'learn:complete-lesson': null,
    })
    mockInvoke = api.mockInvoke
    render(<Learn />)
    await waitFor(() => screen.getByText('Quiz Path 3'))
    fireEvent.click(screen.getByText('Quiz Path 3'))
    await waitFor(() => screen.getByText('Quiz Lesson 3'))
    fireEvent.click(screen.getByText('Quiz Lesson 3'))
    await waitFor(() => screen.getByText('Simple question?'))
    fireEvent.click(screen.getByText('Yes'))
    await waitFor(() => screen.getByText('See Results'))
    fireEvent.click(screen.getByText('See Results'))
    await waitFor(() => screen.getByText('Continue'))
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('learn:complete-lesson', expect.objectContaining({ lessonId: 'quiz-3' }))
    })
  })

  it('renders lesson with completed lessons shown in path view', async () => {
    const pathWithCompleted = [{
      ...PATH_DATA[0],
      completedLessonIds: ['lesson-1'],
    }]
    const api = setupElectronAPI({
      'learn:get-paths': pathWithCompleted,
      'learn:get-progress': PROGRESS_DATA,
      'learn:get-achievements': [],
    })
    mockInvoke = api.mockInvoke
    render(<Learn />)
    await waitFor(() => screen.getByText('Getting Started'))
    fireEvent.click(screen.getByText('Getting Started'))
    await waitFor(() => {
      // Lesson 'Introduction' should show as completed (green checkmark button)
      expect(screen.getByText('Introduction')).toBeInTheDocument()
    })
  })

  it('previous button navigates to previous lesson in lesson view', async () => {
    render(<Learn />)
    await waitFor(() => screen.getByText('Getting Started'))
    fireEvent.click(screen.getByText('Getting Started'))
    await waitFor(() => screen.getByText('Advanced Topics'))
    // Open the second lesson
    fireEvent.click(screen.getByText('Advanced Topics'))
    await waitFor(() => expect(screen.getByText('Complete Lesson')).toBeInTheDocument())
    // Click Previous in the bottom nav
    fireEvent.click(screen.getByText('Previous'))
    await waitFor(() => {
      // Should advance to showing Introduction lesson
      expect(screen.getByText('Complete & Next')).toBeInTheDocument()
    })
  })
})
