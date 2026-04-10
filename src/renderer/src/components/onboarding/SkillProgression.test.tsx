// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import SkillProgression from './SkillProgression'

describe('SkillProgression', () => {
  const defaultProps = {
    featureUsage: { basicPrompts: true, slashCommands: true, sessionResume: false },
    currentLevel: 'beginner' as const,
    progress: 2,
    total: 12,
  }

  it('renders heading and description', () => {
    render(<SkillProgression {...defaultProps} />)
    expect(screen.getByText('Skill Progression')).toBeInTheDocument()
    expect(screen.getByText(/Track which features/)).toBeInTheDocument()
  })

  it('displays current level badge', () => {
    render(<SkillProgression {...defaultProps} />)
    // "Beginner" appears as badge label and in the level markers section
    expect(screen.getAllByText('Beginner').length).toBeGreaterThanOrEqual(1)
  })

  it('displays progress fraction', () => {
    render(<SkillProgression {...defaultProps} />)
    expect(screen.getByText('2 / 12 features explored')).toBeInTheDocument()
  })

  it('shows percentage', () => {
    render(<SkillProgression {...defaultProps} />)
    expect(screen.getByText('17%')).toBeInTheDocument()
  })

  it('renders all level section headings', () => {
    render(<SkillProgression {...defaultProps} />)
    // Level headings use CSS uppercase, but DOM text is title-case
    // Each level label appears as both a heading and a progress bar marker
    const beginners = screen.getAllByText('Beginner')
    expect(beginners.length).toBeGreaterThanOrEqual(2)
    const intermediates = screen.getAllByText('Intermediate')
    expect(intermediates.length).toBeGreaterThanOrEqual(2)
    const advanceds = screen.getAllByText('Advanced')
    expect(advanceds.length).toBeGreaterThanOrEqual(2)
    const experts = screen.getAllByText('Expert')
    expect(experts.length).toBeGreaterThanOrEqual(2)
  })

  it('renders feature items', () => {
    render(<SkillProgression {...defaultProps} />)
    expect(screen.getByText('Send Prompts')).toBeInTheDocument()
    expect(screen.getByText('Slash Commands')).toBeInTheDocument()
    expect(screen.getByText('Toggle Agents')).toBeInTheDocument()
  })

  it('marks used features as complete with green background', () => {
    render(<SkillProgression {...defaultProps} />)
    const sendPromptsItem = screen.getByText('Send Prompts').closest('.rounded-lg')
    expect(sendPromptsItem?.className).toContain('bg-green-50')
  })

  it('shows higher level when specified', () => {
    render(<SkillProgression {...defaultProps} currentLevel="advanced" progress={8} />)
    // "Advanced" appears in the badge and in the level markers — use getAllByText
    expect(screen.getAllByText('Advanced').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('8 / 12 features explored')).toBeInTheDocument()
  })
})
