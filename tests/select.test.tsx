// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { Select } from '@/ui/Select.tsx'
import type { SelectItem } from '@/ui/types.ts'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

afterEach(cleanup)

const FLAT: SelectItem<string>[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry' },
  { value: 'cherry', label: 'Cherry' },
]

const GROUPED: SelectItem<string>[] = [
  { group: 'Fruit', options: [{ value: 'apple', label: 'Apple' }, { value: 'pear', label: 'Pear', mark: '#f00', note: 'automated' }] },
  { group: 'Veg', options: [{ value: 'leek', label: 'Leek' }, { value: 'kale', label: 'Kale' }] },
]

function setup(props: Partial<Parameters<typeof Select<string>>[0]> = {}) {
  const onChange = vi.fn<(value: string) => void>()
  const view = render(<Select value="banana" items={FLAT} onChange={onChange} label="Fruit" {...props} />)
  const trigger = (): HTMLElement => screen.getByRole('combobox')
  const options = (): HTMLElement[] => screen.queryAllByRole('option')
  const active = (): string | null => {
    const id = trigger().getAttribute('aria-activedescendant')
    return id ? document.getElementById(id)?.textContent?.replace('✓', '') ?? null : null
  }
  const key = (k: string, init: KeyboardEventInit = {}): void => { fireEvent.keyDown(trigger(), { key: k, ...init }) }
  return { ...view, onChange, trigger, options, active, key }
}

describe('Select trigger', () => {
  it('shows the chosen option, named by its label', () => {
    const { trigger } = setup()
    expect(trigger().textContent).toContain('Banana')
    expect(trigger().getAttribute('aria-label')).toBe('Fruit: Banana')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows a placeholder instead for a menu that does something, and keeps its own name', () => {
    const { trigger } = setup({ value: null, placeholder: '+ add' })
    expect(trigger().textContent).toContain('+ add')
    expect(trigger().getAttribute('aria-label')).toBe('Fruit')
  })

  it('reads a note after the chosen label for assistive technology', () => {
    const { trigger } = setup({ value: 'pear', items: GROUPED })
    expect(trigger().getAttribute('aria-label')).toBe('Fruit: Pear, automated')
  })
})

