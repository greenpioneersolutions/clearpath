// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PermissionRequestHandler from './PermissionRequestHandler'
import type { PermissionRequest } from '../../../../shared/permissions/types'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
  mockInvoke.mockResolvedValue([]) // default: no pending requests
})

const sampleReq: PermissionRequest = {
  requestId: 'r1',
  sessionId: 'sess-1',
  cli: 'claude',
  sessionName: 'My Session',
  toolName: 'Bash',
  toolClass: 'shell',
  inputPreview: 'npm run build',
  policyName: 'Standard',
  timestamp: Date.now(),
}

function captureCallback(): () => ((data: unknown) => void) | undefined {
  let cb: ((data: unknown) => void) | undefined
  mockOn.mockImplementation((channel: string, fn: (data: unknown) => void) => {
    if (channel === 'cli:permission-request') cb = fn
    return vi.fn()
  })
  return () => cb
}

describe('PermissionRequestHandler', () => {
  it('renders title + empty state', () => {
    render(<PermissionRequestHandler />)
    expect(screen.getByText('Permission requests')).toBeDefined()
    expect(screen.getByText('No pending permission requests')).toBeDefined()
  })

  it('recovers in-flight requests via permission:list-pending on mount', async () => {
    render(<PermissionRequestHandler />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('permission:list-pending'))
  })

  it('subscribes to cli:permission-request', () => {
    render(<PermissionRequestHandler />)
    expect(mockOn).toHaveBeenCalledWith('cli:permission-request', expect.any(Function))
  })

  it('shows a pending request (tool name, class, input preview, policy) when one arrives', async () => {
    const getCb = captureCallback()
    render(<PermissionRequestHandler />)
    getCb()!({ request: sampleReq })
    await waitFor(() => expect(screen.getByText('Bash')).toBeDefined())
    expect(screen.getByText('npm run build')).toBeDefined()
    expect(screen.getByText('shell')).toBeDefined()
    expect(screen.getByText(/policy: Standard/)).toBeDefined()
  })

  it('ignores legacy/non-broker shapes (no requestId)', async () => {
    const getCb = captureCallback()
    render(<PermissionRequestHandler />)
    getCb()!({ sessionId: 'x', request: { type: 'permission-request', content: 'old' } })
    await waitFor(() => expect(screen.getByText('No pending permission requests')).toBeDefined())
  })

  it('Allow once → permission:respond allow with no remember', async () => {
    const getCb = captureCallback()
    render(<PermissionRequestHandler />)
    getCb()!({ request: sampleReq })
    await waitFor(() => expect(screen.getByText('Allow once')).toBeDefined())
    fireEvent.click(screen.getByText('Allow once'))
    expect(mockInvoke).toHaveBeenCalledWith('permission:respond', { requestId: 'r1', decision: 'allow', remember: undefined })
  })

  it('Always this session → permission:respond allow with remember:session', async () => {
    const getCb = captureCallback()
    render(<PermissionRequestHandler />)
    getCb()!({ request: sampleReq })
    await waitFor(() => expect(screen.getByText('Always this session')).toBeDefined())
    fireEvent.click(screen.getByText('Always this session'))
    expect(mockInvoke).toHaveBeenCalledWith('permission:respond', { requestId: 'r1', decision: 'allow', remember: 'session' })
  })

  it('Deny → permission:respond deny', async () => {
    const getCb = captureCallback()
    render(<PermissionRequestHandler />)
    getCb()!({ request: sampleReq })
    await waitFor(() => expect(screen.getByText('Deny')).toBeDefined())
    fireEvent.click(screen.getByText('Deny'))
    expect(mockInvoke).toHaveBeenCalledWith('permission:respond', { requestId: 'r1', decision: 'deny', remember: undefined })
  })
})
