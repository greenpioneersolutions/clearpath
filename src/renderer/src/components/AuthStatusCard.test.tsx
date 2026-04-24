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
    onInstall: vi.fn(),
    onRefresh: vi.fn(),
  }

  beforeEach(() => {
    baseProps.onConnect.mockReset()
    baseProps.onInstall.mockReset()
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

  it('shows Install Now when status is null', () => {
    render(<AuthStatusCard {...baseProps} />)
    expect(screen.getByText('Install Now')).toBeInTheDocument()
  })

  it('shows Connected when authenticated', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: true, authenticated: true, checkedAt: 1 }}
      />,
    )
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('does NOT render Install or Connect buttons when installed + authenticated', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: true, authenticated: true, checkedAt: 1 }}
      />,
    )
    expect(screen.queryByText('Install Now')).not.toBeInTheDocument()
    expect(screen.queryByText('Connect')).not.toBeInTheDocument()
  })

  it('shows Connect button when installed but not authenticated', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: true, authenticated: false, checkedAt: 1 }}
      />,
    )
    expect(screen.getByText('Connect')).toBeInTheDocument()
    expect(screen.queryByText('Install Now')).not.toBeInTheDocument()
  })

  it('calls onConnect when Connect button is clicked', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: true, authenticated: false, checkedAt: 1 }}
      />,
    )
    fireEvent.click(screen.getByText('Connect'))
    expect(baseProps.onConnect).toHaveBeenCalledOnce()
  })

  it('calls onInstall when Install Now button is clicked', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: false, authenticated: false, checkedAt: 1 }}
      />,
    )
    fireEvent.click(screen.getByText('Install Now'))
    expect(baseProps.onInstall).toHaveBeenCalledOnce()
  })

  it('calls onRefresh when refresh button is clicked', () => {
    render(<AuthStatusCard {...baseProps} />)
    fireEvent.click(screen.getByTitle('Re-check status'))
    expect(baseProps.onRefresh).toHaveBeenCalledOnce()
  })

  it('does NOT render any manual npm install hint', () => {
    render(
      <AuthStatusCard
        {...baseProps}
        status={{ installed: false, authenticated: false, checkedAt: 1 }}
      />,
    )
    // The old InstallHint subcomponent is gone — verify its literal strings no longer render
    expect(screen.queryByText('npm install -g @github/copilot')).not.toBeInTheDocument()
    expect(screen.queryByText('npm install -g @anthropic-ai/claude-code')).not.toBeInTheDocument()
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
        status={{ installed: true, authenticated: true, version: '1.2.3', checkedAt: 1 }}
      />,
    )
    expect(screen.getByText('1.2.3')).toBeInTheDocument()
  })
})
