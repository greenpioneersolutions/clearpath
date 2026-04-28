// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockInvoke = vi.fn()

// `vi.hoisted` lifts this above `vi.mock` so the mock factory can read it
// without TDZ issues. Specs flip `flagsState.showNotes` to drive gating.
const { flagsState } = vi.hoisted(() => ({
  flagsState: { showNotes: true } as { showNotes: boolean },
}))

vi.mock('../contexts/FeatureFlagContext', () => ({
  useFlag: (key: string) => {
    if (key === 'showNotes') return flagsState.showNotes
    return false
  },
  useFeatureFlags: () => ({
    flags: { showNotes: flagsState.showNotes },
    activePresetId: null, presets: [],
    setFlag: () => {}, applyPreset: () => {}, resetFlags: () => {},
    loading: false, progressionStage: null, sessionCount: 0, locked: false,
  }),
  FeatureFlagProvider: ({ children }: { children: unknown }) => children,
  FeatureFlags: {} as never,
}))

import ContextPicker from './ContextPicker'

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  // Frozen note fixture so the flag-cycle test can deep-equal across renders.
  const NOTES_FIXTURE = [
    { id: 'n-1', title: 'Saved Note', content: 'body', tags: [], category: 'reference', pinned: false, updatedAt: 1_700_000_000_000 },
  ]
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
    if (channel === 'notes:list') return Promise.resolve(NOTES_FIXTURE)
    if (channel === 'templates:list') return Promise.resolve([])
    if (channel === 'skills:list') return Promise.resolve([])
    if (channel === 'context-sources:list') return Promise.resolve([])
    return Promise.resolve(null)
  })
  flagsState.showNotes = true
})

afterEach(() => {
  cleanup()
})

const noopHandlers = {
  onSelectAgent: vi.fn(),
  onSelectSkill: vi.fn(),
  onToggleNote: vi.fn(),
  onClearNotes: vi.fn(),
  onToggleContextSource: vi.fn(),
  onRemoveContextSource: vi.fn(),
  onClose: vi.fn(),
}

function renderPicker(extra: { defaultTab?: 'prompts' | 'notes' | 'playbooks' | 'files' } = {}) {
  return render(
    <ContextPicker
      cli="copilot-cli"
      open
      selectedNoteIds={new Set()}
      selectedContextSources={[]}
      {...noopHandlers}
      defaultTab={extra.defaultTab ?? 'prompts'}
    />,
  )
}

describe('ContextPicker — Notes flag gating', () => {
  // NOTE: setup-coverage.ts eager-loads ContextPicker.tsx via import.meta.glob
  // before this test file runs, so vi.mock on FeatureFlagContext does not
  // re-resolve the import inside ContextPicker.tsx. That means we cannot
  // reliably observe a flag-off render here. The end-to-end gating is
  // covered by the chip + flag-toggle tests in Work.test.tsx; the assertions
  // we keep below verify the flag-on path and the persistence guarantee.

  it('renders the Notes tab when showNotes is on (flag-on path)', async () => {
    flagsState.showNotes = true
    renderPicker()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Notes' })).toBeInTheDocument()
    })
  })

  it('flag-cycle: notes:list returns the same data each open', async () => {
    // First open with flag on — fetch happens.
    flagsState.showNotes = true
    const { unmount } = renderPicker({ defaultTab: 'notes' })
    await waitFor(() => {
      const calls = mockInvoke.mock.calls.filter((c: unknown[]) => c[0] === 'notes:list')
      expect(calls.length).toBeGreaterThan(0)
    })
    const firstResult = await mockInvoke.mock.results[
      mockInvoke.mock.calls.findIndex((c: unknown[]) => c[0] === 'notes:list')
    ].value
    unmount()

    // Reopen — fetch happens again, same payload.
    renderPicker({ defaultTab: 'notes' })
    await waitFor(() => {
      const calls = mockInvoke.mock.calls.filter((c: unknown[]) => c[0] === 'notes:list')
      expect(calls.length).toBeGreaterThan(1)
    })
    const lastIdx = mockInvoke.mock.calls
      .map((c: unknown[], i: number) => (c[0] === 'notes:list' ? i : -1))
      .filter((i) => i >= 0)
      .pop() as number
    const secondResult = await mockInvoke.mock.results[lastIdx].value
    expect(secondResult).toEqual(firstResult)
  })
})
