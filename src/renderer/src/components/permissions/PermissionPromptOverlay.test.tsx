// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PermissionPromptOverlay from './PermissionPromptOverlay'
import type { PermissionRequest } from '../../../../shared/permissions/types'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset().mockResolvedValue([])
  mockOn.mockReset().mockReturnValue(vi.fn())
})

const req = (over: Partial<PermissionRequest> = {}): PermissionRequest => ({
  requestId: 'r1', sessionId: 's1', cli: 'copilot', sessionName: 'Sess',
  toolName: 'Create FEATURE_FLAGS_SUMMARY.md', toolClass: 'edit',
  inputPreview: 'FEATURE_FLAGS_SUMMARY.md', policyName: 'Standard', timestamp: 0, ...over,
})

function captureCb(): () => ((d: unknown) => void) {
  let cb: ((d: unknown) => void) | undefined
  mockOn.mockImplementation((ch: string, fn: (d: unknown) => void) => {
    if (ch === 'cli:permission-request') cb = fn
    return vi.fn()
  })
  return () => cb!
}

describe('PermissionPromptOverlay', () => {
  it('renders nothing when there are no requests', () => {
    const { container } = render(<PermissionPromptOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it('recovers in-flight requests via permission:list-pending on mount', async () => {
    mockInvoke.mockResolvedValue([req()])
    render(<PermissionPromptOverlay />)
    await waitFor(() => expect(screen.getByTestId('permission-overlay')).toBeDefined())
    expect(screen.getByText('Create FEATURE_FLAGS_SUMMARY.md')).toBeDefined()
    expect(screen.getByText(/policy .Standard./)).toBeDefined()
  })

  it('pops the modal when a broker request arrives and Allow once responds', async () => {
    const getCb = captureCb()
    render(<PermissionPromptOverlay />)
    getCb()({ request: req() })
    await waitFor(() => expect(screen.getByTestId('permission-overlay')).toBeDefined())
    fireEvent.click(screen.getByText('Allow once'))
    expect(mockInvoke).toHaveBeenCalledWith('permission:respond', { requestId: 'r1', decision: 'allow', remember: undefined })
    // dismissed after answering
    await waitFor(() => expect(screen.queryByTestId('permission-overlay')).toBeNull())
  })

  it('Always this session sends remember:session', async () => {
    const getCb = captureCb()
    render(<PermissionPromptOverlay />)
    getCb()({ request: req() })
    await waitFor(() => expect(screen.getByText('Always this session')).toBeDefined())
    fireEvent.click(screen.getByText('Always this session'))
    expect(mockInvoke).toHaveBeenCalledWith('permission:respond', { requestId: 'r1', decision: 'allow', remember: 'session' })
  })

  it('queues multiple requests and shows the next after answering', async () => {
    const getCb = captureCb()
    render(<PermissionPromptOverlay />)
    getCb()({ request: req({ requestId: 'r1', toolName: 'First' }) })
    getCb()({ request: req({ requestId: 'r2', toolName: 'Second' }) })
    await waitFor(() => expect(screen.getByText('First')).toBeDefined())
    expect(screen.getByText('1 more')).toBeDefined()
    fireEvent.click(screen.getByText('Deny'))
    await waitFor(() => expect(screen.getByText('Second')).toBeDefined())
  })

  it('ignores legacy non-broker shapes', async () => {
    const getCb = captureCb()
    const { container } = render(<PermissionPromptOverlay />)
    getCb()({ sessionId: 'x', request: { type: 'permission-request', content: 'old' } })
    await waitFor(() => expect(container.firstChild).toBeNull())
  })
})
