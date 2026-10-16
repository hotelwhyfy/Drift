import { useCallback } from 'react'
import type { Player } from '@/audio/player.ts'
import { openWavSink, isCancellation } from '@/project/filePicker.ts'
import type { FileSink } from '@/project/filePicker.ts'

/** Minutes, or 'song' for the song once through. */
export type CaptureLength = number | 'song'

/** Renders to a WAV on disk, streaming as the audio is made. */
export function useCapture(
  player: Player,
  length: CaptureLength,
  projectName: string,
  seedName: string,
  setProgress: (progress: number | null) => void,
  say: (text: string) => void,
): () => Promise<void> {
  return useCallback(async () => {
    const filename = length === 'song'
      ? `drift-${projectName !== 'untitled' ? projectName : seedName}.wav`
      : `drift-${seedName}-${length}min.wav`
    // Where it goes is decided first, before any rendering: the file is
    // written as the audio is made, not collected and saved at the end.
    let sink: FileSink
    try {
      sink = await openWavSink(filename)
    } catch (error) {
      if (!isCancellation(error)) say(error instanceof Error ? error.message : 'Could not start the export.')
      return
    }
    setProgress(0)
    try {
      await (length === 'song'
        ? player.capture('song', 0, sink.write)
        : player.capture('minutes', length * 60, sink.write))
      await sink.close()
      say(sink.inMemory ? `downloaded ${sink.name}` : `exported ${sink.name}`)
    } catch (error) {
      await sink.abort().catch(() => {})
      say(error instanceof Error ? error.message : 'The capture failed.')
    } finally {
      setProgress(null)
    }
  }, [player, length, seedName, projectName, setProgress, say])
}
