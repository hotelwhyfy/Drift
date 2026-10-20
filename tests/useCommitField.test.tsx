// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useCommitField } from '@/ui/hooks/useCommitField.ts'

afterEach(cleanup)

function Field({ shown, commit }: { shown: string, commit: (text: string) => void }) {
  return <input aria-label="field" {...useCommitField(shown, commit).input} />
}

function setup(shown = '5') {
  const commit = vi.fn<(text: string) => void>()
  const view = render(<Field shown={shown} commit={commit} />)
  const input = (): HTMLInputElement => screen.getByLabelText('field') as HTMLInputElement
  return { ...view, commit, input }
}

describe('useCommitField', () => {
  it('shows the value it is given', () => {
    expect(setup('5').input().value).toBe('5')
  })

  it('shows what is typed, without committing it', () => {
    const { input, commit } = setup()
    fireEvent.change(input(), { target: { value: '12' } })
    expect(input().value).toBe('12')
    fireEvent.change(input(), { target: { value: '' } })
    expect(input().value).toBe('')
    expect(commit).not.toHaveBeenCalled()
  })

  it('commits the typed text on blur and goes back to the value it is given', () => {
    const { input, commit } = setup('5')
    fireEvent.change(input(), { target: { value: '12' } })
    fireEvent.blur(input())
    expect(commit).toHaveBeenCalledWith('12')
    expect(input().value).toBe('5')
  })

  it('commits on Enter and on no other key', () => {
    const { input, commit } = setup('5')
    fireEvent.change(input(), { target: { value: '7' } })
    fireEvent.keyDown(input(), { key: 'a' })
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(commit).not.toHaveBeenCalled()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith('7')
    expect(input().value).toBe('5')
  })

  it('shows the new value once the one it was given has changed', () => {
    const { input, commit, rerender } = setup('5')
    fireEvent.change(input(), { target: { value: '12' } })
    fireEvent.blur(input())
    rerender(<Field shown="12" commit={commit} />)
    expect(input().value).toBe('12')
  })

  it('follows the value it is given while nothing is being typed', () => {
    const { input, commit, rerender } = setup('5')
    rerender(<Field shown="9" commit={commit} />)
    expect(input().value).toBe('9')
  })

  it('hands over the field\'s own text when blurred untouched', () => {
    const { input, commit } = setup('5')
    fireEvent.blur(input())
    expect(commit).toHaveBeenCalledWith('5')
  })

  it('uses the latest commit function', () => {
    const first = vi.fn<(text: string) => void>()
    const second = vi.fn<(text: string) => void>()
    const { rerender } = render(<Field shown="5" commit={first} />)
    rerender(<Field shown="5" commit={second} />)
    fireEvent.blur(screen.getByLabelText('field'))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
