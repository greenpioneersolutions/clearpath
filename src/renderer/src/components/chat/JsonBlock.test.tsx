// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import JsonBlock from './JsonBlock'

const writeText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

beforeEach(() => writeText.mockClear())

describe('JsonBlock', () => {
  it('renders keys and values from valid JSON', () => {
    render(<JsonBlock raw='{"name":"ClearPath","count":3,"on":true,"missing":null}' />)
    expect(screen.getByText(/name/)).toBeInTheDocument()
    expect(screen.getByText(/ClearPath/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
    expect(screen.getByText('null')).toBeInTheDocument()
  })

  it('normalizes ugly whitespace — copy yields clean 2-space JSON with no blank lines', () => {
    // Source has cavernous blank-line gaps (the bug in the screenshot).
    const ugly = '{\n\n\n  "a":   1,\n\n\n     "b": 2\n\n\n}'
    render(<JsonBlock raw={ugly} />)
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }))
    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toBe(JSON.stringify({ a: 1, b: 2 }, null, 2))
    expect(copied).not.toMatch(/\n\s*\n/) // no blank lines
  })

  it('collapses a container via its toggle and shows an item/key summary', () => {
    render(<JsonBlock raw='{"nested":{"alpha":1,"beta":2}}' />)
    expect(screen.getByText(/alpha/)).toBeInTheDocument()
    // Node toggles carry an aria-label; header buttons do not — so this targets nodes only.
    const toggles = screen.getAllByLabelText('Collapse')
    fireEvent.click(toggles[toggles.length - 1]) // innermost = the nested object
    expect(screen.getByText(/2 keys/)).toBeInTheDocument()
    expect(screen.queryByText(/alpha/)).toBeNull()
  })

  it('falls back to a code block for invalid JSON without crashing', () => {
    const { container } = render(<JsonBlock raw='{ this is not json' />)
    // Fallback renders <CodeBlock> directly — none of the JSON tree controls.
    expect(screen.queryByRole('button', { name: 'Raw' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Expand all' })).toBeNull()
    expect(container.querySelector('code.hljs')?.textContent).toContain('this is not json')
  })

  it('toggles between pretty tree and raw text views', () => {
    render(<JsonBlock raw='{"x":[1,2]}' />)
    // Pretty view exposes the expand/collapse-all controls.
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    // Raw view hides the tree controls and renders the code block.
    expect(screen.queryByRole('button', { name: 'Expand all' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Pretty' })).toBeInTheDocument()
  })
})
