// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

import AttachmentChipToolbar, { type AttachmentChip } from './AttachmentChipToolbar'

function makeChips(overrides: Partial<AttachmentChip>[] = []): AttachmentChip[] {
  const base: AttachmentChip[] = [
    { id: 'agent', label: '+ Agent', accent: 'violet' },
    { id: 'skill', label: '+ Skill', accent: 'indigo' },
    { id: 'note',  label: '+ Note',  accent: 'teal'   },
    { id: 'files', label: 'Files (soon)', accent: 'gray', disabled: true, tooltip: 'soon' },
  ]
  return base.map((b, i) => ({ ...b, ...(overrides[i] ?? {}) }))
}

describe('AttachmentChipToolbar', () => {
  it('renders one button per chip with the matching testid + label', () => {
    render(
      <AttachmentChipToolbar
        chips={makeChips()}
        openChipId={null}
        onChipClick={vi.fn()}
      />,
    )
    expect(screen.getByTestId('attachment-chip-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('attachment-chip:agent')).toHaveTextContent('+ Agent')
    expect(screen.getByTestId('attachment-chip:skill')).toHaveTextContent('+ Skill')
    expect(screen.getByTestId('attachment-chip:note')).toHaveTextContent('+ Note')
    expect(screen.getByTestId('attachment-chip:files')).toHaveTextContent('Files (soon)')
  })

  it('fires onChipClick with the chip id when an enabled chip is clicked', () => {
    const onChipClick = vi.fn()
    render(
      <AttachmentChipToolbar
        chips={makeChips()}
        openChipId={null}
        onChipClick={onChipClick}
      />,
    )
    fireEvent.click(screen.getByTestId('attachment-chip:agent'))
    expect(onChipClick).toHaveBeenCalledWith('agent')
    fireEvent.click(screen.getByTestId('attachment-chip:note'))
    expect(onChipClick).toHaveBeenLastCalledWith('note')
  })

  it('does NOT fire onChipClick when a disabled chip is clicked', () => {
    const onChipClick = vi.fn()
    render(
      <AttachmentChipToolbar
        chips={makeChips()}
        openChipId={null}
        onChipClick={onChipClick}
      />,
    )
    const filesChip = screen.getByTestId('attachment-chip:files') as HTMLButtonElement
    expect(filesChip).toBeDisabled()
    fireEvent.click(filesChip)
    expect(onChipClick).not.toHaveBeenCalled()
  })

  it('marks the chip whose id matches openChipId as aria-expanded=true', () => {
    render(
      <AttachmentChipToolbar
        chips={makeChips()}
        openChipId="skill"
        onChipClick={vi.fn()}
      />,
    )
    expect(screen.getByTestId('attachment-chip:agent')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('attachment-chip:skill')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('attachment-chip:note')).toHaveAttribute('aria-expanded', 'false')
  })

  it('disabled chips have no aria-expanded / aria-haspopup attributes', () => {
    render(
      <AttachmentChipToolbar
        chips={makeChips()}
        openChipId={null}
        onChipClick={vi.fn()}
      />,
    )
    const files = screen.getByTestId('attachment-chip:files')
    expect(files).not.toHaveAttribute('aria-expanded')
    expect(files).not.toHaveAttribute('aria-haspopup')
  })

  it('renders a count badge on chips with a positive count', () => {
    render(
      <AttachmentChipToolbar
        chips={makeChips([
          {},
          { count: 3 },
          {},
        ])}
        openChipId={null}
        onChipClick={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('attachment-chip-count:agent')).not.toBeInTheDocument()
    expect(screen.getByTestId('attachment-chip-count:skill')).toHaveTextContent('3')
  })

  it('does NOT render a count badge when count is 0 or undefined', () => {
    render(
      <AttachmentChipToolbar
        chips={makeChips([{ count: 0 }, { count: undefined }])}
        openChipId={null}
        onChipClick={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('attachment-chip-count:agent')).not.toBeInTheDocument()
    expect(screen.queryByTestId('attachment-chip-count:skill')).not.toBeInTheDocument()
  })

  it('renders the popover slot inside the chip wrapper so the popover anchors under its chip', () => {
    render(
      <AttachmentChipToolbar
        chips={makeChips([
          { popover: <div data-testid="my-popover">hi</div> },
        ])}
        openChipId="agent"
        onChipClick={vi.fn()}
      />,
    )
    const chip = screen.getByTestId('attachment-chip:agent')
    const popover = screen.getByTestId('my-popover')
    // Both should share the same relative parent — i.e. the popover is a
    // sibling of the chip inside the same wrapper div.
    expect(chip.parentElement).toBe(popover.parentElement)
  })
})
