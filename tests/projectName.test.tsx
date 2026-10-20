// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ProjectName } from '@/ui/header/ProjectName.tsx'

afterEach(cleanup)

function setup(value = 'pearl-willow-60') {
  const onRename = vi.fn<(name: string) => void>()
  render(<ProjectName value={value} seed="pearl-willow-60" onRename={onRename} />)
  const input = screen.getByLabelText<HTMLInputElement>('Project name')
  return { onRename, input }
}

describe('ProjectName', () => {
  it('keeps the typed name when the field loses focus, trimmed', () => {
    const { onRename, input } = setup()
    fireEvent.change(input, { target: { value: '  midnight garden ' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('midnight garden')
  })

  it('keeps the typed name on Enter', () => {
    const { onRename, input } = setup()
    fireEvent.change(input, { target: { value: 'midnight garden' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // jsdom does not blur on blur(); the real browser fires it, so stand in for it.
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith('midnight garden')
  })

  it('puts the old name back on Escape, even though the field then blurs', () => {
    const { onRename, input } = setup()
    fireEvent.change(input, { target: { value: 'midnight garden' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(onRename).not.toHaveBeenCalled()
    expect(input.value).toBe('pearl-willow-60')
  })

  it('puts the name back when left empty or unchanged', () => {
    const { onRename, input } = setup()
    fireEvent.blur(input)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(onRename).not.toHaveBeenCalled()
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
