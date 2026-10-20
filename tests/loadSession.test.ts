// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { loadSession, SESSION_STORAGE_KEY } from '@/ui/loadSession.ts'
import { generateDrift } from '@/generate/generateDrift.ts'

afterEach(() => localStorage.clear())

describe('loadSession', () => {
  it('opens a first launch on the drift its name generates', () => {
    const session = loadSession()
    const generated = generateDrift(session.seedName)
    expect(session.macros).toEqual(generated.macros)
    expect(session.slots).toEqual(generated.slots)
    expect(session.song).toEqual(generated.song)
    expect(session.projectName).toBe(session.seedName)
  })

  it('falls back to a generated drift when the store is unreadable', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{not json')
    const session = loadSession()
    expect(session.macros).toEqual(generateDrift(session.seedName).macros)
  })
})
