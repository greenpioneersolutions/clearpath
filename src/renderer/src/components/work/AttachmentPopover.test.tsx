// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

import AttachmentPopover from './AttachmentPopover'

/**
 * Test harness: a parent that wires up an anchor button + popover the way
 * QuickStartCard does. The popover is open whenever `open` is true; the
 * harness exposes the toggle so each test can assert open/close transitions.
 */
function Harness({
  initialOpen,
  title,
}: {
  initialOpen?: boolean
  title?: string
} = {}): JSX.Element {
  const [open, setOpen] = useState(initialOpen ?? false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button
        ref={anchorRef}
        type="button"
        data-testid="harness-anchor"
        onClick={() => setOpen((v) => !v)}
      >
        Anchor
      </button>
      <input data-testid="harness-outside" />
      <div style={{ position: 'relative' }}>
        <AttachmentPopover
          open={open}
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
          title={title}
          id="harness-popover"
        >
          <button type="button" data-testid="harness-inner">inner</button>
          <input type="text" data-testid="harness-inner-input" />
        </AttachmentPopover>
      </div>
    </div>
  )
}

describe('AttachmentPopover', () => {
  it('does not render when open is false', () => {
    render(<Harness initialOpen={false} />)
    expect(screen.queryByTestId('attachment-popover')).not.toBeInTheDocument()
  })

  it('renders the popover and its children when open', () => {
    render(<Harness initialOpen title="Pick something" />)
    const pop = screen.getByTestId('attachment-popover')
    expect(pop).toBeInTheDocument()
    expect(pop).toHaveAttribute('role', 'dialog')
    expect(pop).toHaveAttribute('aria-label', 'Pick something')
    expect(screen.getByTestId('harness-inner')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<Harness initialOpen />)
    expect(screen.getByTestId('attachment-popover')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByTestId('attachment-popover')).not.toBeInTheDocument()
    })
  })

  it('closes on mousedown outside the popover and outside the anchor', async () => {
    render(<Harness initialOpen />)
    expect(screen.getByTestId('attachment-popover')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('harness-outside'))
    await waitFor(() => {
      expect(screen.queryByTestId('attachment-popover')).not.toBeInTheDocument()
    })
  })

  it('does NOT close when mousedown is inside the popover body', async () => {
    render(<Harness initialOpen />)
    expect(screen.getByTestId('attachment-popover')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('harness-inner'))
    // Allow microtasks to run — the popover should still be there.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByTestId('attachment-popover')).toBeInTheDocument()
  })

  it('does NOT close when mousedown is on the anchor (toolbar owns that toggle)', async () => {
    render(<Harness initialOpen />)
    expect(screen.getByTestId('attachment-popover')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('harness-anchor'))
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByTestId('attachment-popover')).toBeInTheDocument()
  })

  it('focus-traps inside the popover when opened', async () => {
    render(<Harness initialOpen />)
    // useFocusTrap moves focus to the first focusable child on mount.
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('harness-inner'))
    })
  })

  it('renders the explicit close button which calls onClose when title is provided', async () => {
    render(<Harness initialOpen title="Pick something" />)
    expect(screen.getByTestId('attachment-popover')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Close'))
    await waitFor(() => {
      expect(screen.queryByTestId('attachment-popover')).not.toBeInTheDocument()
    })
  })

  it('forwards the id prop to the dialog so chip aria-controls resolves', () => {
    render(<Harness initialOpen />)
    expect(screen.getByTestId('attachment-popover')).toHaveAttribute('id', 'harness-popover')
  })
})
