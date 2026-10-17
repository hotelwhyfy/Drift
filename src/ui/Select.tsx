import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePopupPosition } from '@/ui/hooks/usePopupPosition.ts'
import { useTypeahead } from '@/ui/hooks/useTypeahead.ts'
import type { SelectOption, SelectGroup, SelectItem } from '@/ui/types.ts'

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

  const flat = useMemo(() => items.flatMap((item) => (isGroup(item) ? item.options : [item])), [items])
  const selectedIndex = flat.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? flat[selectedIndex] : undefined

  const close = useCallback(() => setOpen(false), [])
  const { triggerRef, listRef, position } = usePopupPosition(open, close)
  const labels = useMemo(() => flat.map((o) => o.label), [flat])
  const { search, isTyping } = useTypeahead(labels)

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

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const take = (): void => {
      e.preventDefault()
      // Space would otherwise reach the global play/pause shortcut.
      e.stopPropagation()
    }
    const printable = e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey
    const typing = isTyping(e.timeStamp)

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
  }, [open, active, position, id])

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
          style={position
            ? { left: position.left, top: position.top, minWidth: position.minWidth, maxHeight: position.maxHeight }
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
