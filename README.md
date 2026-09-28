# drift

Endless lo-fi ambient, generated in the browser. Six macro dials over a rack of
instruments that are controlled by describing them rather than by setting them.

Nothing is sampled and nothing is pre-rendered: every sound is synthesised from
scratch, forever, and the same seed and settings reproduce it exactly.

There are two front ends over one engine:

| | |
|---|---|
| `/` | the instrument — six dials, a rack, automation you draw |
| `/mood.html` | one question, then it plays. See [src/mood/README.md](src/mood/README.md) |

```
npm install
npm run dev        # http://localhost:5179  and  /mood.html
npm test           # 106 tests
npm run audition   # render every scene to out/*.wav and print the levels
npm run build
```

## The idea

Two constraints shaped everything:

**Every position must sound finished.** There are no bad corners to steer around,
which is what lets the interface be six dials instead of a mixing desk. A coarse
sweep of the macro cube is tested for exactly this — nothing clips, nothing goes
silent, and the loudness across the whole space stays inside about 1.3 dB.

**A wrong note must be unrepresentable.** Not filtered out downstream —
impossible to express in the first place. See below.

## The six dials

| Dial | Low | High |
|---|---|---|
| **Warmth** | clean and digital | tape saturation, wow, vinyl dust |
| **Colour** | dark and modal | luminous and open |
| **Space** | close and dry | vast |
| **Pulse** | beatless drone | a defined lo-fi beat |
| **Density** | one voice | lush and layered |
| **Drift** | hypnotically static | restlessly evolving |

Each dial moves dozens of engine parameters along curated curves. Three patterns
carry most of the musical judgement, all in [`src/macros/patch.ts`](src/macros/patch.ts):
`bias` holds an effect back so the first third of the travel is subtle; `ramp`
brings a parameter in over only part of the travel, so one dial can stage
several changes in sequence; `lerpExp` interpolates frequencies and times
geometrically, because the ear hears ratios rather than differences.

Colour is worth calling out: it walks the modes from Phrygian to Lydian *and*
opens the filters, so brightening the harmony and brightening the timbre are one
gesture rather than two controls to keep consistent.

## No wrong notes

Instruments never emit pitches. They emit intent — a contour, a weight, a
musical role, a position in the bar — and one shared `Resolver`
([`src/harmony/resolver.ts`](src/harmony/resolver.ts)) decides what note that is.

Because every generator goes through that one door, a wrong note is not rejected;
there is no field in which to put one. It also enables decisions no instrument
could make alone:

- **Metrical licence.** Beat one takes chord tones only. Weaker positions admit
  scale tones, and only the weakest admit a chromatic approach — and then only
  as a neighbour of a scale tone. One rule applied everywhere sounds either
  stiff or wrong; the licence has to widen as the beat weakens.
- **Collision avoidance.** Unisons, minor seconds and minor ninths between
  *different* instruments are refused, as is anything crowded below C3. The
  check is against notes that actually overlap in time, so a melodic line
  remains free to move by a semitone.
- **Priority.** Low parts claim their pitches first. A bass note displaced to
  avoid a bell is a worse outcome than the reverse.

When everything collides, the resolver returns silence, which is a better
musical answer than forcing a note nobody has room for.

## Fuzzy control

Instruments are shaped by describing them, through a real Mamdani inference
engine ([`src/fuzzy/`](src/fuzzy/)) — membership functions, a rule base, and
centroid defuzzification.

Each instrument's rule base is its design document:

```
IF motion IS high AND weight IS low  THEN detune IS high, lfoRate IS high
IF brightness IS low                 THEN tone IS low, bite IS low
```

Because the sets overlap, two half-firing rules blend their conclusions instead
of fighting over them — 0.49 brightness and 0.51 brightness cannot produce
categorically different music. The interface shows which rules are currently
firing, which is the payoff of making them readable.

Three inputs all reduce to the same five-dimensional expression space
(*brightness, weight, motion, tension, density*):

- **XY pad** — any two dimensions as one draggable point.
- **Words** — a curated lexicon of ~180 descriptors. "shimmery" isn't in it, but
  trigram matching lands it next to "shimmering"; anything genuinely unknown is
  placed by a stable hash. The interface says which of the three happened,
  because the app knows some words and should not pretend to know language.
- **Drawing** — a stroke becomes an automation curve, and the stroke's own
  character (jitter, slope, extent) is read as well as its path.

The six dials remain the master layer: they move a point in the same expression
space, and every rule base in the rack reacts in its own terms. A slot's
`follows the dials` control sets how much it is pulled along.

## Automation

Lanes target any expression dimension, any instrument parameter, or level.
Sources are drawn curves, bar-synced LFOs, and bounded random walks. The walk
matters more than it looks: a drawn loop repeats exactly, and exact repetition
is the one thing endless music cannot afford.

