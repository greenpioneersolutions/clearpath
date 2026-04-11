// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AuthStatusCard } from './AuthStatusCard'

describe('AuthStatusCard', () => {
  const baseProps = {
    cli: 'copilot' as const,
    status: null,
    loading: false,
    onConnect: vi.fn(),
    onRefresh: vi.fn(),
  }

  beforeEach(() => {
    baseProps.onConnect.mockReset()
    baseProps.onRefresh.mockReset()
  })

  it('renders the CLI label for copilot', () => {
    render(<AuthStatusCard {...baseProps} />)
    expect(screen.getByText('GitHub Copilot CLI')).toBeInTheDocument()
  })

  it('renders the CLI label for claude', () => {
    render(<AuthStatusCard {...baseProps} cli="claude" />)
    expect(screen.getByText('Claude Code CLI')).toBeInTheDocument()
  })

  it('shows Not Installed when status is null', () => {
    render(<AuthStatusCard {...baseProps} />)
    expect(screen.getByText('Not Installed')).toBeInTheDocument()
  })

  it('shows Connected when authenticated', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: true, authenticated: true }}
      />,
    )
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('shows Connect button when installed but not authenticated', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: true, authenticated: false }}
      />,
    )
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  it('calls onConnect when Connect button is clicked', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: true, authenticated: false }}
      />,
    )
    fireEvent.click(screen.getByText('Connect'))
    expect(baseProps.onConnect).toHaveBeenCalledOnce()
  })

  it('calls onRefresh when refresh button is clicked', () => {
    render(<AuthStatusCard {...baseProps} />)
    fireEvent.click(screen.getByTitle('Re-check status'))
    expect(baseProps.onRefresh).toHaveBeenCalledOnce()
  })

  it('shows install hint when not installed', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: false, authenticated: false }}
      />,
    )
    expect(screen.getByText('npm install -g @github/copilot')).toBeInTheDocument()
  })

  it('shows claude install hint', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        cli="claude"
        status={{ installed: false, authenticated: false }}
      />,
    )
    expect(screen.getByText('npm install -g @anthropic-ai/claude-code')).toBeInTheDocument()
  })

  it('shows Checking when loading', () => {
    render(<AuthStatusCard {...baseProps} loading={true} />)
    const checkingElements = screen.getAllByText(/Checking/)
    expect(checkingElements.length).toBeGreaterThan(0)
  })

  it('shows version when available', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: true, authenticated: true, version: '1.2.3' }}
      />,
    )
    expect(screen.getByText('1.2.3')).toBeInTheDocument()
  })
})
