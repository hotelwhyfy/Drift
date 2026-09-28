/**
 * The opening question.
 *
 * Rotated rather than fixed, because the question shapes the answer. "How are
 * you feeling" gets an emotional state; "what are you in the mood to hear" gets
 * a sonic description; "where would you like to be" gets a place. All three land
 * in the same expression space, and varying the question is the cheapest way to
 * keep a daily ritual from going stale.
 */
export interface Prompt {
  readonly id: string
  readonly question: string
  /** Shown in the field. Sets the register of the expected answer. */
  readonly placeholder: string
  /** One-tap answers, for when typing is too much to ask. */
  readonly offers: readonly string[]
}

export const PROMPTS: readonly Prompt[] = [
  {
    id: 'feeling',
    question: 'How are you feeling today?',
    placeholder: 'worn out, but alright',
    offers: ['tired', 'restless', 'content', 'heavy', 'hopeful'],
  },
  {
    id: 'mood-to-hear',
    question: 'What are you in the mood to hear?',
    placeholder: 'something warm and slow',
    offers: ['something warm', 'nothing much', 'rain', 'a slow pulse', 'wide and open'],
  },
  {
    id: 'day',
    question: 'How has your day been?',
    placeholder: 'long, and not over yet',
    offers: ['long', 'quiet', 'too much', 'better than expected', 'a blur'],
  },
  {
    id: 'where',
    question: 'Where would you like to be right now?',
    placeholder: 'somewhere it is already dark',
    offers: ['by the sea', 'a warm room', 'a forest', 'somewhere cold', 'nowhere'],
  },
  {
    id: 'weather',
    question: "What's the weather like in your head?",
    placeholder: 'overcast, clearing later',
    offers: ['fog', 'rain', 'still air', 'thunder', 'bright and cold'],
  },
  {
    id: 'need',
    question: 'What would help right now?',
    placeholder: 'somewhere quiet to think',
    offers: ['quiet', 'company', 'space to think', 'something steady', 'to be woken up'],
  },
  {
    id: 'carrying',
    question: 'What are you carrying today?',
    placeholder: 'more than I would like',
    offers: ['not much', 'a lot', 'something unfinished', 'good news', 'the usual'],
  },
  {
    id: 'quiet',
    question: 'What kind of quiet do you need?',
    placeholder: 'the kind with rain in it',
    offers: ['the empty kind', 'warm quiet', 'busy quiet', 'deep quiet'],
  },
]

const LAST_PROMPT_KEY = 'drift.mood.lastPrompt'

/**
 * A different question from last time.
 *
 * Remembering only the previous one is enough: the pool is large enough that
 * blocking a repeat removes the only failure anyone notices, which is being
 * asked the same thing twice in a row.
 */
export function choosePrompt(random: () => number = Math.random): Prompt {
  let last: string | null = null
  try {
    last = localStorage.getItem(LAST_PROMPT_KEY)
  } catch {
    // Private browsing; a repeat is survivable.
  }
  const pool = PROMPTS.filter((p) => p.id !== last)
  const chosen = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
  try {
    localStorage.setItem(LAST_PROMPT_KEY, chosen.id)
  } catch {
    // As above.
  }
  return chosen
}

export function promptById(id: string): Prompt | undefined {
  return PROMPTS.find((p) => p.id === id)
}
