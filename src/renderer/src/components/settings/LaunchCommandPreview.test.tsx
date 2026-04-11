// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import LaunchCommandPreview from './LaunchCommandPreview'
import type { AppSettings } from '../../types/settings'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())

  // Mock navigator.clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  })
})

const baseSettings: AppSettings = {
  flags: {},
  model: { copilot: '', claude: '' },
  maxBudgetUsd: null,
  maxTurns: null,
  verbose: false,
  envVars: {},
}

describe('LaunchCommandPreview', () => {
  it('renders the copilot base command with no flags', () => {
    render(<LaunchCommandPreview cli="copilot" settings={baseSettings} />)
    expect(screen.getByText('Launch Command Preview')).toBeInTheDocument()
    expect(screen.getByText(/copilot/)).toBeInTheDocument()
    expect(screen.getByText(/no flags configured/)).toBeInTheDocument()
  })

  it('renders the claude base command with no flags', () => {
    render(<LaunchCommandPreview cli="claude" settings={baseSettings} />)
    expect(screen.getByText(/claude/)).toBeInTheDocument()
  })

  it('includes --model when model is set', () => {
    const settings = { ...baseSettings, model: { copilot: 'gpt-4o', claude: '' } }
    render(<LaunchCommandPreview cli="copilot" settings={settings} />)
    expect(screen.getByText(/--model gpt-4o/)).toBeInTheDocument()
  })

  it('includes --max-budget-usd when budget is set', () => {
    const settings = { ...baseSettings, maxBudgetUsd: 10 }
    render(<LaunchCommandPreview cli="claude" settings={settings} />)
    expect(screen.getByText(/--max-budget-usd 10/)).toBeInTheDocument()
  })

  it('includes --max-turns when turns is set', () => {
    const settings = { ...baseSettings, maxTurns: 50 }
    render(<LaunchCommandPreview cli="claude" settings={settings} />)
    expect(screen.getByText(/--max-turns 50/)).toBeInTheDocument()
  })

  it('includes --verbose when verbose is true', () => {
    const settings = { ...baseSettings, verbose: true }
    render(<LaunchCommandPreview cli="claude" settings={settings} />)
    expect(screen.getByText(/--verbose/)).toBeInTheDocument()
  })

  it('includes boolean flags that are set', () => {
    const settings = { ...baseSettings, flags: { 'copilot:experimental': true } }
    render(<LaunchCommandPreview cli="copilot" settings={settings} />)
    expect(screen.getByText(/--experimental/)).toBeInTheDocument()
  })

  it('copies command to clipboard when Copy is clicked', () => {
    render(<LaunchCommandPreview cli="copilot" settings={baseSettings} />)
    fireEvent.click(screen.getByText('Copy'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copilot')
  })

  it('calls electronAPI.invoke to open terminal when Run in Terminal is clicked', () => {
    render(<LaunchCommandPreview cli="copilot" settings={baseSettings} />)
    fireEvent.click(screen.getByText('Run in Terminal'))
    expect(mockInvoke).toHaveBeenCalledWith('settings:open-terminal', { command: 'copilot' })
  })

  it('renders Copy and Run in Terminal buttons', () => {
    render(<LaunchCommandPreview cli="copilot" settings={baseSettings} />)
    expect(screen.getByLabelText('Copy command to clipboard')).toBeInTheDocument()
    expect(screen.getByLabelText('Run command in terminal')).toBeInTheDocument()
  })
})
