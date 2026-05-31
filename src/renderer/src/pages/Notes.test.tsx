// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))
vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('rehype-sanitize', () => ({ default: () => {} }))

// The Notes editor overlay mounts CodeMirror. Mock it as a textarea (matching
// the memory/FileEditor test) and stub the named exports the modal references
// at render time (EditorView.lineWrapping, keymap.of) so the markdown toolbar
// wiring doesn't crash under jsdom.
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="codemirror-mock"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  EditorView: { lineWrapping: {} },
  EditorSelection: { range: (from: number, to: number) => ({ from, to }) },
  keymap: { of: () => ({}) },
}))

const flagsRef: { current: Record<string, boolean> } = { current: { showNotes: true } }
vi.mock('../contexts/FeatureFlagContext', () => ({
  useFlag: (key: string) => Boolean(flagsRef.current[key]),
  useFeatureFlags: () => ({ flags: flagsRef.current }),
}))

import { setupElectronAPI } from '../../../test/ipc-mock-helper'

import Notes from './Notes'

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeNotes() {
  return [
    {
      id: 'n-1',
      title: 'Meeting Q3',
      content: 'Auth decision recorded.',
      tags: ['q3', 'auth'],
      category: 'meeting',
      pinned: true,
      attachments: [],
      createdAt: 1000,
      updatedAt: 5000,
      source: 'manual',
    },
    {
      id: 'n-2',
      title: 'Reference doc',
      content: 'Lorem ipsum.',
      tags: ['reference'],
      category: 'reference',
      pinned: false,
      attachments: [],
      createdAt: 1000,
      updatedAt: 4000,
      source: 'manual',
    },
  ]
}

