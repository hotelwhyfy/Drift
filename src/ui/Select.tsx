import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption<T extends string> {
  value: T
  label: string
  /** A dot in this colour before the label — automation acting on it, say. */
  mark?: string
  /** Read after the label by assistive technology, for what the mark means. */
  note?: string
}

export interface SelectGroup<T extends string> {
  group: string
  options: readonly SelectOption<T>[]
}

export type SelectItem<T extends string> = SelectOption<T> | SelectGroup<T>

interface Props<T extends string> {
  /** The chosen option, or null for an action menu that has none. */
  value: T | null
  items: readonly SelectItem<T>[]
  onChange: (value: T) => void
  /** The control's accessible name. */
  label: string
  /**
   * Shown on the trigger in place of the chosen option: for a menu that does
   * something, like "+ automation lane", rather than holds a value.
   */
  placeholder?: string
  className?: string
}

const isGroup = <T extends string>(item: SelectItem<T>): item is SelectGroup<T> => 'group' in item

const GAP = 4
const GUTTER = 8
const MAX_HEIGHT = 320
/** Keys typed closer together than this build one search; further apart, a new one. */
const TYPEAHEAD_MS = 600
const PAGE = 8

/**
 * A select in the app's own voice.
 *
 * The native one draws its menu in the system's colours, ignores the accent,
 * and on most platforms shows option groups as faint indented text, which is
 * no help when the groups are what tells two "level" options apart. This one
 * opens a list on the lifted background the tooltips use, with headed groups,
 * and an optional coloured mark per option.
 *
 * It follows the select-only combobox pattern: focus stays on the trigger and
 * the active option is announced through aria-activedescendant, so the arrow
 * keys, Home and End, Page Up and Down, typing a name, Enter, Space, Escape and
 * Tab all behave as they would on a native select.
 */
