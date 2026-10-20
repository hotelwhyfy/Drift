// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DriftName } from '@/ui/header/DriftName.tsx'

afterEach(cleanup)

function setup(value = 'pearl-willow-60') {
  const onCommit = vi.fn<(name: string) => void>()
  render(<DriftName value={value} onCommit={onCommit} />)
  const input = screen.getByLabelText<HTMLInputElement>('Drift name')
  return { onCommit, input }
}

describe('DriftName', () => {
  it('builds the typed drift on Enter, trimmed', () => {
    const { onCommit, input } = setup()
    fireEvent.change(input, { target: { value: '  midnight garden ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('midnight garden')
  })

  it('puts the name back on blur without building anything', () => {
    const { onCommit, input } = setup()
    fireEvent.change(input, { target: { value: 'midnight garden' } })
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('pearl-willow-60')
  })

  it('puts the name back on Escape without building anything', () => {
    const { onCommit, input } = setup()
    fireEvent.change(input, { target: { value: 'midnight garden' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('pearl-willow-60')
  })

  it('does nothing on Enter with the same name or an empty one', () => {
    const { onCommit, input } = setup()
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('pearl-willow-60')
  })

  it('keeps Space from reaching the play shortcut', () => {
    const { input } = setup()
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    fireEvent.keyDown(input, { key: ' ' })
    window.removeEventListener('keydown', onWindowKey)
    expect(onWindowKey).not.toHaveBeenCalled()
  })
})