## Projects

Two icons in the header, plus `⌘S` / `⌘O`. Saving opens the browser's own file
dialog, so the name and the folder are chosen there rather than in a field the
app would otherwise have to carry — and whatever the file ends up called becomes
the project's name in the header. Chrome and Edge do this natively; Firefox and
Safari fall back to a plain download.

A `.drift.json` holds everything needed to reproduce a piece: macro positions,
the seed, every instrument with its expression and follow amount, and every
automation lane including the points of anything drawn by hand. Because the
engine is deterministic, that is the whole piece — the file stores no audio
because it does not need to. A saved project is a few kilobytes.

Opening restores it, and dropping a project file anywhere on the window does the
same. Reading is deliberately forgiving: every field is checked, anything
unusable falls back to a sane default, and an instrument the build does not have
is skipped with a warning rather than refusing to open the file. Losing one lane
is a much better outcome than a project that will not load.

The same serialiser backs the autosave, so what is restored on reload goes
through the code that has tests.

## Seeds

The seed is the number every random decision derives from: the chord walk, the
note choices, the drum figures. Same dials, different seed, different piece.

It is a text field, because a seed is a hash of whatever you type and there is
no reason to hide that behind a dice roll. `midnight garden` is the same music
on any machine at the same dial positions, forever — so a piece is findable
again and shareable by name. The shuffle button beside it is for when you want
somewhere to start rather than something in particular.

Changing it does not restart. The seed only governs decisions not yet made, so
setting one changes the music from the next bar onward while the current bar,
the reverb tail and every sounding note carry straight across. (It used to
rebuild the engine, which reset the bar count and emptied the reverb —
indistinguishable from pressing stop and play.)

Seeds are case- and space-sensitive: `For Anna` and `for anna` are different
pieces. That is a property of hashing the text, and a useful one.

## Capture

The engine has no notion of playback. `render` fills a buffer and advances time
by exactly that much, so the same code drives the speakers from a worker and
renders a capture faster than real time.

That equivalence is enforced rather than hoped for: all control work happens on
an absolute sample grid, so rendering in 0.4 s playback chunks is bit-identical
to rendering the same music in 2 s capture slices. A test asserts it across
wildly uneven buffer sizes. Without it, an export would quietly diverge from
what you heard — and the export would be a lie.

Bars are generated from their index rather than from a running counter, so bar
4000 is the same music whether you sat through it or seeked there. Everything
random derives from musical coordinates — `rngAt(seed, 'bar', index)` — never
from a running stream, because a stream makes a bar depend on how much was
played before it.

## Latency

Audio is rendered ahead of the speakers into a queue, and that queue length *is*
how long a mute, solo or level change takes to be heard — audio already handed to
the AudioContext cannot be revised. It sits at about 380 ms, measured, with the
floor growing automatically if a machine ever underruns. It was originally
1.6 s, which at 70 bpm is roughly half a bar and made the mixer controls feel
like they were waiting for the next bar.

In a dev build the player is exposed as `window.__drift`, so `__drift.queuedSeconds`
and `__drift.underrunCount` can be read directly.

## Layout

```
src/core/        seeded RNG, curve shaping, modes and chords
src/dsp/         filters, envelopes, oscillators, delay lines,
                 FDN reverb, tape wow/flutter, saturation, limiter
src/voices/      the sound engines: FM piano, pad, sub, kit, vinyl, beds
src/fuzzy/       membership functions, Mamdani inference, word lexicon
src/harmony/     the resolver — the no-wrong-notes guarantee
src/instruments/ instrument definitions and their rule bases
src/automation/  gesture curves and automation lanes
src/engine/      the rack, the master chain, the clock
src/macros/      the six dials and their fan-out
src/audio/       render worker, playback scheduler, WAV encoder
src/ui/          React interface
```

## Adding an instrument

Everything an instrument may decide is local to its definition; everything that
requires knowing about the other instruments belongs to the rack or the
resolver. So adding one is a single entry in
[`src/instruments/registry.ts`](src/instruments/registry.ts): a voice, a rule
base, and a pattern function returning intents. `Glass` is deliberately built
from the existing FM engine at extreme settings to show what that costs — a
different register and a different rule base, and no new DSP at all.

## Known rough edges

- Instruments cannot be reordered by dragging yet, only added and removed.
- There is no project browser — projects are files, saved and opened one at a
  time. The autosave holds only the most recent state.
- Automation lanes can target expression dimensions and level from the UI; the
  engine also supports targeting an instrument's individual parameters, but
  there is no picker for them.
- The harmonic walk is shared by the whole rack — instruments cannot yet run
  their own progressions against it.
- The loudness compensation in `patch.ts` is a fit against the default rack. A
  very different rack will sit at a different level; re-fit with `npm run audition`.
