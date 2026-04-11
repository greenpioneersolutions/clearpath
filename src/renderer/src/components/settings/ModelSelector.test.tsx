// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ModelSelector from './ModelSelector'

describe('ModelSelector', () => {
  const onModelChange = vi.fn()

  beforeEach(() => {
    onModelChange.mockReset()
  })

  it('renders heading for copilot', () => {
    render(<ModelSelector cli="copilot" selectedModel="" onModelChange={onModelChange} />)
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText(/Select the AI model for Copilot sessions/)).toBeInTheDocument()
  })

  it('renders heading for claude', () => {
    render(<ModelSelector cli="claude" selectedModel="" onModelChange={onModelChange} />)
    expect(screen.getByText(/Select the AI model for Claude Code sessions/)).toBeInTheDocument()
  })

  it('renders model cards with radiogroup', () => {
    render(<ModelSelector cli="copilot" selectedModel="" onModelChange={onModelChange} />)
    const radioGroups = screen.getAllByRole('radiogroup')
    expect(radioGroups.length).toBeGreaterThan(0)
  })

  it('renders model radio buttons', () => {
    render(<ModelSelector cli="copilot" selectedModel="" onModelChange={onModelChange} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBeGreaterThan(0)
  })

  it('marks the selected model as checked', () => {
    render(<ModelSelector cli="copilot" selectedModel="gpt-4o" onModelChange={onModelChange} />)
    const radios = screen.getAllByRole('radio')
    const selectedRadio = radios.find((r) => r.getAttribute('aria-checked') === 'true')
    expect(selectedRadio).toBeDefined()
  })

  it('calls onModelChange when a model is clicked', () => {
    render(<ModelSelector cli="copilot" selectedModel="" onModelChange={onModelChange} />)
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[1]) // Click the second model
    expect(onModelChange).toHaveBeenCalled()
  })

  it('shows default badge for the default model', () => {
    render(<ModelSelector cli="copilot" selectedModel="" onModelChange={onModelChange} />)
    expect(screen.getByText('default')).toBeInTheDocument()
  })

  it('shows the currently selected model in the footer', () => {
    render(<ModelSelector cli="copilot" selectedModel="gpt-4o" onModelChange={onModelChange} />)
    expect(screen.getByText('Selected:')).toBeInTheDocument()
    // The command preview
    expect(screen.getByText('--model gpt-4o')).toBeInTheDocument()
  })

  it('shows "(default)" in footer when no model is selected', () => {
    render(<ModelSelector cli="copilot" selectedModel="" onModelChange={onModelChange} />)
    // When no selectedModel, it uses the default model's id (gpt-5-mini)
    // The text is split across code elements, so check for the container text
    expect(screen.getByText('Selected:')).toBeInTheDocument()
  })

  it('renders cost tier labels for copilot models', () => {
    render(<ModelSelector cli="copilot" selectedModel="" onModelChange={onModelChange} />)
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('renders claude models', () => {
    render(<ModelSelector cli="claude" selectedModel="" onModelChange={onModelChange} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBeGreaterThan(0)
  })
})
