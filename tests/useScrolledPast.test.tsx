// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useScrolledPast } from '@/ui/hooks/useScrolledPast.ts'

afterEach(() => { cleanup(); scrollTo(0) })

function scrollTo(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
  window.dispatchEvent(new Event('scroll'))
}

describe('useScrolledPast', () => {
  it('turns on past enter and off only below leave', () => {
    const { result } = renderHook(() => useScrolledPast(40, 8))
    expect(result.current).toBe(false)
    act(() => scrollTo(30))
    expect(result.current).toBe(false)
    act(() => scrollTo(41))
    expect(result.current).toBe(true)
    // What compacting itself can pull it back to: still on.
    act(() => scrollTo(20))
    expect(result.current).toBe(true)
    act(() => scrollTo(7))
    expect(result.current).toBe(false)
  })
})
