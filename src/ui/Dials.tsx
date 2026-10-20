import { Dial } from '@/ui/controls/Dial.tsx'
import { Tooltip } from '@/ui/controls/Tooltip.tsx'
import { MACRO_INFO } from '@/macros/macros.ts'
import type { Macros, MacroKey } from '@/macros/macros.ts'
import type { Song } from '@/song/types.ts'
import { MACRO_COLOURS } from '@/ui/colour/laneColours.ts'

interface Props {
  song: Song
  /** The dials as set by hand. */
  macros: Macros
  /** The dials as the music has them at the playhead. */
  heard: Macros
  accent: string
  onChange: (key: MacroKey, value: number) => void
  onUnlink: (key: MacroKey) => void
}

/** The six macro dials, each wearing its lane's colour while the song drives it. */
export function Dials({ song, macros, heard, accent, onChange, onUnlink }: Props) {
  return (
    <section className="dials" aria-label="Sound controls">
      {MACRO_INFO.map((info) => {
        const track = song.macros[info.key]
        const driven = !!track?.enabled && track.envelope.points.length > 0
        return (
          <div className={`dial-slot ${driven ? 'driven' : ''}`} key={info.key}>
            <Dial
              label={info.label}
              low={info.low}
              high={info.high}
              value={driven ? heard[info.key] : macros[info.key]}
              // A dial the song drives wears its lane's colour, so the two
              // read as one control in two places.
              accent={driven ? MACRO_COLOURS[info.key] : accent}
              onChange={(v) => onChange(info.key, v)}
            />
            {driven && (
              <Tooltip content="The song is driving this dial. Turning it writes into the song at the playhead; click to take it back.">
                <button
                  type="button"
                  className="dial-unlink"
                  onClick={() => onUnlink(info.key)}
                >
                  <span className="tl-swatch" style={{ borderColor: MACRO_COLOURS[info.key], background: MACRO_COLOURS[info.key] }} />
                  on timeline ×
                </button>
              </Tooltip>
            )}
          </div>
        )
      })}
    </section>
  )
}
