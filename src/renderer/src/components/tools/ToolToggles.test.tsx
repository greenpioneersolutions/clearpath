// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import ToolToggles from './ToolToggles'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ToolToggles', () => {
  const defaultProps = {
    cli: 'claude' as const,
    allowedTools: [] as string[],
    disallowedTools: [] as string[],
    deniedTools: [] as string[],
    availableTools: [] as string[],
    excludedTools: [] as string[],
    onAllowedChange: vi.fn(),
    onDisallowedChange: vi.fn(),
    onDeniedChange: vi.fn(),
    onAvailableChange: vi.fn(),
    onExcludedChange: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onAllowedChange = vi.fn()
    defaultProps.onDisallowedChange = vi.fn()
    defaultProps.onDeniedChange = vi.fn()
    defaultProps.onAvailableChange = vi.fn()
    defaultProps.onExcludedChange = vi.fn()
  })

  describe('Claude mode', () => {
    it('renders title and description for Claude', () => {
      render(<ToolToggles {...defaultProps} cli="claude" />)
      expect(screen.getByText('Tool Permissions')).toBeDefined()
      expect(screen.getByText(/Claude Code/)).toBeDefined()
    })

    it('shows Allowed Tools and Disallowed Tools sections', () => {
      render(<ToolToggles {...defaultProps} cli="claude" />)
      expect(screen.getByText('Allowed Tools')).toBeDefined()
      expect(screen.getByText('Disallowed Tools')).toBeDefined()
    })

    it('does not show Copilot-specific sections', () => {
      render(<ToolToggles {...defaultProps} cli="claude" />)
      expect(screen.queryByText('Denied Tools')).toBeNull()
      expect(screen.queryByText('Available Tools')).toBeNull()
      expect(screen.queryByText('Excluded Tools')).toBeNull()
    })

    it('renders existing allowed tools as tags', () => {
      render(<ToolToggles {...defaultProps} cli="claude" allowedTools={['Read', 'Write']} />)
      expect(screen.getByText('Read')).toBeDefined()
      expect(screen.getByText('Write')).toBeDefined()
    })

    it('adds tool when typed and Add clicked', () => {
      render(<ToolToggles {...defaultProps} cli="claude" />)

      // Find the input for Allowed Tools
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[0], { target: { value: 'Bash' } })

      const addButtons = screen.getAllByText('Add')
      fireEvent.click(addButtons[0])

      expect(defaultProps.onAllowedChange).toHaveBeenCalledWith(['Bash'])
    })

    it('adds tool on Enter key', () => {
      render(<ToolToggles {...defaultProps} cli="claude" />)

      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[0], { target: { value: 'Grep' } })
      fireEvent.keyDown(inputs[0], { key: 'Enter' })

      expect(defaultProps.onAllowedChange).toHaveBeenCalledWith(['Grep'])
    })

    it('removes tool when x clicked', () => {
      render(<ToolToggles {...defaultProps} cli="claude" allowedTools={['Read', 'Write', 'Bash']} />)

      // Each tool tag has an "x" button
      const removeButtons = screen.getAllByTitle('Remove')
      fireEvent.click(removeButtons[0]) // Remove first tool

      expect(defaultProps.onAllowedChange).toHaveBeenCalledWith(['Write', 'Bash'])
    })

    it('does not add duplicate tool', () => {
      render(<ToolToggles {...defaultProps} cli="claude" allowedTools={['Read']} />)

      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[0], { target: { value: 'Read' } })
      const addButtons = screen.getAllByText('Add')
      fireEvent.click(addButtons[0])

      // Should not have been called since 'Read' already exists
      expect(defaultProps.onAllowedChange).not.toHaveBeenCalled()
    })

    it('does not add empty tool', () => {
      render(<ToolToggles {...defaultProps} cli="claude" />)

      const addButtons = screen.getAllByText('Add')
      fireEvent.click(addButtons[0])

      expect(defaultProps.onAllowedChange).not.toHaveBeenCalled()
    })

    it('shows "None configured" when tools list empty', () => {
      render(<ToolToggles {...defaultProps} cli="claude" />)
      const noneTexts = screen.getAllByText('None configured')
      expect(noneTexts.length).toBeGreaterThan(0)
    })

    it('calls onDisallowedChange for disallowed tools', () => {
      render(<ToolToggles {...defaultProps} cli="claude" />)

      const inputs = screen.getAllByRole('textbox')
      // Second input is for Disallowed Tools
      fireEvent.change(inputs[1], { target: { value: 'Bash' } })
      const addButtons = screen.getAllByText('Add')
      fireEvent.click(addButtons[1])

      expect(defaultProps.onDisallowedChange).toHaveBeenCalledWith(['Bash'])
    })
  })

  describe('Copilot mode', () => {
    it('renders title and description for Copilot', () => {
      render(<ToolToggles {...defaultProps} cli="copilot" />)
      expect(screen.getByText('Tool Permissions')).toBeDefined()
      expect(screen.getByText(/Copilot/)).toBeDefined()
    })

    it('shows Copilot-specific sections', () => {
      render(<ToolToggles {...defaultProps} cli="copilot" />)
      expect(screen.getByText('Allowed Tools')).toBeDefined()
      expect(screen.getByText('Denied Tools')).toBeDefined()
      expect(screen.getByText('Available Tools')).toBeDefined()
      expect(screen.getByText('Excluded Tools')).toBeDefined()
    })

    it('does not show Claude-specific Disallowed Tools', () => {
      render(<ToolToggles {...defaultProps} cli="copilot" />)
      expect(screen.queryByText('Disallowed Tools')).toBeNull()
    })

    it('calls onDeniedChange for denied tools', () => {
      render(<ToolToggles {...defaultProps} cli="copilot" />)

      const inputs = screen.getAllByRole('textbox')
      // Second input is for Denied Tools in copilot mode
      fireEvent.change(inputs[1], { target: { value: 'shell(rm:*)' } })
      const addButtons = screen.getAllByText('Add')
      fireEvent.click(addButtons[1])

      expect(defaultProps.onDeniedChange).toHaveBeenCalledWith(['shell(rm:*)'])
    })

    it('renders tool tags with correct colors for each section', () => {
      render(
        <ToolToggles
          {...defaultProps}
          cli="copilot"
          allowedTools={['shell(git:*)']}
          deniedTools={['shell(rm:*)']}
          availableTools={['shell']}
          excludedTools={['browser']}
        />,
      )

      expect(screen.getByText('shell(git:*)')).toBeDefined()
      expect(screen.getByText('shell(rm:*)')).toBeDefined()
      expect(screen.getByText('shell')).toBeDefined()
      expect(screen.getByText('browser')).toBeDefined()
    })

    it('shows correct placeholder text for Copilot allowed tools', () => {
      render(<ToolToggles {...defaultProps} cli="copilot" />)
      expect(screen.getByPlaceholderText('e.g. shell(git:*), MyMCP(create_issue)')).toBeDefined()
    })
  })
})
