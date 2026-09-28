/**
 * Drum pattern styles, as a probability per sixteenth for each piece.
 *
 * A probability of 1 is the skeleton of the style and always plays; anything
 * less is ornament, which `busy` scales up or down and the phrase and bar
 * decide on. Reading down a column is reading the groove: the kick in a
 * boom-bap bar lands on 1, the "and" of 2 and 3; in a half-time bar the snare
 * waits for beat three.
 */
export interface DrumStyle {
  readonly name: string
  readonly kick: readonly number[]
  readonly snare: readonly number[]
  readonly rim: readonly number[]
  readonly hat: readonly number[]
  readonly openHat: readonly number[]
}

//                  1 e + a 2 e + a 3 e + a 4 e + a
const _ = 0

export const DRUM_STYLES: readonly DrumStyle[] = [
  {
    name: 'pulse',
    kick: [1, _, _, _, _, _, _, .3, .25, _, .7, _, _, _, .15, _],
    snare: [_, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, _],
    rim: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    hat: [.95, .2, .9, .2, .95, .2, .9, .2, .95, .2, .9, .2, .95, .2, .9, .25],
    openHat: [_, _, _, _, _, _, .3, _, _, _, _, _, _, _, .5, _],
  },
  {
    name: 'halftime',
    kick: [1, _, _, _, _, _, .4, _, _, _, .35, .3, _, _, _, _],
    snare: [_, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _],
    rim: [_, _, _, _, .25, _, _, _, _, _, _, _, .3, _, _, _],
    hat: [.95, _, .85, _, .95, _, .85, _, .95, _, .85, _, .95, _, .85, .3],
    openHat: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, .6, _],
  },
  {
    name: 'boom-bap',
    kick: [1, _, _, _, _, _, _, .75, _, _, .9, _, _, _, _, .2],
    snare: [_, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, _],
    rim: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    hat: [1, _, .95, _, 1, _, .95, _, 1, _, .95, _, 1, _, .95, .35],
    openHat: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, .45, _],
  },
  {
    name: 'shuffle',
    kick: [1, _, _, .3, _, _, _, _, .5, _, _, .7, _, _, _, _],
    snare: [_, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, _],
    rim: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    hat: [1, _, _, .9, 1, _, _, .9, 1, _, _, .9, 1, _, _, .9],
    openHat: [_, _, _, _, _, _, _, .3, _, _, _, _, _, _, _, .3],
  },
  {
    name: 'brushes',
    kick: [.8, _, _, _, _, _, _, _, .35, _, _, _, _, _, _, _],
    snare: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    rim: [_, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, _],
    hat: [.8, .6, .8, .6, .8, .6, .8, .6, .8, .6, .8, .6, .8, .6, .8, .6],
    openHat: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  },
  {
    name: 'four',
    kick: [1, _, _, _, 1, _, _, _, 1, _, _, _, 1, _, _, _],
    snare: [_, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, _],
    rim: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    hat: [_, .3, 1, .3, _, .3, 1, .3, _, .3, 1, .3, _, .3, 1, .3],
    openHat: [_, _, .2, _, _, _, .2, _, _, _, .2, _, _, _, .4, _],
  },
]

export const FILL_EVERY: readonly number[] = [2, 4, 8, 16]
