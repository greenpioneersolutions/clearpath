// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

import WorkflowsCard from './WorkflowsCard'

function makeWorkflow(overrides: Partial<{ id: string; name: string; description: string; lastUsedAt: number; createdAt: number; usageCount: number; steps: Array<{ id: string }> }>) {
  return {
    id: 'wf-1',
    name: 'Workflow 1',
    description: 'Does a thing',
    steps: [{ id: 's1' }],
    createdAt: Date.now() - 60_000,
    lastUsedAt: Date.now() - 60_000,
    usageCount: 1,
    ...overrides,
  }
}

describe('WorkflowsCard', () => {
  it('renders empty state when no workflows', async () => {
    setupElectronAPI({ 'workflow:list': [] })
    render(<WorkflowsCard onOpenWorkflow={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/No saved workflows yet/i)).toBeInTheDocument()
    })
  })

  it('renders up to 6 workflows sorted by lastUsedAt desc', async () => {
    const workflows = Array.from({ length: 8 }, (_, i) =>
      makeWorkflow({ id: `wf-${i}`, name: `Workflow ${i}`, lastUsedAt: 1_000_000_000 + i }),
    )
    setupElectronAPI({ 'workflow:list': workflows })
    render(<WorkflowsCard onOpenWorkflow={vi.fn()} />)
    await waitFor(() => {
      const rows = screen.getAllByTestId('workflow-row')
      expect(rows.length).toBe(6)
    })
    // Most recent (index 7) should be first
    const rows = screen.getAllByTestId('workflow-row')
    expect(rows[0].textContent).toContain('Workflow 7')
  })

  it('falls back to createdAt when lastUsedAt is missing', async () => {
    setupElectronAPI({
      'workflow:list': [
        makeWorkflow({ id: 'a', name: 'Older', createdAt: 1_000, lastUsedAt: undefined }),
        makeWorkflow({ id: 'b', name: 'Newer', createdAt: 5_000, lastUsedAt: undefined }),
      ],
    })
    render(<WorkflowsCard onOpenWorkflow={vi.fn()} />)
    await waitFor(() => {
      const rows = screen.getAllByTestId('workflow-row')
      expect(rows[0].textContent).toContain('Newer')
    })
  })

  it('calls onOpenWorkflow with the workflow id when clicked', async () => {
    const onOpen = vi.fn()
    setupElectronAPI({ 'workflow:list': [makeWorkflow({ id: 'wf-xyz', name: 'Click me' })] })
    render(<WorkflowsCard onOpenWorkflow={onOpen} />)
    await waitFor(() => {
      expect(screen.getByText('Click me')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('workflow-row'))
    expect(onOpen).toHaveBeenCalledWith('wf-xyz')
  })
})
