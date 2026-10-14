import { Phasor, squareFrom } from './osc.ts'

/**
 * Six square waves at the 808 cymbal's ratios: 205.3, 304.4, 369.6, 522.7,
 * 540 and 800 Hz, normalised to the lowest. None is a harmonic of another, and
 * the 522.7/540 pair beats, so the sum reads as metal rather than a chord.
 * Highpassed, it is most of a cymbal; noise supplies the rest.
 */
const RATIOS = [1, 1.4827, 1.8003, 2.546, 2.6303, 3.8967]

export class Metal {
  private phasors: Phasor[] = []

  constructor(sampleRate: number, startPhases: readonly number[]) {
    for (let i = 0; i < RATIOS.length; i++) {
      this.phasors.push(new Phasor(sampleRate, startPhases[i % startPhases.length]))
    }
  }

  /** The lowest partial, Hz. The 808's is 205.3; cymbals sound well up to ~600. */
  setHz(hz: number): void {
    for (let i = 0; i < this.phasors.length; i++) this.phasors[i].setHz(hz * RATIOS[i])
  }

  /** Roughly -1..1. */
  process(): number {
    let s = 0
    for (let i = 0; i < this.phasors.length; i++) {
      const p = this.phasors[i]
      s += squareFrom(p.step(), p.increment)
    }
    return s * (1 / 6)
  }
}
