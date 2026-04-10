// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import StepCard, { type WorkflowStep } from './StepCard'

describe('StepCard', () => {
  const mockStep: WorkflowStep = {
    id: 'step-1',
    name: 'Review Code',
    prompt: 'Review the auth module',
    executionType: 'session',
    parallel: false,
    collapsed: false,
  }

  const defaultProps = {
    step: mockStep,
    index: 0,
    isFirst: true,
    onChange: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onInsertTemplate: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDragEnd: vi.fn(),
  }

  beforeEach(() => {
    Object.values(defaultProps).forEach((fn) => {
      if (typeof fn === 'function') (fn as ReturnType<typeof vi.fn>).mockReset?.()
    })
  })

  it('renders step number and name', () => {
    render(<StepCard {...defaultProps} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Review Code')).toBeInTheDocument()
  })

  it('renders prompt textarea', () => {
    render(<StepCard {...defaultProps} />)
    expect(screen.getByDisplayValue('Review the auth module')).toBeInTheDocument()
  })

  it('shows execution type badge', () => {
    render(<StepCard {...defaultProps} />)
    // "In Session" appears as both badge and button
    const elements = screen.getAllByText('In Session')
    expect(elements.length).toBeGreaterThanOrEqual(2) // badge + execution type button
  })

  it('calls onChange when name is edited', () => {
    render(<StepCard {...defaultProps} />)
    fireEvent.change(screen.getByDisplayValue('Review Code'), { target: { value: 'New Name' } })
    expect(defaultProps.onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' }))
  })

  it('calls onChange when prompt is edited', () => {
    render(<StepCard {...defaultProps} />)
    fireEvent.change(screen.getByDisplayValue('Review the auth module'), { target: { value: 'New prompt' } })
    expect(defaultProps.onChange).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'New prompt' }))
  })

  it('calls onDuplicate when duplicate button is clicked', () => {
    render(<StepCard {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Duplicate'))
    expect(defaultProps.onDuplicate).toHaveBeenCalled()
  })

  it('shows confirm step before delete', () => {
    render(<StepCard {...defaultProps} />)
    // First click shows confirmation
    fireEvent.click(screen.getByTitle('Delete'))
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls onDelete on confirmed delete', () => {
    render(<StepCard {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Delete'))
    fireEvent.click(screen.getByText('Delete'))
    expect(defaultProps.onDelete).toHaveBeenCalled()
  })

  it('cancels delete on Cancel click', () => {
    render(<StepCard {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Delete'))
    fireEvent.click(screen.getByText('Cancel'))
    // Confirm UI is gone, delete wasn't called
    expect(defaultProps.onDelete).not.toHaveBeenCalled()
  })

  it('changes execution type when buttons are clicked', () => {
    render(<StepCard {...defaultProps} />)
    fireEvent.click(screen.getByText('Sub-Agent'))
    expect(defaultProps.onChange).toHaveBeenCalledWith(expect.objectContaining({ executionType: 'sub-agent' }))
  })

  it('calls onInsertTemplate when "From Template" is clicked', () => {
    render(<StepCard {...defaultProps} />)
    fireEvent.click(screen.getByText('From Template'))
    expect(defaultProps.onInsertTemplate).toHaveBeenCalled()
  })

  it('does not show parallel/sequential connector for first step', () => {
    render(<StepCard {...defaultProps} isFirst={true} />)
    expect(screen.queryByText('Sequential')).not.toBeInTheDocument()
    expect(screen.queryByText('Parallel')).not.toBeInTheDocument()
  })

  it('shows sequential connector for non-first step', () => {
    render(<StepCard {...defaultProps} isFirst={false} index={1} />)
    expect(screen.getByText('Sequential')).toBeInTheDocument()
  })

  it('toggles parallel/sequential when connector is clicked', () => {
    render(<StepCard {...defaultProps} isFirst={false} index={1} />)
    fireEvent.click(screen.getByText('Sequential'))
    expect(defaultProps.onChange).toHaveBeenCalledWith(expect.objectContaining({ parallel: true }))
  })

  it('hides body when collapsed', () => {
    render(<StepCard {...defaultProps} step={{ ...mockStep, collapsed: true }} />)
    expect(screen.queryByDisplayValue('Review the auth module')).not.toBeInTheDocument()
  })

  it('shows configure panel when Configure is clicked', () => {
    render(<StepCard {...defaultProps} />)
    fireEvent.click(screen.getByText('Configure'))
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('Working Dir')).toBeInTheDocument()
    expect(screen.getByText('Permission Mode')).toBeInTheDocument()
  })

  it('shows agent badge when step has agent', () => {
    render(<StepCard {...defaultProps} step={{ ...mockStep, agent: 'review-agent' }} />)
    expect(screen.getByText('review-agent')).toBeInTheDocument()
  })
})
