// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))
vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('rehype-sanitize', () => ({ default: () => {} }))

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

import OutputDisplay from './OutputDisplay'
import type { OutputMessage } from './OutputDisplay'

describe('OutputDisplay', () => {
  const onPermissionResponse = vi.fn()

  beforeEach(() => {
    onPermissionResponse.mockReset()
  })

  it('renders welcome state when no messages', () => {
    render(<OutputDisplay messages={[]} onPermissionResponse={onPermissionResponse} />)
    expect(screen.getByText('Start a conversation')).toBeInTheDocument()
  })

  it('renders a user message', () => {
    const messages: OutputMessage[] = [
      { id: '1', sender: 'user', output: { type: 'text', content: 'Hello world' } },
    ]
    render(<OutputDisplay messages={messages} onPermissionResponse={onPermissionResponse} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders an AI text message with markdown', () => {
    const messages: OutputMessage[] = [
      { id: '1', sender: 'ai', output: { type: 'text', content: 'AI response here' } },
    ]
    render(<OutputDisplay messages={messages} onPermissionResponse={onPermissionResponse} />)
    expect(screen.getByText('AI response here')).toBeInTheDocument()
  })

  it('renders tool-use messages', () => {
    const messages: OutputMessage[] = [
      { id: '1', sender: 'ai', output: { type: 'tool-use', content: 'Running shell command' } },
    ]
    render(<OutputDisplay messages={messages} onPermissionResponse={onPermissionResponse} />)
    expect(screen.getByText(/Running shell command/)).toBeInTheDocument()
  })

  it('renders error messages', () => {
    const messages: OutputMessage[] = [
      { id: '1', sender: 'system', output: { type: 'error', content: 'Something failed' } },
    ]
    render(<OutputDisplay messages={messages} onPermissionResponse={onPermissionResponse} />)
    expect(screen.getByText(/Something failed/)).toBeInTheDocument()
  })

  it('renders multiple messages', () => {
    const messages: OutputMessage[] = [
      { id: '1', sender: 'user', output: { type: 'text', content: 'User msg' } },
      { id: '2', sender: 'ai', output: { type: 'text', content: 'AI msg' }, timestamp: Date.now() + 5000 },
    ]
    render(<OutputDisplay messages={messages} onPermissionResponse={onPermissionResponse} />)
    expect(screen.getByText('User msg')).toBeInTheDocument()
    expect(screen.getByText('AI msg')).toBeInTheDocument()
  })

  it('shows thinking indicator when processing', () => {
    render(
      <OutputDisplay
        messages={[]}
        onPermissionResponse={onPermissionResponse}
        processing={true}
      />,
    )
    // The thinking indicator shows a rotating phrase
    const thinkingEl = document.querySelector('.animate-pulse') ?? document.querySelector('[class*="animate"]')
    expect(thinkingEl).toBeTruthy()
  })

  // ── groupMessages behavior (black-box via rendered bubble count) ────────
  //
  // Grouped AI text messages render as a single <AIBubble>, each with its own
  // `.prose-chat` wrapper. Counting those wrappers tells us how many bubbles
  // (i.e. groups) were produced.
  describe('turn-based grouping', () => {
    const base = 1_700_000_000_000
    const countAiBubbles = () => document.querySelectorAll('.prose-chat').length

    it('groups two AI messages with the same turnId even 10s apart', () => {
      const messages: OutputMessage[] = [
        { id: '1', sender: 'ai', output: { type: 'text', content: 'chunk one', turnId: 'turn-A' }, timestamp: base, turnId: 'turn-A' },
        { id: '2', sender: 'ai', output: { type: 'text', content: 'chunk two', turnId: 'turn-A' }, timestamp: base + 10_000, turnId: 'turn-A' },
      ]
      render(<OutputDisplay messages={messages} onPermissionResponse={onPermissionResponse} />)
      expect(countAiBubbles()).toBe(1)
    })

    it('does NOT group two AI messages with different turnIds even 500ms apart', () => {
      const messages: OutputMessage[] = [
        { id: '1', sender: 'ai', output: { type: 'text', content: 'first turn', turnId: 'turn-A' }, timestamp: base, turnId: 'turn-A' },
        { id: '2', sender: 'ai', output: { type: 'text', content: 'second turn', turnId: 'turn-B' }, timestamp: base + 500, turnId: 'turn-B' },
      ]
      render(<OutputDisplay messages={messages} onPermissionResponse={onPermissionResponse} />)
      expect(countAiBubbles()).toBe(2)
    })

    it('falls back to 2s timestamp window when both messages lack turnIds — groups within 500ms', () => {
      const messages: OutputMessage[] = [
        { id: '1', sender: 'ai', output: { type: 'text', content: 'alpha' }, timestamp: base },
        { id: '2', sender: 'ai', output: { type: 'text', content: 'bravo' }, timestamp: base + 500 },
      ]
      render(<OutputDisplay messages={messages} onPermissionResponse={onPermissionResponse} />)
      expect(countAiBubbles()).toBe(1)
    })

    it('falls back to 2s timestamp window when both messages lack turnIds — splits beyond 2s', () => {
      const messages: OutputMessage[] = [
        { id: '1', sender: 'ai', output: { type: 'text', content: 'alpha' }, timestamp: base },
        { id: '2', sender: 'ai', output: { type: 'text', content: 'bravo' }, timestamp: base + 5_000 },
      ]
      render(<OutputDisplay messages={messages} onPermissionResponse={onPermissionResponse} />)
      expect(countAiBubbles()).toBe(2)
    })
  })
})
