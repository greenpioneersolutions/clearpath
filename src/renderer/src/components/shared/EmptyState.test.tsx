// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import EmptyState from './EmptyState'

describe('EmptyState', () => {
  it('renders icon, title, and description', () => {
    render(<EmptyState icon="🚀" title="No Items" description="Nothing to show here" />)
    expect(screen.getByText('🚀')).toBeInTheDocument()
    expect(screen.getByText('No Items')).toBeInTheDocument()
    expect(screen.getByText('Nothing to show here')).toBeInTheDocument()
  })

  it('renders primary action button and handles click', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        icon="📦"
        title="Empty"
        description="No data"
        primaryAction={{ label: 'Create', onClick }}
      />,
    )
    const btn = screen.getByText('Create')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders secondary action button and handles click', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        icon="📦"
        title="Empty"
        description="No data"
        secondaryAction={{ label: 'Learn More', onClick }}
      />,
    )
    const btn = screen.getByText('Learn More')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not render action buttons when not provided', () => {
    render(<EmptyState icon="🔍" title="Search" description="No results" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
