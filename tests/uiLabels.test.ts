import { describe, it, expect } from 'vitest'
import { formatDuration } from '@/ui/formatDuration.ts'
import { targetLabel } from '@/ui/targetLabel.ts'
import { makeLane } from '@/automation/lane.ts'
import type { SlotDesc } from '@/engine/types.ts'
import { NEUTRAL } from '@/fuzzy/expression.ts'

const slot = (defId: string): SlotDesc => ({
  id: `${defId}-0`, defId, name: defId, level: 0.8, muted: false, soloed: false,
  expression: { ...NEUTRAL }, follow: 1, lanes: [], knobs: {},
})

describe('formatDuration', () => {
  it('writes minutes and zero-padded seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(59.9)).toBe('0:59')
    expect(formatDuration(61)).toBe('1:01')
    expect(formatDuration(3600)).toBe('60:00')
  })
})

describe('targetLabel', () => {
  it('names what a lane drives', () => {
    const rhodes = slot('rhodes')
    expect(targetLabel(rhodes, makeLane('a', { kind: 'level' }))).toBe('level')
    expect(targetLabel(rhodes, makeLane('b', { kind: 'expression', key: 'motion' }))).toBe('motion')
    expect(targetLabel(rhodes, makeLane('c', { kind: 'param', param: 'tone' }))).toBe('tone')
  })

  it('falls back to the raw parameter name for one the instrument lacks', () => {
    expect(targetLabel(slot('rhodes'), makeLane('d', { kind: 'param', param: 'gone' }))).toBe('gone')
    expect(targetLabel(slot('nothing'), makeLane('e', { kind: 'param', param: 'tone' }))).toBe('tone')
  })
})
