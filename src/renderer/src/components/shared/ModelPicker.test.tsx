// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ModelPicker from './ModelPicker'

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

describe('ModelPicker', () => {
  it('renders a select element for copilot backend', () => {
    render(<ModelPicker currentBackend="copilot" currentModel="" onChange={vi.fn()} />)
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()
  })

  it('renders copilot models by default', () => {
    render(<ModelPicker currentModel="" onChange={vi.fn()} />)
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()
    // Should have copilot model options
    expect(select.querySelectorAll('option').length).toBeGreaterThan(1)
  })

  it('renders claude models when backend is claude', () => {
    render(<ModelPicker currentBackend="claude" currentModel="" onChange={vi.fn()} />)
    const select = screen.getByRole('combobox')
    // Should contain Sonnet (default claude model)
    const options = Array.from(select.querySelectorAll('option'))
    const labels = options.map((o) => o.textContent)
    expect(labels.some((l) => l?.includes('Sonnet'))).toBe(true)
  })

  it('calls onChange when a model is selected', () => {
    const onChange = vi.fn()
    render(<ModelPicker currentBackend="claude" currentModel="" onChange={onChange} />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'opus' } })
    expect(onChange).toHaveBeenCalledWith('opus')
  })

  it('shows "Use Default" option when allowInherit is true', () => {
    render(<ModelPicker currentBackend="copilot" currentModel="" onChange={vi.fn()} allowInherit />)
    const select = screen.getByRole('combobox')
    const options = Array.from(select.querySelectorAll('option'))
    expect(options[0].textContent).toBe('Use Default')
  })

  it('shows "Select model..." option when allowInherit is false and no model selected', () => {
    render(<ModelPicker currentBackend="copilot" currentModel="" onChange={vi.fn()} />)
    const select = screen.getByRole('combobox')
    const options = Array.from(select.querySelectorAll('option'))
    expect(options[0].textContent).toBe('Select model...')
  })

  it('renders in compact size by default', () => {
    render(<ModelPicker currentModel="" onChange={vi.fn()} />)
    const select = screen.getByRole('combobox')
    expect(select.className).toContain('text-xs')
  })

  it('renders in full size when specified', () => {
    render(<ModelPicker currentModel="" onChange={vi.fn()} size="full" />)
    const select = screen.getByRole('combobox')
    expect(select.className).toContain('text-sm')
    expect(select.className).toContain('w-full')
  })
})
