/** Words for the seed, so a world can be remembered and typed back in. */
const SEED_WORDS = [
  'amber', 'ash', 'bloom', 'cedar', 'dusk', 'ember', 'fern', 'glass', 'haze',
  'ivory', 'jade', 'kelp', 'linen', 'moss', 'night', 'ochre', 'pearl', 'quill',
  'rain', 'slate', 'tide', 'umber', 'vellum', 'willow', 'yarrow', 'zephyr',
]

export function randomSeedName(): string {
  const a = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]
  const b = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]
  const n = Math.floor(Math.random() * 90 + 10)
  return `${a}-${b}-${n}`
}
