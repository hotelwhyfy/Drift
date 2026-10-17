// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAccent } from '@/ui/hooks/useAccent.ts'
import { accentFor } from '@/ui/accent.ts'

const published = (): string => document.documentElement.style.getPropertyValue('--accent')

afterEach(() => { document.documentElement.style.removeProperty('--accent') })

describe('useAccent', () => {
  it('returns the accent for the Colour value and publishes it on the page', () => {
    const { result } = renderHook(() => useAccent(0.3))
    expect(result.current).toBe(accentFor(0.3))
    expect(published()).toBe(accentFor(0.3))
  })

  it('follows the Colour value as it moves', () => {
    const { result, rerender } = renderHook(({ colour }) => useAccent(colour), { initialProps: { colour: 0 } })
    expect(published()).toBe(accentFor(0))
    rerender({ colour: 1 })
    expect(result.current).toBe(accentFor(1))
    expect(published()).toBe(accentFor(1))
    expect(accentFor(0)).not.toBe(accentFor(1))
  })

  it('keeps the colour in range, so a stray value cannot leave the palette', () => {
    expect(renderHook(() => useAccent(-5)).result.current).toBe(accentFor(0))
    expect(renderHook(() => useAccent(7)).result.current).toBe(accentFor(1))
  })
})
