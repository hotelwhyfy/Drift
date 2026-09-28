# The mood version

`mood.html` — one question, then it plays. Shares the whole engine with the
prototype at `index.html`; the only existing file it touches is `vite.config.ts`,
which gains a second build entry.

```
npm run dev     # prototype: /   mood version: /mood.html
```

## The shape of it

1. A question, rotated from a pool of eight (`prompts.ts`). Which question gets
   asked changes what kind of answer comes back — "how are you feeling" gets an
   emotional state, "what are you in the mood to hear" gets a sonic description,
   "where would you like to be" gets a place — and all three have to land in the
   same space.
2. The answer is read into an expression position plus valence and arousal
   (`interpret.ts`).
3. That becomes a whole arrangement: the six dials, which instruments are in the
   room, their character, their automation, and the seed (`arrange.ts`).
4. The music starts, and over the next 7–17 minutes eases from where the answer
   was toward somewhere calmer (`journey.ts`).

## Reading an answer

Four things change the meaning of a short reply, and all four are handled:

| | |
|---|---|
| intensity | "very tired" is further from neutral than "tired" |
| diminishment | "a bit tired" is closer to it |
| negation | "not tired" reflects *through* neutral rather than damping toward it |
| contrast | "tired **but** hopeful" weights what follows the "but" at 2.2× |

That last one matters most. The commonest shape of an honest answer is a
complaint followed by a qualification, and a plain average lands between the two
and describes neither.

Phrases are matched before single words, because several of the commonest
answers mean the opposite of their parts — "too much" is not an intensified
"much", and "not bad" is not the negation of "bad".

Unrecognised text is never refused. The words themselves become the seed, so
even nonsense produces a specific, repeatable piece; it simply starts from
neutral. A question with wrong answers would be a quiz.

Typos are caught by bigram similarity against the mood table, then by the
prototype's trigram matching against the sonic one. "exausted" lands on
"exhausted".

## Meeting, then leaving

Someone who answers "anxious" gets anxious music — tense, restless, busy — and
then, over the following quarter of an hour, gets taken out of it. Mirroring
alone would make a relaxation tool that winds you up; jumping straight to calm
would make the question decorative, since the answer would change nothing.

The trajectory is one-way and lives outside the engine, in wall-clock time,
because it is about how long a person has been sitting with something rather
than a number of bars. It holds still for the first fifth — arriving and being
immediately moved somewhere else reads as not having been heard — then eases
across and settles slowly.

Two guarantees:

- **It never ends somewhere more agitated than it began.** Motion and tension
  only ever fall. Lerping them toward a fixed "restful" level would add movement
  to an answer that was already inert, handing someone who said they felt numb
  more activity than they asked for. Gentle life in a static piece is the
  per-instrument random walks' job, not the journey's.
- **It stops the moment anyone touches a control.** The journey is a suggestion,
  and continuing to drag the dials out from under someone who has taken hold of
  them would be indefensible.

## What the answer decides

Presence is the loudest decision here. An answer of "exhausted" that comes back
with a drum kit has not listened, however soft the kit is — so instruments are
genuinely absent below their thresholds rather than merely quiet:

| instrument | when |
|---|---|
| Pad, Bed | always — something must hold the harmony and the room |
| Sub | weight above 0.3 |
| Rhodes | any real density and conviction |
| Kit | **arousal above 0.45 only** |
| Glass | brightness above 0.58, or an edge that wants somewhere to go |
| Dust | heavy, worn, or low-valence answers |

Automation on these is all non-repeating — random walks, never drawn curves. A
drawn loop would carry the music back to where it started every few minutes,
which is the opposite of a journey.

## Adding vocabulary

`moodLexicon.ts` is the feeling words; `src/fuzzy/lexicon.ts` (the prototype's)
is the sonic ones. Both are consulted. Mood entries carry seven numbers:

```
[brightness, weight, motion, tension, density, valence, arousal]
```

Valence and arousal are the two axes affect research agrees on, and they are
what the journey needs — how far to travel and in which direction is a question
about those rather than about timbre.

When a word sounds wrong, fix its line. The tests assert the properties that
matter (no kit for exhausted answers, resting never more agitated, every dial in
range for every known word), not the individual numbers.
