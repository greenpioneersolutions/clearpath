// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SessionActivityPanel from './SessionActivityPanel'
import type { SessionActivityEntry } from '../../../../shared/activity/types'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true, configurable: true,
  })
  mockInvoke.mockReset().mockResolvedValue([])
  mockOn.mockReset().mockReturnValue(vi.fn())
})

const e = (over: Partial<SessionActivityEntry>): SessionActivityEntry => ({
  id: Math.random().toString(36), sessionId: 's1', cli: 'claude', kind: 'write',
  toolName: 'Write', target: '/p/out.md', decision: 'allow', timestamp: 0, ...over,
})

describe('SessionActivityPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SessionActivityPanel sessionId="s1" open={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('fetches activity on open and groups outputs / inputs / web', async () => {
    mockInvoke.mockResolvedValue([
      e({ kind: 'write', target: '/p/out.md' }),
      e({ kind: 'read', target: '/p/in.md' }),
      e({ kind: 'fetch', target: 'https://example.com', toolName: 'fetch' }),
    ])
    render(<SessionActivityPanel sessionId="s1" open onClose={vi.fn()} />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('activity:get-session', { sessionId: 's1' }))
    expect(await screen.findByText('/p/out.md')).toBeDefined()
    expect(screen.getByText('/p/in.md')).toBeDefined()
    expect(screen.getByText('https://example.com')).toBeDefined()
    expect(screen.getByText(/Outputs/)).toBeDefined()
    expect(screen.getByText(/Web/)).toBeDefined()
  })

  it('Open on an output file invokes activity:open-file', async () => {
    mockInvoke.mockResolvedValue([e({ kind: 'write', target: '/p/out.md' })])
    render(<SessionActivityPanel sessionId="s1" open onClose={vi.fn()} />)
    await screen.findByText('/p/out.md')
    fireEvent.click(screen.getByText('Open'))
    expect(mockInvoke).toHaveBeenCalledWith('activity:open-file', { path: '/p/out.md' })
  })

  it('Open on a fetched URL invokes activity:open-url', async () => {
    mockInvoke.mockResolvedValue([e({ kind: 'fetch', target: 'https://x.com', toolName: 'fetch' })])
    render(<SessionActivityPanel sessionId="s1" open onClose={vi.fn()} />)
    await screen.findByText('https://x.com')
    fireEvent.click(screen.getByText('Open ↗'))
    expect(mockInvoke).toHaveBeenCalledWith('activity:open-url', { url: 'https://x.com' })
  })

  it('shows an empty state when there is no activity', async () => {
    render(<SessionActivityPanel sessionId="s1" open onClose={vi.fn()} />)
    expect(await screen.findByText(/No activity yet/)).toBeDefined()
  })

  it('shows a "Your decisions" audit section for prompts the user answered', async () => {
    mockInvoke.mockResolvedValue([
      e({ kind: 'write', target: '/p/out.md', decision: 'allow', decidedBy: 'user', toolName: 'create' }),
      e({ kind: 'read', target: '/p/in.md', decision: 'allow', decidedBy: 'policy', toolName: 'view' }),
    ])
    render(<SessionActivityPanel sessionId="s1" open onClose={vi.fn()} />)
    expect(await screen.findByText(/Your decisions/)).toBeDefined()
    expect(screen.getByText('✓ Allowed')).toBeDefined()
  })

  it('subscribes to cli:turn-end to refresh', () => {
    render(<SessionActivityPanel sessionId="s1" open onClose={vi.fn()} />)
    expect(mockOn).toHaveBeenCalledWith('cli:turn-end', expect.any(Function))
  })
})
