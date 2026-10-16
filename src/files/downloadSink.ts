import type { FileSink } from '@/files/types.ts'

/** The last resort: collect the pieces, then hand them to the browser as a download. */
export function downloadSink(filename: string): FileSink {
  let parts: Uint8Array<ArrayBuffer>[] = []
  return {
    name: filename,
    inMemory: true,
    write: async (bytes) => { parts.push(bytes) },
    close: async () => {
      const url = URL.createObjectURL(new Blob(parts, { type: 'audio/wav' }))
      parts = []
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      // Revoked on a delay: revoking immediately can cancel the download in
      // some browsers before they have read the blob.
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    },
    abort: async () => { parts = [] },
  }
}
