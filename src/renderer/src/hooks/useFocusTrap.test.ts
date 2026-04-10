// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { useFocusTrap } from './useFocusTrap'
import type { RefObject } from 'react'

function createContainer(...elements: HTMLElement[]): HTMLDivElement {
  const div = document.createElement('div')
  for (const el of elements) div.appendChild(el)
  document.body.appendChild(div)
  return div
}

function makeButton(label: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  return btn
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useFocusTrap', () => {
  it('does nothing when isActive is false', () => {
    const btn = makeButton('A')
    const container = createContainer(btn)
    const ref = { current: container } as RefObject<HTMLElement>

    renderHook(() => useFocusTrap(ref, false))

    expect(document.activeElement).not.toBe(btn)
  })

  it('focuses the first focusable element when active', () => {
    const btnA = makeButton('A')
    const btnB = makeButton('B')
    const container = createContainer(btnA, btnB)
    const ref = { current: container } as RefObject<HTMLElement>

    renderHook(() => useFocusTrap(ref, true))

    expect(document.activeElement).toBe(btnA)
  })

  it('does nothing when container ref is null', () => {
    const ref = { current: null } as RefObject<HTMLElement | null>

    // Should not throw
    renderHook(() => useFocusTrap(ref, true))

    expect(document.activeElement).toBe(document.body)
  })

  it('wraps focus from last to first on Tab', () => {
    const btnA = makeButton('A')
    const btnB = makeButton('B')
    const container = createContainer(btnA, btnB)
    const ref = { current: container } as RefObject<HTMLElement>

    renderHook(() => useFocusTrap(ref, true))

    // Focus is on btnA; move to btnB
    btnB.focus()
    expect(document.activeElement).toBe(btnB)

    // Tab on last element should wrap to first
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const prevented = !document.dispatchEvent(event)
    // The handler calls preventDefault so focus wraps
    expect(document.activeElement).toBe(btnA)
  })

  it('wraps focus from first to last on Shift+Tab', () => {
    const btnA = makeButton('A')
    const btnB = makeButton('B')
    const container = createContainer(btnA, btnB)
    const ref = { current: container } as RefObject<HTMLElement>

    renderHook(() => useFocusTrap(ref, true))

    // Focus is on btnA (first)
    expect(document.activeElement).toBe(btnA)

    // Shift+Tab on first element should wrap to last
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(document.activeElement).toBe(btnB)
  })

  it('ignores non-Tab keys', () => {
    const btnA = makeButton('A')
    const btnB = makeButton('B')
    const container = createContainer(btnA, btnB)
    const ref = { current: container } as RefObject<HTMLElement>

    renderHook(() => useFocusTrap(ref, true))
    expect(document.activeElement).toBe(btnA)

    // Press Escape — should not change focus
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.activeElement).toBe(btnA)
  })

  it('restores focus on cleanup', () => {
    const outerBtn = makeButton('outer')
    document.body.appendChild(outerBtn)
    outerBtn.focus()
    expect(document.activeElement).toBe(outerBtn)

    const innerBtn = makeButton('inner')
    const container = createContainer(innerBtn)
    const ref = { current: container } as RefObject<HTMLElement>

    const { unmount } = renderHook(() => useFocusTrap(ref, true))
    expect(document.activeElement).toBe(innerBtn)

    unmount()
    expect(document.activeElement).toBe(outerBtn)
  })

  it('removes keydown listener on cleanup', () => {
    const btnA = makeButton('A')
    const btnB = makeButton('B')
    const container = createContainer(btnA, btnB)
    const ref = { current: container } as RefObject<HTMLElement>

    const { unmount } = renderHook(() => useFocusTrap(ref, true))
    unmount()

    // After unmount, Tab shouldn't wrap anymore
    btnB.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    // Focus stays on btnB since the listener is removed
    expect(document.activeElement).toBe(btnB)
  })

  it('handles container with no focusable elements', () => {
    const span = document.createElement('span')
    span.textContent = 'not focusable'
    const container = createContainer(span)
    const ref = { current: container } as RefObject<HTMLElement>

    // Should not throw
    renderHook(() => useFocusTrap(ref, true))
  })
})
