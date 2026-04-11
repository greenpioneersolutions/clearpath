// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import PermissionModeSelector from './PermissionModeSelector'
import type { ClaudePermissionMode, CopilotPermissionPreset } from '../../types/tools'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PermissionModeSelector', () => {
  const defaultProps = {
    cli: 'claude' as const,
    claudeMode: 'default' as ClaudePermissionMode,
    copilotPreset: 'default' as CopilotPermissionPreset,
    onClaudeModeChange: vi.fn(),
    onCopilotPresetChange: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onClaudeModeChange = vi.fn()
    defaultProps.onCopilotPresetChange = vi.fn()
  })

  describe('Claude mode', () => {
    it('renders title and description for Claude', () => {
      render(<PermissionModeSelector {...defaultProps} cli="claude" />)
      expect(screen.getByText('Permission Mode')).toBeDefined()
      expect(screen.getByText(/Claude Code/)).toBeDefined()
    })

    it('renders all Claude permission modes', () => {
      render(<PermissionModeSelector {...defaultProps} cli="claude" />)
      expect(screen.getByText('Default')).toBeDefined()
      expect(screen.getByText('Plan')).toBeDefined()
      expect(screen.getByText('Accept Edits')).toBeDefined()
      expect(screen.getByText('Auto')).toBeDefined()
      expect(screen.getByText('Bypass All')).toBeDefined()
    })

    it('shows Active badge on current mode', () => {
      render(<PermissionModeSelector {...defaultProps} cli="claude" claudeMode="plan" />)
      // The "Plan" option should have the Active badge
      const activeElements = screen.getAllByText('Active')
      expect(activeElements.length).toBe(1)
    })

    it('calls onClaudeModeChange when mode clicked', () => {
      render(<PermissionModeSelector {...defaultProps} cli="claude" />)
      fireEvent.click(screen.getByText('Plan'))
      expect(defaultProps.onClaudeModeChange).toHaveBeenCalledWith('plan')
    })

    it('shows Caution on dangerous modes', () => {
      render(<PermissionModeSelector {...defaultProps} cli="claude" claudeMode="default" />)
      expect(screen.getByText('Caution')).toBeDefined() // Bypass All should show Caution
    })

    it('uses red styling for active dangerous mode', () => {
      render(<PermissionModeSelector {...defaultProps} cli="claude" claudeMode="bypassPermissions" />)
      const activeTag = screen.getByText('Active')
      // The active tag for dangerous mode should have red styling
      expect(activeTag.className).toContain('text-red-600')
    })

    it('shows mode descriptions', () => {
      render(<PermissionModeSelector {...defaultProps} cli="claude" />)
      expect(screen.getByText('Prompt for each tool use')).toBeDefined()
      expect(screen.getByText('Auto-approve reads, prompt for writes')).toBeDefined()
      expect(screen.getByText('Auto-approve file edits, prompt for shell commands')).toBeDefined()
    })
  })

  describe('Copilot mode', () => {
    it('renders title and description for Copilot', () => {
      render(<PermissionModeSelector {...defaultProps} cli="copilot" />)
      expect(screen.getByText('Permission Mode')).toBeDefined()
      expect(screen.getByText(/Copilot/)).toBeDefined()
    })

    it('renders all Copilot permission presets', () => {
      render(<PermissionModeSelector {...defaultProps} cli="copilot" />)
      expect(screen.getByText('Default')).toBeDefined()
      expect(screen.getByText('Allow All')).toBeDefined()
      expect(screen.getByText('Allow All Tools')).toBeDefined()
      expect(screen.getByText('YOLO')).toBeDefined()
    })

    it('calls onCopilotPresetChange when preset clicked', () => {
      render(<PermissionModeSelector {...defaultProps} cli="copilot" />)
      fireEvent.click(screen.getByText('Allow All'))
      expect(defaultProps.onCopilotPresetChange).toHaveBeenCalledWith('allow-all')
    })

    it('shows Active badge on current copilot preset', () => {
      render(<PermissionModeSelector {...defaultProps} cli="copilot" copilotPreset="yolo" />)
      const activeElements = screen.getAllByText('Active')
      expect(activeElements.length).toBe(1)
    })

    it('shows Caution on YOLO preset when not active', () => {
      render(<PermissionModeSelector {...defaultProps} cli="copilot" copilotPreset="default" />)
      expect(screen.getByText('Caution')).toBeDefined()
    })
  })
})
