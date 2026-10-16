/** The kit's pieces, plus the cymbal gestures, which the kit ignores. */
export type DrumHit = 'kick' | 'snare' | 'hat' | 'openHat' | 'rim' | 'swell' | 'roll'

/** A reusable stereo frame. Voices write into one rather than allocating. */
export type Stereo = [number, number]
