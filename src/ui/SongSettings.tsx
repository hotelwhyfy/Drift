import { useCommitField } from '@/ui/hooks/useCommitField.ts'
import type { Song, SongEnd } from '@/song/types.ts'
import { MAX_SONG_BARS, MIN_TUNING, MAX_TUNING } from '@/song/song.ts'
import { withLength } from '@/song/withLength.ts'
import { withTuning } from '@/song/withTuning.ts'
import { formatDuration } from '@/ui/formatDuration.ts'
import { Tooltip } from '@/ui/Tooltip.tsx'

const ENDS: SongEnd[] = ['loop', 'hold', 'stop']

interface Props {
  song: Song
  /** How long the song plays for. */
  seconds: number
  /** The A4 the dials give at the playhead — what an empty tuning field means. */
  autoTuning: number
  onSongChange: (song: Song) => void
}

/** The song's length, what happens at its end, and its concert pitch. */
export function SongSettings({ song, seconds, autoTuning, onSongChange }: Props) {
  const setLength = (bars: number): void => {
    const next = withLength(song, bars)
    if (next) onSongChange(next)
  }
  const length = useCommitField(String(song.lengthBars), (text) => setLength(Number(text)))

  /** Empty hands the reference back to the dials. */
  const tuning = useCommitField(song.tuning === null ? '' : String(song.tuning), (text) => {
    const next = withTuning(song, text)
    if (next) onSongChange(next)
  })

  return (
    <>
      <label className="tl-length">
        <input
          type="number"
          min={1}
          max={MAX_SONG_BARS}
          {...length}
          aria-label="Song length in bars"
        />
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
          <input
            type="number"
            min={MIN_TUNING}
            max={MAX_TUNING}
            step={0.5}
            placeholder={autoTuning.toFixed(1)}
            {...tuning}
            aria-label="Reference pitch for A4 in hertz"
          />
          <span>{song.tuning === null ? 'Hz · auto' : 'Hz'}</span>
        </label>
      </Tooltip>
    </>
  )
}
