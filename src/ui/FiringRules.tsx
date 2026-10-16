import type { Rule } from '@/fuzzy/types.ts'

interface Props {
  firing: readonly { rule: Rule; strength: number }[]
}

/** The rules currently shaping the sound, as the sentences they are written as. */
export function FiringRules({ firing }: Props) {
  if (firing.length === 0) return null
  return (
    <div className="rules">
      {firing.map((f, i) => (
        <div key={i} className="rule" style={{ opacity: 0.35 + f.strength * 0.65 }}>
          <em>if</em>{' '}
          {Object.entries(f.rule.when).map(([k, v]) => `${k} is ${v}`).join(' and ')}{' '}
          <em>then</em>{' '}
          {Object.entries(f.rule.then).map(([k, v]) => `${k} is ${v}`).join(', ')}
        </div>
      ))}
    </div>
  )
}