function renderNotes(initialEntries: string[] = ['/notes']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/notes" element={<Notes />} />
        <Route path="/work" element={<LocationProbe />} />
        <Route path="/configure" element={<LocationProbe />} />
        <Route path="/learn" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function LocationProbe() {
  const loc = useLocation()
  return (
    <div data-testid="probe">
      {loc.pathname}
      {loc.search}
      <pre data-testid="probe-state">{JSON.stringify(loc.state)}</pre>
    </div>
  )
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  flagsRef.current = { showNotes: true }
  setupElectronAPI({
    'notes:list': makeNotes(),
    'notes:tags': ['q3', 'auth', 'reference'],
    'notes:update': { id: 'n-1' },
    'notes:create': {
      id: 'new-1', title: 'Untitled note', content: '', category: 'reference',
      tags: [], attachments: [], createdAt: 1, updatedAt: 1, pinned: false, source: 'manual',
    },
  })
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Notes page', () => {
  it('renders the header and the list of notes', async () => {
    renderNotes()
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Meeting Q3')).toBeInTheDocument())
    expect(screen.getByText('Reference doc')).toBeInTheDocument()
  })

  it('filters by category when a category button is clicked', async () => {
    renderNotes()
    await waitFor(() => expect(screen.getByText('Meeting Q3')).toBeInTheDocument())

    // The left filter pane is the only place where a category appears as a
    // standalone button (without "category" in the surrounding chrome). The
    // editor's category <select> is nullable here because no note is open
    // yet, so we get an unambiguous query.
    const meetingBtn = screen.getByRole('button', { name: /^meeting/i })
    fireEvent.click(meetingBtn)

    await waitFor(() => {
      expect(screen.getByText('Meeting Q3')).toBeInTheDocument()
      expect(screen.queryByText('Reference doc')).not.toBeInTheDocument()
    })
  })

  it('opens the editor overlay when a note card is clicked', async () => {
    renderNotes()
    await waitFor(() => expect(screen.getByText('Meeting Q3')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('notes-card-n-1'))

    await waitFor(() =>
      expect(screen.getByTestId('notes-editor-modal')).toBeInTheDocument(),
    )
    expect(screen.getByDisplayValue('Meeting Q3')).toBeInTheDocument()
  })

  it('shows the markdown formatting toolbar in the overlay', async () => {
    renderNotes()
    await waitFor(() => screen.getByText('Meeting Q3'))
    fireEvent.click(screen.getByTestId('notes-card-n-1'))

    await screen.findByTestId('notes-editor-modal')
    // Default view mode is "split", so the toolbar is visible.
    expect(screen.getByRole('button', { name: /Bold/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Link/i })).toBeInTheDocument()
  })

  it('"Save & close" flushes notes:update immediately and dismisses the overlay', async () => {
    renderNotes()
    await waitFor(() => screen.getByText('Meeting Q3'))
    fireEvent.click(screen.getByTestId('notes-card-n-1'))

    const titleInput = await screen.findByDisplayValue('Meeting Q3')
    fireEvent.change(titleInput, { target: { value: 'Renamed note' } })

    fireEvent.click(screen.getByTestId('notes-save-close'))

    await waitFor(() => {
      const calls = (window.electronAPI.invoke as unknown as { mock: { calls: unknown[][] } }).mock.calls
      const matching = calls.filter(
        (c) =>
          c[0] === 'notes:update' &&
          (c[1] as { id?: string; title?: string })?.id === 'n-1' &&
          (c[1] as { title?: string })?.title === 'Renamed note',
      )
      expect(matching.length).toBeGreaterThan(0)
    })
    // Overlay closes after the explicit save.
    await waitFor(() => expect(screen.queryByTestId('notes-editor-modal')).not.toBeInTheDocument())
  })

  it('saves edits via notes:update (debounced)', async () => {
    renderNotes()
    await waitFor(() => screen.getByText('Meeting Q3'))
    fireEvent.click(screen.getByTestId('notes-card-n-1'))

    const titleInput = await screen.findByDisplayValue('Meeting Q3')
    fireEvent.change(titleInput, { target: { value: 'Meeting Q3 — updated' } })

    await waitFor(
      () => {
        const calls = (window.electronAPI.invoke as unknown as { mock: { calls: unknown[][] } }).mock.calls
        const matching = calls.filter(
          (c) =>
            c[0] === 'notes:update' &&
            typeof c[1] === 'object' &&
            c[1] !== null &&
            (c[1] as { id?: string; title?: string }).id === 'n-1' &&
            (c[1] as { title?: string }).title === 'Meeting Q3 — updated',
        )
        expect(matching.length).toBeGreaterThan(0)
      },
      { timeout: 2000 },
    )
  })

  it('"Use in next session" navigates to /work with preSelectedNoteIds in state', async () => {
    renderNotes()
    await waitFor(() => screen.getByText('Meeting Q3'))
    fireEvent.click(screen.getByTestId('notes-card-n-1'))

    const useBtn = await screen.findByTestId('notes-use-in-session')
    fireEvent.click(useBtn)

    await waitFor(() => {
      const probe = screen.getByTestId('probe')
      expect(probe.textContent).toContain('/work')
    })
    const stateJson = screen.getByTestId('probe-state').textContent ?? ''
    expect(stateJson).toContain('preSelectedNoteIds')
    expect(stateJson).toContain('n-1')
  })

  // Skipped: src/test/setup-coverage.ts eager-loads Notes.tsx via import.meta.glob
  // before this file's vi.mock hoists, so the mocked useFlag binding inside
  // Notes.tsx is captured against an earlier closure and the flag-flip is not
  // observable here. The flag-off render is verified end-to-end by toggling
  // showNotes in the running app — see also ContextPicker.test.tsx for the
  // same harness limitation.
  it.skip('renders the enable card when showNotes flag is off', async () => {
    flagsRef.current = { showNotes: false }
    renderNotes()
    expect(screen.getByText('Notes are off')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Feature Flags/i })).toBeInTheDocument()
  })

  it('shows the empty state when notes list is empty', async () => {
    setupElectronAPI({
      'notes:list': [],
      'notes:tags': [],
    })
    renderNotes()
    await waitFor(() => expect(screen.getByText('No notes yet')).toBeInTheDocument())
  })
})