describe('Select list', () => {
  it('opens on a click, with the chosen option marked and active', () => {
    const { trigger, options, active } = setup()
    fireEvent.click(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('listbox', { name: 'Fruit' })).toBeTruthy()
    expect(options().map((o) => o.textContent?.replace('✓', ''))).toEqual(['Apple', 'Banana', 'Blueberry', 'Cherry'])
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false'])
    expect(active()).toBe('Banana')
  })

  it('chooses an option on a click, closes, and hands focus back', () => {
    const { trigger, onChange } = setup()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('option', { name: 'Cherry' }))
    expect(onChange).toHaveBeenCalledWith('cherry')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('does not report choosing what is already chosen', () => {
    const { trigger, onChange } = setup()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('option', { name: 'Banana' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows groups with headings, numbering options straight through them', () => {
    const { trigger, options, key, active } = setup({ value: 'apple', items: GROUPED })
    fireEvent.click(trigger())
    const veg = within(screen.getByRole('group', { name: 'Veg' }))
    expect(veg.getAllByRole('option').map((o) => o.textContent)).toEqual(['Leek', 'Kale'])
    expect(options()).toHaveLength(4)
    key('End')
    expect(active()).toBe('Kale')
  })

  it('reads an option note aloud and draws its mark', () => {
    const { trigger } = setup({ items: GROUPED, value: 'apple' })
    fireEvent.click(trigger())
    const pear = screen.getByRole('option', { name: 'Pear, automated' })
    expect(pear.querySelector<HTMLElement>('.automated-dot')?.style.background).toBe('rgb(255, 0, 0)')
  })

  it('closes on a press elsewhere without choosing, and on blur', () => {
    const { trigger, onChange } = setup()
    fireEvent.click(trigger())
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.click(trigger())
    expect(screen.queryByRole('listbox')).not.toBeNull()
    fireEvent.blur(trigger())
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a press inside the list from closing it', () => {
    const { trigger } = setup()
    fireEvent.click(trigger())
    fireEvent.pointerDown(screen.getByRole('listbox'))
    expect(screen.queryByRole('listbox')).not.toBeNull()
  })
})

describe('Select keyboard', () => {
  it('opens on the arrows, Enter and Space', () => {
    for (const k of ['ArrowDown', 'ArrowUp', 'Enter', ' ']) {
      const { key, active, unmount } = setup()
      key(k)
      expect(screen.queryByRole('listbox')).not.toBeNull()
      expect(active()).toBe('Banana')
      unmount()
    }
  })

  it('moves through the options and stops at the ends', () => {
    const { key, active } = setup()
    key('ArrowDown')
    key('ArrowDown')
    expect(active()).toBe('Blueberry')
    key('ArrowDown')
    key('ArrowDown')
    expect(active()).toBe('Cherry')
    key('ArrowUp')
    expect(active()).toBe('Blueberry')
    key('Home')
    expect(active()).toBe('Apple')
    key('ArrowUp')
    expect(active()).toBe('Apple')
    key('End')
    expect(active()).toBe('Cherry')
  })

  it('pages eight at a time', () => {
    const many: SelectItem<string>[] = Array.from({ length: 20 }, (_, i) => ({ value: `o${i}`, label: `Option ${i}` }))
    const { key, active } = setup({ items: many, value: 'o0' })
    key('Enter')
    key('PageDown')
    expect(active()).toBe('Option 8')
    key('PageDown')
    key('PageDown')
    expect(active()).toBe('Option 19')
    key('PageUp')
    expect(active()).toBe('Option 11')
  })

  it('chooses the active option on Enter or Space, and closes on Escape or Tab', () => {
    const entered = setup()
    entered.key('ArrowDown')
    entered.key('ArrowDown')
    entered.key('Enter')
    expect(entered.onChange).toHaveBeenCalledWith('blueberry')
    expect(screen.queryByRole('listbox')).toBeNull()
    cleanup()

    const spaced = setup()
    spaced.key('ArrowDown')
    spaced.key('ArrowUp')
    spaced.key(' ')
    expect(spaced.onChange).toHaveBeenCalledWith('apple')
    cleanup()

    const escaped = setup()
    escaped.key('ArrowDown')
    escaped.key('Escape')
    expect(escaped.onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
    cleanup()

    const tabbed = setup()
    tabbed.key('ArrowDown')
    tabbed.key('Tab')
    expect(tabbed.onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('moves the active option with the pointer', () => {
    const { trigger, active } = setup()
    fireEvent.click(trigger())
    fireEvent.pointerMove(screen.getByRole('option', { name: 'Apple' }))
    expect(active()).toBe('Apple')
  })
})

describe('Select type-to-jump', () => {
  it('opens the list on the first match when typing on the closed trigger', () => {
    const { key, active } = setup({ value: 'apple' })
    key('c')
    expect(screen.queryByRole('listbox')).not.toBeNull()
    expect(active()).toBe('Cherry')
  })

  it('stays on the chosen option when nothing matches', () => {
    const { key, active } = setup()
    key('z')
    expect(screen.queryByRole('listbox')).not.toBeNull()
    expect(active()).toBe('Banana')
  })

  it('narrows to a longer prefix as letters arrive together', () => {
    const { key, active } = setup({ value: 'apple' })
    key('b')
    expect(active()).toBe('Banana')
    key('l')
    expect(active()).toBe('Blueberry')
  })

  it('steps through the options starting with one letter pressed again', () => {
    const { key, active } = setup({ value: 'apple' })
    key('b')
    expect(active()).toBe('Banana')
    key('b')
    expect(active()).toBe('Blueberry')
    key('b')
    expect(active()).toBe('Banana')
  })

  it('takes a space mid-search as part of the name', () => {
    const items: SelectItem<string>[] = [
      { value: 'a1', label: 'A one' }, { value: 'a2', label: 'A two' }, { value: 'b', label: 'Beta' },
    ]
    const { key, active, onChange } = setup({ items, value: 'b' })
    key('a')
    expect(active()).toBe('A one')
    key(' ')
    key('t')
    expect(onChange).not.toHaveBeenCalled()
    expect(active()).toBe('A two')
  })

  it('chooses on a space once typing has paused', () => {
    const { key, active, onChange } = setup({ value: 'apple' })
    key('ArrowDown')
    key('ArrowDown')
    expect(active()).toBe('Banana')
    key(' ')
    expect(onChange).toHaveBeenCalledWith('banana')
  })

  it('ignores modified keys', () => {
    const { key, active } = setup({ value: 'apple' })
    key('ArrowDown')
    expect(active()).toBe('Apple')
    key('b', { ctrlKey: true })
    key('b', { metaKey: true })
    key('b', { altKey: true })
    expect(active()).toBe('Apple')
    key('b')
    expect(active()).toBe('Banana')
  })
})
