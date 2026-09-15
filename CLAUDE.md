# Project conventions

## Determinism

The central guarantee: the same seed, macros and rack render bit-identically,
every time. In `src/core`, `src/dsp`, `src/voices`, `src/fuzzy`, `src/harmony`,
`src/instruments` and `src/engine`:

- Never `Math.random()`. Use `createRng`, seeded via `deriveSeed`.
- Seeds derive from stable musical coordinates — `rngAt(seed, 'bar', barIndex)`,
  never from a counter or from allocation order. Bar 400 must be the same music
  whether it was played to or seeked to.
- No `Date.now()`, `performance.now()`, or any wall-clock reference.
- No module-level mutable state in the render path; two renders can run
  concurrently in one worker.

`tests/determinism.test.ts` guards this. Treat a failure there as a real defect,
never as a test to relax.

### The control grid

All control-rate work happens when `position % CONTROL_BLOCK === 0`, and no
block straddles a bar line. This is not an optimisation. If control work
followed the caller's buffer boundaries, playback (0.4 s chunks) would dispatch
notes at different instants than a capture (2 s slices), and the export would
diverge from what was heard. Any new control-rate work goes inside
`Engine.control()`, never in the per-sample loop.

## Where decisions live

Dependencies run one way:

```
core <- dsp <- voices <- instruments <- engine <- ui
core <- fuzzy/harmony <- instruments
```

- **An instrument may not choose a pitch.** It emits `NoteIntent`; the shared
  `Resolver` decides. This is what makes "impossible to play a wrong note"
  structural rather than aspirational — don't add an escape hatch.
- **An instrument may not set its own level relative to others.** The rack does.
- Nothing in `core`, `dsp`, `voices`, `fuzzy`, `harmony`, `instruments` or
  `engine` may touch the DOM or Node built-ins. They run unchanged in a Web
  Worker and in bare Node, which is what makes the tests and `npm run audition`
  possible.

## Audio code

- Per-sample loops use indexed `for`. A `forEach` over a Float32Array runs
  48000 × channels × nodes times a second.
- Never allocate inside a per-sample loop. Hoist stereo frames and scratch
  buffers to instance fields.
- Stereo processors need one filter per channel. Sharing a filter's state
  between L and R silently mixes them.

## TypeScript

- No `as` casts. Use type annotations, generics or type guards.
- Relative imports carry the `.ts` extension, so `node --experimental-transform-types`
  runs scripts directly without a build step.
- Exported function name matches the file name. Files exporting only types or
  data tables are exempt.

## Fuzzy rule bases

A rule base is a design document that happens to execute. Keep rules readable —
`IF motion IS high THEN detune IS high` — and prefer adding a rule to
hand-tuning a curve. The `FuzzyEngine` constructor throws on a rule naming an
unknown term; that check exists because a typo would otherwise surface as an
instrument that mysteriously ignores one dimension.

Cover the middle of each input, not just the ends. A base with only `low` and
`high` rules leaves a dead zone around 0.5 where nothing fires.

## Persistence

`src/project/project.ts` is the only serialiser. The autosave and the save/open
buttons both go through it, because there must be one piece of code to get right
and it is the one with tests.

Reading is defensive by rule: validate every field, clamp every number, and fall
back rather than throw. A project file is something a person can edit, email or
keep across versions, and a file that will not open is a far worse outcome than
one that opens missing a lane.

Never `JSON.stringify` a `Float32Array` — it becomes an object with numeric keys
and no length, and nothing downstream will notice until the automation silently
stops working. Curves serialise as plain arrays; derived values like a gesture's
character are recomputed on load rather than stored, so a file cannot disagree
with itself.

## Responsiveness

The playback queue length is exactly how long a mute, solo or level change takes
to be heard. Keep `MIN_LOOKAHEAD` in `src/audio/player.ts` short and let the
adaptive growth handle slow machines; do not raise the floor to paper over an
underrun without measuring first. `window.__drift.queuedSeconds` in a dev build
reports it.

## Loudness

`levelTrim` in `src/macros/patch.ts` is a least-squares fit of measured RMS
against the macros, and it is specific to what the default rack contains and how
loud each instrument is. A stale fit is worse than none — an earlier one had
inverted and made sparse settings the loudest. After changing any instrument's
level, re-measure with `npm run audition` and re-fit.

## Verifying by ear is not optional

`npm run audition` renders every scene to `out/*.wav` and prints peak, RMS,
tempo and mode. Numbers catch clipping, silence and NaN; they do not catch music
that is merely bad. Listen before claiming a change is an improvement.
