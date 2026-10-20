// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { LaneEditor } from '@/ui/rack/LaneEditor.tsx'
import { makeLane } from '@/automation/lane.ts'
import { instrumentById } from '@/instruments/registry.ts'
import type { Lane } from '@/automation/lane.ts'

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => null
  Element.prototype.scrollIntoView = () => {}
})

afterEach(cleanup)

function setup(bars = 4) {
  const onChange = vi.fn<(lane: Lane) => void>()
  const lane: Lane = { ...makeLane('l', { kind: 'expression', key: 'motion' }), bars }
  render(<LaneEditor lane={lane} def={instrumentById('pad')!} accent="#fff" phase={0} onChange={onChange} onRemove={() => {}} />)
  const input = screen.getByLabelText('Loop length in bars') as HTMLInputElement
  const lastBars = (): number => onChange.mock.lastCall![0].bars
  return { input, onChange, lastBars }
}

describe('LaneEditor loop length', () => {
  it('shows the lane\'s length', () => {
    expect(setup(16).input.value).toBe('16')
  })

  it('shows what is typed until it is committed', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: '12' } })
    expect(input.value).toBe('12')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits on blur and on Enter, and goes back to the lane\'s own length', () => {
    const { input, onChange, lastBars } = setup(4)
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.blur(input)
    expect(lastBars()).toBe(12)
    expect(input.value).toBe('4')

    fireEvent.change(input, { target: { value: '24' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lastBars()).toBe(24)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('does not commit on other keys', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.keyDown(input, { key: 'a' })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a typed length between a quarter bar and 1024', () => {
    const { input, lastBars } = setup()
    fireEvent.change(input, { target: { value: '0.1' } })
    fireEvent.blur(input)
    expect(lastBars()).toBe(0.25)
    fireEvent.change(input, { target: { value: '5000' } })
    fireEvent.blur(input)
    expect(lastBars()).toBe(1024)
  })

  it('ignores a length that is not a positive number', () => {
    const { input, onChange } = setup(8)
    for (const text of ['0', '-3', '']) {
      fireEvent.change(input, { target: { value: text } })
      fireEvent.blur(input)
    }
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('8')
  })

  it('takes a one-tap length from the buttons', () => {
    const { onChange, lastBars } = setup(4)
    fireEvent.click(screen.getByRole('button', { name: '64' }))
    expect(lastBars()).toBe(64)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
