// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import KeyboardShortcutModal from './KeyboardShortcutModal'

describe('KeyboardShortcutModal', () => {
  it('returns null when not open', () => {
    const { container } = render(<KeyboardShortcutModal isOpen={false} onClose={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders modal content when open', () => {
    render(<KeyboardShortcutModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
  })

  it('renders all shortcut groups', () => {
    render(<KeyboardShortcutModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Work Page')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
  })

  it('renders individual shortcuts', () => {
    render(<KeyboardShortcutModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Go to Home')).toBeInTheDocument()
    expect(screen.getByText('Focus message input')).toBeInTheDocument()
    expect(screen.getByText('Show this shortcut reference')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutModal isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close keyboard shortcuts'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutModal isOpen={true} onClose={onClose} />)
    // Click the outermost wrapper (backdrop)
    const backdrop = screen.getByRole('dialog').parentElement!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('has proper dialog role and aria attributes', () => {
    render(<KeyboardShortcutModal isOpen={true} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'kb-shortcut-title')
  })
})
