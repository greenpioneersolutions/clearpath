// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import GuidedTasks from './GuidedTasks'

describe('GuidedTasks', () => {
  const onComplete = vi.fn()

  beforeEach(() => {
    onComplete.mockReset()
  })

  it('renders task list heading', () => {
    render(<GuidedTasks completedTaskIds={[]} onComplete={onComplete} />)
    expect(screen.getByText('Guided Tasks')).toBeInTheDocument()
  })

  it('renders all 5 guided tasks', () => {
    render(<GuidedTasks completedTaskIds={[]} onComplete={onComplete} />)
    expect(screen.getByText('Review a PR')).toBeInTheDocument()
    expect(screen.getByText('Fix a Failing Test')).toBeInTheDocument()
    expect(screen.getByText('Create a New Feature')).toBeInTheDocument()
    expect(screen.getByText('Run a Security Audit')).toBeInTheDocument()
    expect(screen.getByText('Generate Documentation')).toBeInTheDocument()
  })

  it('navigates into a task when clicked', () => {
    render(<GuidedTasks completedTaskIds={[]} onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Review a PR'))
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
    expect(screen.getByText('Start a new session')).toBeInTheDocument()
  })

  it('navigates through task steps', () => {
    render(<GuidedTasks completedTaskIds={[]} onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Review a PR'))
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Next Step'))
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Next Step'))
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Next Step'))
    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument()
  })

  it('shows Mark Complete on last step and calls onComplete', () => {
    render(<GuidedTasks completedTaskIds={[]} onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Review a PR'))
    // Navigate to last step
    fireEvent.click(screen.getByText('Next Step'))
    fireEvent.click(screen.getByText('Next Step'))
    fireEvent.click(screen.getByText('Next Step'))

    const completeBtn = screen.getByText('Mark Complete')
    expect(completeBtn).toBeInTheDocument()
    fireEvent.click(completeBtn)
    expect(onComplete).toHaveBeenCalledWith('review-pr')
  })

  it('shows Back to tasks button and returns to list', () => {
    render(<GuidedTasks completedTaskIds={[]} onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Review a PR'))
    const backBtn = screen.getByText(/Back to tasks/)
    fireEvent.click(backBtn)
    expect(screen.getByText('Guided Tasks')).toBeInTheDocument()
  })

  it('shows Previous button on non-first steps', () => {
    render(<GuidedTasks completedTaskIds={[]} onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Review a PR'))
    // First step has no Previous
    expect(screen.queryByText('Previous')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Next Step'))
    expect(screen.getByText('Previous')).toBeInTheDocument()
  })

  it('shows completed task with checkmark styling', () => {
    render(<GuidedTasks completedTaskIds={['review-pr']} onComplete={onComplete} />)
    // The Review a PR task should have green background class
    const taskButton = screen.getByText('Review a PR').closest('button')!
    expect(taskButton.className).toContain('border-green-200')
  })
})
