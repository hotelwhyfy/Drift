import { useMemo } from 'react'
import { useCommitField } from '@/ui/hooks/useCommitField.ts'
import type { Song, SongEnd } from '@/song/types.ts'
import type { Macros } from '@/macros/macros.ts'
import { songSeconds } from '@/song/songSeconds.ts'
import { MAX_SONG_BARS, MIN_TUNING, MAX_TUNING } from '@/song/song.ts'
import { withLength } from '@/song/withLength.ts'
import { withTuning } from '@/song/withTuning.ts'
import { formatDuration } from '@/ui/common/formatDuration.ts'
import { Tooltip } from '@/ui/controls/Tooltip.tsx'
import { NumberField } from '@/ui/controls/NumberField.tsx'

const ENDS: SongEnd[] = ['loop', 'hold', 'stop']

interface Props {
  song: Song
  /** The dials, which set the tempo the song's length is timed at. */
  dials: Macros
  /** The A4 the dials give at the playhead — what an empty tuning field means. */
  autoTuning: number
  onSongChange: (song: Song) => void
}

/** The song's length, what happens at its end, and its concert pitch. */
export function SongSettings({ song, dials, autoTuning, onSongChange }: Props) {
  const setLength = (bars: number): void => {
    const next = withLength(song, bars)
    if (next) onSongChange(next)
  }
  const length = useCommitField(String(song.lengthBars), (text) => setLength(Number(text)))

  // Timed from what is typed, before it commits: the length is the answer to
  // "how long is that many bars", which is worth seeing while choosing.
  const typed = length.input.value.trim() === '' ? null : withLength(song, Number(length.input.value))
  const bars = typed?.lengthBars ?? song.lengthBars
  const seconds = useMemo(() => songSeconds({ ...song, lengthBars: bars }, dials), [song, bars, dials])

  /** Empty hands the reference back to the dials. */
  const tuning = useCommitField(song.tuning === null ? '' : String(song.tuning), (text) => {
    const next = withTuning(song, text)
    if (next) onSongChange(next)
  })
  // From the field, not the song, so clearing it or typing a pitch shows at once.
  const auto = tuning.input.value.trim() === ''

  return (
    <>
      <label className="tl-length">
        <NumberField field={length} min={1} max={MAX_SONG_BARS} aria-label="Song length in bars" />
        <span>bars · {formatDuration(seconds)}</span>
      </label>
      <Tooltip content="Add sixteen bars">
        <button type="button" className="tl-btn" onClick={() => setLength(song.lengthBars + 16)}>+16</button>
      </Tooltip>
      <div className="tl-seg" role="group" aria-label="At the end">
        {ENDS.map((end) => (
          <button
            key={end}
            type="button"
            className={song.end === end ? 'on' : ''}
            onClick={() => onSongChange({ ...song, end })}
          >{end}</button>
        ))}
      </div>
      <Tooltip content="Concert pitch for the whole song. Leave empty and the dials drift it between 432 and 441.">
        <label className="tl-length">
          <span>A4</span>
          <NumberField
            field={tuning}
            min={MIN_TUNING}
            max={MAX_TUNING}
            step={0.5}
            placeholder={autoTuning.toFixed(1)}
            aria-label="Reference pitch for A4 in hertz"
          />
          <span>Hz</span>
        </label>
      </Tooltip>
      <Tooltip content={auto ? 'Keep the pitch the dials are giving now' : 'Hand the pitch back to the dials'}>
        <button
          type="button"
          className={`tl-btn ${auto ? 'on' : ''}`}
          aria-pressed={auto}
          // Keep focus in the field: a blur would commit the typed pitch first.
          onMouseDown={(e) => e.preventDefault()}
          // Off keeps where the dials have drifted to: the placeholder, to the digit shown.
          onClick={() => tuning.commit(auto ? autoTuning.toFixed(1) : '')}
        >auto</button>
      </Tooltip>
    </>
  )
}
