// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import McpManager from './McpManager'

function ConnectLanding(): JSX.Element {
  const loc = useLocation()
  return <div>Connect Page {loc.search}</div>
}

function renderWithRouter(initialPath = '/tools') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/tools" element={<McpManager cli="claude" />} />
        <Route path="/connect" element={<ConnectLanding />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('McpManager (redirect stub)', () => {
  it('renders the redirect copy', () => {
    renderWithRouter()
    expect(
      screen.getByText('MCP management has moved to Connect.'),
    ).toBeDefined()
    expect(
      screen.getByText(
        /Add and manage MCP servers for both CoPilot and Claude Code in one place\./,
      ),
    ).toBeDefined()
  })

  it('renders a "Go to Connect" button', () => {
    renderWithRouter()
    expect(screen.getByRole('button', { name: 'Go to Connect' })).toBeDefined()
  })

  it('navigates to /connect?tab=mcp when the button is clicked', () => {
    renderWithRouter()
    fireEvent.click(screen.getByRole('button', { name: 'Go to Connect' }))
    expect(screen.getByText(/Connect Page/)).toBeDefined()
    expect(screen.getByText(/tab=mcp/)).toBeDefined()
  })
})
