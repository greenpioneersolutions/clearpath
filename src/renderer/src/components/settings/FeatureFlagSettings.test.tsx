// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FeatureFlagProvider, type FeatureFlags } from '../../contexts/FeatureFlagContext'
import { FEATURE_FLAG_KEYS } from '../../../../shared/featureFlags.generated'
import FeatureFlagSettings from './FeatureFlagSettings'

const mockInvoke = vi.fn()

// Derive the fixture from FEATURE_FLAG_KEYS so adding a new flag doesn't
// silently break this test by leaving a missing-key TypeScript error.
// All flags default to `true` (the "everything on" baseline this fixture
// is meant to represent); individual specs override what they need.
const ALL_ON: FeatureFlags = FEATURE_FLAG_KEYS.reduce((acc, key) => {
  acc[key] = true
  return acc
}, {} as FeatureFlags)

const mockPresets = [
  { id: 'all-on', name: 'Everything', description: 'All features enabled' },
  { id: 'minimal', name: 'Minimal', description: 'Core features only' },
]

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'feature-flags:get') return Promise.resolve({ flags: ALL_ON, activePresetId: 'all-on' })
    if (channel === 'feature-flags:get-presets') return Promise.resolve(mockPresets)
    if (channel === 'feature-flags:set') return Promise.resolve()
    if (channel === 'feature-flags:apply-preset') return Promise.resolve(ALL_ON)
    if (channel === 'feature-flags:reset') return Promise.resolve(ALL_ON)
    return Promise.resolve()
  })
})

function renderWithProvider() {
  return render(
    <FeatureFlagProvider>
      <FeatureFlagSettings />
    </FeatureFlagProvider>
  )
}

describe('FeatureFlagSettings', () => {
  it('renders preset buttons', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Everything')).toBeInTheDocument())
    expect(screen.getByText('Minimal')).toBeInTheDocument()
  })

  it('renders Quick Presets heading', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Quick Presets')).toBeInTheDocument())
  })

  it('shows feature count summary', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText(/features enabled/)).toBeInTheDocument())
  })

  it('renders Enable All button', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Enable All')).toBeInTheDocument())
  })

  it('calls feature-flags:reset when Enable All is clicked', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Enable All')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Enable All'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('feature-flags:reset')
    })
  })

  it('renders flag group headings', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Home Page')).toBeInTheDocument())
    expect(screen.getByText('Main Navigation')).toBeInTheDocument()
    // "Experimental Features" appears as both a group heading and a flag label
    const expHeadings = screen.getAllByText('Experimental Features')
    expect(expHeadings.length).toBeGreaterThanOrEqual(1)
  })

  it('renders toggle switches for flags', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Simple Home')).toBeInTheDocument())
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBeGreaterThan(0)
  })

  it('calls feature-flags:set when a flag is toggled', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByLabelText('Toggle Simple Home')).toBeInTheDocument())
    // Target a specific flag toggle — the first switch by role is the progressive
    // disclosure toggle, which fires applyPreset, not setFlag.
    fireEvent.click(screen.getByLabelText('Toggle Simple Home'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('feature-flags:set', expect.any(Object))
    })
  })

  it('calls feature-flags:apply-preset when a preset is clicked', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('Minimal')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Minimal'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('feature-flags:apply-preset', { presetId: 'minimal' })
    })
  })

  it('renders flag descriptions', async () => {
    renderWithProvider()
    await waitFor(() => expect(screen.getByText(/Clean action hub/)).toBeInTheDocument())
  })
})
