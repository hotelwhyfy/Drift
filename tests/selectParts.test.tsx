// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { findTypeahead } from '@/ui/findTypeahead.ts'
import { placePopup } from '@/ui/placePopup.ts'
import { useTypeahead } from '@/ui/hooks/useTypeahead.ts'
import { usePopupPosition } from '@/ui/hooks/usePopupPosition.ts'

const FRUIT = ['Apple', 'Banana', 'Blueberry', 'Cherry']

describe('findTypeahead', () => {
  it('finds the first label with the typed prefix, ignoring case', () => {
    expect(findTypeahead(FRUIT, 'ch', 0)).toBe(3)
    expect(findTypeahead(FRUIT, 'blue', 0)).toBe(2)
    expect(findTypeahead(['Zed', 'zebra'], 'ze', 0)).toBe(0)
  })

  it('starts looking at the current option for a prefix, and wraps round the list', () => {
    expect(findTypeahead(FRUIT, 'ba', 1)).toBe(1)
    expect(findTypeahead(FRUIT, 'ba', 2)).toBe(1)
    expect(findTypeahead(FRUIT, 'a', -1)).toBe(0)
  })

  it('moves on to the next match when one letter is repeated', () => {
    expect(findTypeahead(FRUIT, 'b', 1)).toBe(2)
    expect(findTypeahead(FRUIT, 'bb', 1)).toBe(2)
    expect(findTypeahead(FRUIT, 'b', 2)).toBe(1)
    expect(findTypeahead(FRUIT, 'cc', 3)).toBe(3)
  })

  it('finds nothing in an empty list or for a prefix nothing has', () => {
    expect(findTypeahead([], 'a', 0)).toBe(-1)
    expect(findTypeahead(FRUIT, 'z', 0)).toBe(-1)
    expect(findTypeahead(FRUIT, 'bx', 0)).toBe(-1)
  })

  it('treats spaces as part of the name', () => {
    const labels = ['Low pass', 'Low shelf', 'High pass']
    expect(findTypeahead(labels, 'low s', 0)).toBe(1)
  })
})

describe('placePopup', () => {
  const view = { viewportWidth: 1000, viewportHeight: 800 }
  const anchor = (top: number, left = 100, width = 120) => ({ left, top, bottom: top + 24, width })

  it('opens under the trigger when the list fits there', () => {
    const p = placePopup({ ...view, anchor: anchor(100), naturalHeight: 200, listWidth: 150 })
    expect(p).toEqual({ left: 100, top: 124 + 4, minWidth: 120, maxHeight: 200 })
  })

  it('opens under the trigger when there is more room below, even if the list does not fit', () => {
    const p = placePopup({ ...view, anchor: anchor(100), naturalHeight: 5000, listWidth: 150 })
    expect(p.top).toBe(128)
    expect(p.maxHeight).toBe(320)
  })

  it('flips above when the list does not fit below and there is more room above', () => {
    const p = placePopup({ ...view, anchor: anchor(700), naturalHeight: 200, listWidth: 150 })
    expect(p.maxHeight).toBe(200)
    expect(p.top).toBe(700 - 4 - 200)
  })

  it('limits the height to the room it has, and to the maximum', () => {
    const short = { viewportWidth: 1000, viewportHeight: 400 }
    const below = placePopup({ ...short, anchor: anchor(150), naturalHeight: 600, listWidth: 150 })
    expect(below.maxHeight).toBe(400 - 8 - 4 - 174)
    expect(below.top).toBe(174 + 4)

    const above = placePopup({ ...short, anchor: anchor(300), naturalHeight: 600, listWidth: 150 })
    expect(above.maxHeight).toBe(300 - 8 - 4)
    expect(above.top).toBe(8)

    const roomy = placePopup({ ...view, anchor: anchor(10), naturalHeight: 600, listWidth: 150 })
    expect(roomy.maxHeight).toBe(320)
  })

  it('stays inside the viewport sideways, allowing for a list wider than its trigger', () => {
    const left = placePopup({ ...view, anchor: anchor(100, -50), naturalHeight: 100, listWidth: 150 })
    expect(left.left).toBe(8)

    const right = placePopup({ ...view, anchor: anchor(100, 950), naturalHeight: 100, listWidth: 200 })
    expect(right.left).toBe(1000 - 8 - 200)

    const wideTrigger = placePopup({ ...view, anchor: anchor(100, 950, 300), naturalHeight: 100, listWidth: 100 })
    expect(wideTrigger.left).toBe(1000 - 8 - 300)
    expect(wideTrigger.minWidth).toBe(300)
  })
})

