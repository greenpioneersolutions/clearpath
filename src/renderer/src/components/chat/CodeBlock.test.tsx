// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import CodeBlock from './CodeBlock'

const writeText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

beforeEach(() => writeText.mockClear())

// highlight.js splits code across token <span>s, so assert on the code element's
// concatenated textContent rather than a single text node.
const codeText = (root: HTMLElement): string =>
  root.querySelector('code.hljs')?.textContent ?? ''

describe('CodeBlock', () => {
  it('renders a language chip and the code text', () => {
    const { container } = render(<CodeBlock code={'echo hello'} lang="bash" />)
    expect(screen.getByText('BASH')).toBeInTheDocument()
    expect(codeText(container)).toContain('echo hello')
  })

  it('does not throw for an unknown / missing language', () => {
    const { container: c1 } = render(<CodeBlock code={'some plain text'} lang="not-a-real-lang" />)
    expect(codeText(c1)).toContain('some plain text')
    // No language falls back to a generic chip.
    const { container: c2 } = render(<CodeBlock code={'plain'} />)
    expect(within(c2).getByText('CODE')).toBeInTheDocument()
  })

  it('copies the code to the clipboard', () => {
    render(<CodeBlock code={'const x = 1'} lang="ts" />)
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }))
    expect(writeText).toHaveBeenCalledWith('const x = 1')
  })
})
