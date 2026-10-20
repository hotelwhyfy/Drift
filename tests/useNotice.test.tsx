// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useNotice, TOAST_EXIT_MS } from '@/ui/hooks/useNotice.ts'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('useNotice', () => {
  it('leaves, then goes once the exit has had time to play', () => {
    const { result } = renderHook(() => useNotice())
    act(() => result.current.say('saved'))
    expect(result.current.notice?.leaving).toBe(false)

    act(() => { vi.advanceTimersByTime(4500) })
    expect(result.current.notice?.text).toBe('saved')
    expect(result.current.notice?.leaving).toBe(true)

    act(() => { vi.advanceTimersByTime(TOAST_EXIT_MS) })
    expect(result.current.notice).toBeNull()
  })

  it('a new notice cancels a leaving one and enters as a new toast', () => {
    const { result } = renderHook(() => useNotice())
    act(() => result.current.say('first'))
    const first = result.current.notice?.id
    act(() => { vi.advanceTimersByTime(4500) })
    act(() => result.current.say('second'))
    expect(result.current.notice?.leaving).toBe(false)
    expect(result.current.notice?.id).not.toBe(first)

    act(() => { vi.advanceTimersByTime(TOAST_EXIT_MS) })
    expect(result.current.notice?.text).toBe('second')
  })
})
