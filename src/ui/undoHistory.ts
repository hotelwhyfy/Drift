/**
 * Undo and redo over whole states.
 *
 * Each entry is a complete snapshot rather than a diff. The app's state is
 * immutable, so a snapshot shares everything an edit did not touch and costs
 * a handful of references; and restoring one can never drift out of step with
 * the edit that made it, which a hand-written inverse for every kind of edit
 * eventually would.
 */
export class UndoHistory<T> {
  private past: T[] = []
  private future: T[] = []
  private present: T
  private readonly limit: number

  constructor(initial: T, limit = 200) {
    this.present = initial
    this.limit = limit
  }

  get current(): T { return this.present }
  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  /** A new settled state. Anything that could have been redone is gone. */
  record(next: T): void {
    this.past.push(this.present)
    if (this.past.length > this.limit) this.past.shift()
    this.present = next
    this.future = []
  }

  /** Swaps the current state without making a step, for changes not worth undoing. */
  replace(next: T): void {
    this.present = next
  }

  undo(): T | null {
    const previous = this.past.pop()
    if (previous === undefined) return null
    this.future.push(this.present)
    this.present = previous
    return previous
  }

  redo(): T | null {
    const next = this.future.pop()
    if (next === undefined) return null
    this.past.push(this.present)
    this.present = next
    return next
  }
}
