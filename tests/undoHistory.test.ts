import { describe, it, expect } from 'vitest'
import { UndoHistory } from '@/ui/undoHistory.ts'

describe('UndoHistory', () => {
  it('walks back and forward through recorded states', () => {
    const h = new UndoHistory('a')
    h.record('b')
    h.record('c')
    expect(h.undo()).toBe('b')
    expect(h.undo()).toBe('a')
    expect(h.undo()).toBeNull()
    expect(h.current).toBe('a')
    expect(h.redo()).toBe('b')
    expect(h.redo()).toBe('c')
    expect(h.redo()).toBeNull()
  })

  it('drops the redo branch when something new is recorded', () => {
    const h = new UndoHistory('a')
    h.record('b')
    h.undo()
    h.record('x')
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toBe('a')
  })

  it('replace changes the current state without making a step', () => {
    const h = new UndoHistory('a')
    h.record('b')
    h.replace('b2')
    expect(h.current).toBe('b2')
    expect(h.undo()).toBe('a')
    expect(h.redo()).toBe('b2')
  })

  it('forgets the oldest steps past its limit', () => {
    const h = new UndoHistory(0, 3)
    for (let i = 1; i <= 5; i++) h.record(i)
    expect(h.undo()).toBe(4)
    expect(h.undo()).toBe(3)
    expect(h.undo()).toBe(2)
    expect(h.undo()).toBeNull()
  })
})