export function Select<T extends string>({ value, items, onChange, label, placeholder, className }: Props<T>) {
  const id = useId()
  const listId = `${id}-list`
  const optionId = (i: number): string => `${id}-o${i}`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number; maxHeight: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: -Infinity })

  const flat = useMemo(() => items.flatMap((item) => (isGroup(item) ? item.options : [item])), [items])
  const selectedIndex = flat.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? flat[selectedIndex] : undefined

  const close = useCallback(() => {
    setOpen(false)
    setPos(null)
  }, [])

  const openAt = (index: number): void => {
    setActive(index >= 0 ? index : 0)
    setOpen(true)
  }

  const choose = (index: number): void => {
    const option = flat[index]
    close()
    triggerRef.current?.focus()
    if (option && option.value !== value) onChange(option.value)
  }

  /**
   * Type-to-jump. Letters typed in quick succession search by prefix; one
   * letter repeated steps through the options starting with it, as a native
   * select does.
   */
  const search = (ch: string, at: number, from: number): number => {
    const t = typed.current
    t.text = at - t.at < TYPEAHEAD_MS ? t.text + ch.toLowerCase() : ch.toLowerCase()
    t.at = at
    const repeating = [...t.text].every((c) => c === t.text[0])
    const needle = repeating ? t.text[0] : t.text
    const start = repeating ? from + 1 : Math.max(0, from)
    for (let k = 0; k < flat.length; k++) {
      const i = (start + k) % flat.length
      if (flat[i].label.toLowerCase().startsWith(needle)) return i
    }
    return -1
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const take = (): void => {
      e.preventDefault()
      // Space would otherwise reach the global play/pause shortcut.
      e.stopPropagation()
    }
    const printable = e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey
    const typing = e.timeStamp - typed.current.at < TYPEAHEAD_MS

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        take()
        openAt(selectedIndex)
      } else if (printable) {
        take()
        const found = search(e.key, e.timeStamp, selectedIndex)
        openAt(found >= 0 ? found : selectedIndex)
      }
      return
    }

    const last = flat.length - 1
    switch (e.key) {
      case 'ArrowDown': take(); setActive((a) => Math.min(last, a + 1)); return
      case 'ArrowUp': take(); setActive((a) => Math.max(0, a - 1)); return
      case 'Home': take(); setActive(0); return
      case 'End': take(); setActive(last); return
      case 'PageDown': take(); setActive((a) => Math.min(last, a + PAGE)); return
      case 'PageUp': take(); setActive((a) => Math.max(0, a - PAGE)); return
      case 'Escape': take(); close(); return
      case 'Tab': close(); return
      case 'Enter': take(); choose(active); return
      case ' ':
        // Mid-search, a space is part of the name being typed.
        if (!typing) {
          take()
          choose(active)
          return
        }
    }
    if (printable) {
      take()
      const found = search(e.key, e.timeStamp, active)
      if (found >= 0) setActive(found)
    }
  }

  // Measure the list after it renders (hidden), then put it under the trigger,
  // or above when there is more room there, clamped to the viewport.
  const place = useCallback(() => {
    const trigger = triggerRef.current
    const list = listRef.current
    if (!trigger || !list) return
    const a = trigger.getBoundingClientRect()
    const natural = list.scrollHeight
    const below = window.innerHeight - GUTTER - GAP - a.bottom
    const above = a.top - GUTTER - GAP
    const down = natural <= below || below >= above
    const maxHeight = Math.min(natural, MAX_HEIGHT, down ? below : above)
    const width = Math.max(list.offsetWidth, a.width)
    setPos({
      left: Math.max(GUTTER, Math.min(a.left, window.innerWidth - GUTTER - width)),
      top: down ? a.bottom + GAP : a.top - GAP - maxHeight,
      minWidth: a.width,
      maxHeight,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    // Panels scroll inside .app rather than the window, so listen in the
    // capture phase — but not to the list's own scrolling.
    const onScroll = (e: Event): void => { if (e.target !== listRef.current) place() }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
    // Not keyed on items: callers build them afresh every render, and a
    // re-measure on each would loop through setPos.
  }, [open, place, close])

  // A press anywhere else closes the list without choosing.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, close])

  useEffect(() => {
    if (!open || active < 0) return
    document.getElementById(`${id}-o${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, pos, id])

  let index = 0
  const renderOption = (option: SelectOption<T>): ReactNode => {
    const i = index++
    const chosen = option.value === value
    return (
      <div
        key={option.value}
        id={optionId(i)}
        role="option"
        aria-selected={chosen}
        aria-label={option.note ? `${option.label}, ${option.note}` : undefined}
        className={`select-option ${i === active ? 'active' : ''} ${chosen ? 'chosen' : ''}`}
        onPointerMove={() => setActive(i)}
        onClick={() => choose(i)}
      >
        <span className="select-check" aria-hidden="true">{chosen ? '✓' : ''}</span>
        {option.mark && <span className="automated-dot" style={{ background: option.mark }} aria-hidden="true" />}
        {option.label}
      </div>
    )
  }

  const shown = placeholder ?? selected?.label ?? ''
  const name = placeholder !== undefined || !selected
    ? label
    : `${label}: ${selected.label}${selected.note ? `, ${selected.note}` : ''}`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={name}
        className={`select ${open ? 'open' : ''} ${className ?? ''}`}
        onClick={() => (open ? close() : openAt(selectedIndex))}
        onKeyDown={onKeyDown}
        onBlur={close}
      >
        {placeholder === undefined && selected?.mark && (
          <span className="automated-dot" style={{ background: selected.mark }} aria-hidden="true" />
        )}
        <span className="select-value">{shown}</span>
        <svg className="select-chevron" viewBox="0 0 8 5" aria-hidden="true">
          <path d="M1 1l3 3 3-3" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="select-list"
          style={pos
            ? { left: pos.left, top: pos.top, minWidth: pos.minWidth, maxHeight: pos.maxHeight }
            : { left: 0, top: 0, visibility: 'hidden' }}
          // Pressing an option must not take focus from the trigger, or the
          // blur would close the list before the click lands.
          onPointerDown={(e) => e.preventDefault()}
        >
          {items.map((item, g) => (isGroup(item) ? (
            // By position: two instruments can share a name.
            <div key={`g${g}`} role="group" aria-label={item.group}>
              <div className="select-group" aria-hidden="true">{item.group}</div>
              {item.options.map(renderOption)}
            </div>
          ) : renderOption(item)))}
        </div>,
        document.body,
      )}
    </>
  )
}
