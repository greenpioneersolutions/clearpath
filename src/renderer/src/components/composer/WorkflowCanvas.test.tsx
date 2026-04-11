// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import WorkflowCanvas, { createEmptyStep } from './WorkflowCanvas'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

describe('WorkflowCanvas', () => {
  const makeSteps = () => {
    const s1 = createEmptyStep()
    s1.name = 'Step 1'
    s1.prompt = 'Review the code'
    const s2 = createEmptyStep()
    s2.name = 'Step 2'
    s2.prompt = 'Write tests'
    return [s1, s2]
  }

  const defaultProps = {
    steps: makeSteps(),
    onStepsChange: vi.fn(),
    onExecute: vi.fn(),
    onSaveWorkflow: vi.fn(),
    onAddFromTemplate: vi.fn(),
    executions: [] as Array<{ stepId: string; status: string; output: string }>,
    isExecuting: false,
  }

  beforeEach(() => {
    defaultProps.onStepsChange.mockReset()
    defaultProps.onExecute.mockReset()
    defaultProps.onSaveWorkflow.mockReset()
    defaultProps.onAddFromTemplate.mockReset()
    defaultProps.steps = makeSteps()
  })

  it('renders step cards', () => {
    render(<WorkflowCanvas {...defaultProps} />)
    expect(screen.getByDisplayValue('Step 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Step 2')).toBeInTheDocument()
  })

  it('renders "+ Add Step" and "+ Add from Template" buttons', () => {
    render(<WorkflowCanvas {...defaultProps} />)
    expect(screen.getByText('+ Add Step')).toBeInTheDocument()
    expect(screen.getByText('+ Add from Template')).toBeInTheDocument()
  })

  it('calls onStepsChange when Add Step is clicked', () => {
    render(<WorkflowCanvas {...defaultProps} />)
    fireEvent.click(screen.getByText('+ Add Step'))
    expect(defaultProps.onStepsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Step 3' }),
      ]),
    )
  })

  it('calls onAddFromTemplate when template button is clicked', () => {
    render(<WorkflowCanvas {...defaultProps} />)
    fireEvent.click(screen.getByText('+ Add from Template'))
    expect(defaultProps.onAddFromTemplate).toHaveBeenCalled()
  })

  it('renders Execute Workflow button', () => {
    render(<WorkflowCanvas {...defaultProps} />)
    expect(screen.getByText('Execute Workflow')).toBeInTheDocument()
  })

  it('calls onExecute when Execute Workflow is clicked', () => {
    render(<WorkflowCanvas {...defaultProps} />)
    fireEvent.click(screen.getByText('Execute Workflow'))
    expect(defaultProps.onExecute).toHaveBeenCalledWith(defaultProps.steps)
  })

  it('disables Execute when no prompts have content', () => {
    const emptySteps = [createEmptyStep()]
    render(<WorkflowCanvas {...defaultProps} steps={emptySteps} />)
    expect(screen.getByText('Execute Workflow')).toBeDisabled()
  })

  it('renders Save as Workflow button', () => {
    render(<WorkflowCanvas {...defaultProps} />)
    expect(screen.getByText('Save as Workflow')).toBeInTheDocument()
  })

  it('calls onSaveWorkflow when Save is clicked', () => {
    render(<WorkflowCanvas {...defaultProps} />)
    fireEvent.click(screen.getByText('Save as Workflow'))
    expect(defaultProps.onSaveWorkflow).toHaveBeenCalled()
  })

  it('renders Estimate Cost button', () => {
    render(<WorkflowCanvas {...defaultProps} />)
    expect(screen.getByText('Estimate Cost')).toBeInTheDocument()
  })

  it('shows execution view when executions are present', () => {
    const executions = [
      { stepId: defaultProps.steps[0].id, status: 'completed', output: 'Done', elapsed: 2000 },
      { stepId: defaultProps.steps[1].id, status: 'running', output: '' },
    ]
    render(<WorkflowCanvas {...defaultProps} executions={executions} />)
    expect(screen.getByText('Workflow Execution')).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('shows Run Again button when execution is complete', () => {
    const executions = [
      { stepId: defaultProps.steps[0].id, status: 'completed', output: 'Done' },
    ]
    render(<WorkflowCanvas {...defaultProps} executions={executions} isExecuting={false} />)
    expect(screen.getByText('Run Again')).toBeInTheDocument()
  })

  it('hides Run Again button while executing', () => {
    const executions = [
      { stepId: defaultProps.steps[0].id, status: 'running', output: '' },
    ]
    render(<WorkflowCanvas {...defaultProps} executions={executions} isExecuting={true} />)
    expect(screen.queryByText('Run Again')).not.toBeInTheDocument()
  })
})

describe('createEmptyStep', () => {
  it('creates a step with unique id', () => {
    const s1 = createEmptyStep()
    const s2 = createEmptyStep()
    expect(s1.id).toBeTruthy()
    expect(s2.id).toBeTruthy()
    expect(s1.id).not.toBe(s2.id)
  })

  it('creates a step with default values', () => {
    const step = createEmptyStep()
    expect(step.name).toBe('')
    expect(step.prompt).toBe('')
    expect(step.executionType).toBe('session')
    expect(step.parallel).toBe(false)
    expect(step.collapsed).toBe(false)
  })
})
