// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

beforeEach(() => {
  const api = setupElectronAPI({
    'learn:get-paths': [
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
            ],
          },
        ],
      },
    ],
    'learn:get-progress': {
      completed: 1,
      total: 4,
      percentage: 25,
      streak: { lastDate: '2026-04-10', count: 1 },
      totalTimeMinutes: 10,
      selectedPath: null,
      nextLesson: null,
      dismissed: false,
    },
    'learn:get-achievements': [],
  })
  mockInvoke = api.mockInvoke
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
})