describe('useTypeahead', () => {
  const setup = () => renderHook(() => useTypeahead(FRUIT)).result

  it('builds one search from letters typed close together', () => {
    const hook = setup()
    expect(hook.current.search('b', 1000, 0)).toBe(1)
    expect(hook.current.search('l', 1100, 1)).toBe(2)
    expect(hook.current.search('u', 1200, 2)).toBe(2)
  })

  it('starts a new search after a pause', () => {
    const hook = setup()
    expect(hook.current.search('b', 1000, 0)).toBe(1)
    expect(hook.current.search('l', 1100, 1)).toBe(2)
    // 600 ms later "bl" would still extend; this is the first letter of a new search.
    expect(hook.current.search('c', 1700, 2)).toBe(3)
    expect(hook.current.search('c', 1701, 3)).toBe(3)
  })

  it('steps through matches for a repeated letter', () => {
    const hook = setup()
    expect(hook.current.search('b', 1000, 0)).toBe(1)
    expect(hook.current.search('b', 1100, 1)).toBe(2)
    expect(hook.current.search('b', 1200, 2)).toBe(1)
  })

  it('knows whether a key would continue the search in progress', () => {
    const hook = setup()
    expect(hook.current.isTyping(0)).toBe(false)
    act(() => { hook.current.search('a', 1000, 0) })
    expect(hook.current.isTyping(1599)).toBe(true)
    expect(hook.current.isTyping(1600)).toBe(false)
  })

  it('keeps each control\'s search to itself', () => {
    const a = setup()
    const b = setup()
    a.current.search('c', 1000, 0)
    expect(a.current.isTyping(1100)).toBe(true)
    expect(b.current.isTyping(1100)).toBe(false)
  })

  it('searches the labels it was given last', () => {
    const labels = { current: ['Alpha', 'Beta'] }
    const { result, rerender } = renderHook(() => useTypeahead(labels.current))
    expect(result.current.search('b', 1000, 0)).toBe(1)
    labels.current = ['Beta', 'Bravo']
    rerender()
    // Still the same search: "b" then "r" now lands on the new list's Bravo.
    expect(result.current.search('r', 1100, 0)).toBe(1)
  })
})

describe('usePopupPosition', () => {
  const rectOf = (top: number) => (): DOMRect =>
    ({ left: 100, top, bottom: top + 24, width: 120, height: 24, right: 220, x: 100, y: top, toJSON: () => ({}) })

  function mount(open: boolean) {
    const onDismiss = vi.fn()
    const trigger = document.createElement('button')
    const list = document.createElement('div')
    document.body.append(trigger, list)
    let top = 100
    trigger.getBoundingClientRect = () => rectOf(top)()
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 200 })
    Object.defineProperty(list, 'offsetWidth', { configurable: true, value: 150 })
    const hook = renderHook((props: { open: boolean }) => usePopupPosition(props.open, onDismiss), { initialProps: { open } })
    hook.result.current.triggerRef.current = trigger
    hook.result.current.listRef.current = list
    return { ...hook, onDismiss, trigger, list, moveTrigger: (to: number) => { top = to } }
  }

  afterEach(() => { document.body.innerHTML = '' })

  it('has no position until the list is open and measured', () => {
    const { result, rerender } = mount(false)
    expect(result.current.position).toBeNull()
    rerender({ open: true })
    expect(result.current.position).toEqual({ left: 100, top: 128, minWidth: 120, maxHeight: 200 })
  })

  it('places the list again when the page scrolls, but not when the list itself does', () => {
    const { result, rerender, moveTrigger, list } = mount(false)
    rerender({ open: true })
    moveTrigger(300)

    act(() => { list.dispatchEvent(new Event('scroll')) })
    expect(result.current.position?.top).toBe(128)

    act(() => { window.dispatchEvent(new Event('scroll')) })
    expect(result.current.position?.top).toBe(328)
  })

  it('dismisses on a resize while open, and not after it has closed', () => {
    const { rerender, onDismiss } = mount(false)
    rerender({ open: true })
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    rerender({ open: false })
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('forgets the position when closed, so the next opening is measured afresh', () => {
    const { result, rerender, moveTrigger } = mount(false)
    rerender({ open: true })
    expect(result.current.position).not.toBeNull()
    rerender({ open: false })
    expect(result.current.position).toBeNull()

    moveTrigger(500)
    rerender({ open: true })
    expect(result.current.position?.top).toBe(528)
  })
})
