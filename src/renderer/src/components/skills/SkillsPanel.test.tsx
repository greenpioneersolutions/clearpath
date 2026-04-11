// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import SkillsPanel from './SkillsPanel'

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

describe('SkillsPanel', () => {
  const mockSkills = [
    {
      id: 's1', name: 'Code Review', description: 'Reviews code for issues',
      scope: 'project', cli: 'claude', path: '/proj/.claude/skills/review/SKILL.md',
      dirPath: '/proj/.claude/skills/review', enabled: true, autoInvoke: false,
      modifiedAt: Date.now(),
    },
    {
      id: 's2', name: 'Security Audit', description: 'Checks for security vulnerabilities',
      scope: 'global', cli: 'copilot', path: '~/.copilot/skills/security/SKILL.md',
      dirPath: '~/.copilot/skills/security', enabled: false, autoInvoke: true,
      autoInvokeTrigger: '*.ts', modifiedAt: Date.now(),
    },
  ]

  const defaultProps = {
    onInsertCommand: vi.fn(),
    onCreateSkill: vi.fn(),
    onManageSkills: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onInsertCommand.mockReset()
    defaultProps.onCreateSkill.mockReset()
    defaultProps.onManageSkills.mockReset()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'app:get-cwd') return Promise.resolve('/project')
      if (channel === 'skills:list') return Promise.resolve(mockSkills)
      if (channel === 'skills:toggle') return Promise.resolve({ success: true })
      if (channel === 'skills:record-usage') return Promise.resolve(undefined)
      if (channel === 'skills:export') return Promise.resolve({ success: true })
      return Promise.resolve(undefined)
    })
  })

  it('renders search input', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search skills...')).toBeInTheDocument()
    })
  })

  it('renders skill cards after loading', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument()
      expect(screen.getByText('Security Audit')).toBeInTheDocument()
    })
  })

  it('shows skill descriptions', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Reviews code for issues')).toBeInTheDocument()
      expect(screen.getByText('Checks for security vulnerabilities')).toBeInTheDocument()
    })
  })

  it('shows scope badges', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('project')).toBeInTheDocument()
      expect(screen.getByText('global')).toBeInTheDocument()
    })
  })

  it('shows auto-invoke indicator for auto-invoke skills', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      // The lightning bolt emoji for auto-invoke
      const autoInvokeIndicator = screen.getByTitle('*.ts')
      expect(autoInvokeIndicator).toBeInTheDocument()
    })
  })

  it('shows Use button for each skill', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      const useButtons = screen.getAllByText('Use')
      expect(useButtons).toHaveLength(2)
    })
  })

  it('calls onInsertCommand with slug when Use is clicked', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument()
    })

    const useButtons = screen.getAllByText('Use')
    fireEvent.click(useButtons[0])
    expect(defaultProps.onInsertCommand).toHaveBeenCalledWith('/code-review')
  })

  it('toggles skill enabled state', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument()
    })

    // Toggle buttons are <button> elements with rounded-full class (styled as switches)
    const allButtons = screen.getAllByRole('button')
    const toggleButtons = allButtons.filter(
      (btn) => btn.classList.contains('rounded-full') && btn.classList.contains('inline-flex'),
    )
    // Click the first toggle (Code Review, which is enabled -> will toggle to disabled)
    expect(toggleButtons.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(toggleButtons[0])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('skills:toggle', expect.objectContaining({
        enabled: false,
      }))
    })
  })

  it('shows "+ Create Skill" button', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('+ Create Skill')).toBeInTheDocument()
    })
  })

  it('calls onCreateSkill when Create button is clicked', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('+ Create Skill')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('+ Create Skill'))
    expect(defaultProps.onCreateSkill).toHaveBeenCalled()
  })

  it('calls onManageSkills when Manage is clicked', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Manage')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Manage'))
    expect(defaultProps.onManageSkills).toHaveBeenCalled()
  })

  it('filters skills by search', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Search skills...'), {
      target: { value: 'security' },
    })

    expect(screen.queryByText('Code Review')).not.toBeInTheDocument()
    expect(screen.getByText('Security Audit')).toBeInTheDocument()
  })

  it('shows empty state when no skills exist', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'app:get-cwd') return Promise.resolve('/project')
      if (channel === 'skills:list') return Promise.resolve([])
      return Promise.resolve(undefined)
    })

    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('No skills installed')).toBeInTheDocument()
    })
  })

  it('shows "No skills match" when search has no results', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Search skills...'), {
      target: { value: 'nonexistent' },
    })

    expect(screen.getByText('No skills match your search')).toBeInTheDocument()
  })

  it('shows Export button when skills exist', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument()
    })
  })

  it('dims disabled skills', async () => {
    render(<SkillsPanel {...defaultProps} />)
    await waitFor(() => {
      const securityCard = screen.getByText('Security Audit').closest('div[class*="border"]')!
      expect(securityCard.className).toContain('opacity-50')
    })
  })
})
