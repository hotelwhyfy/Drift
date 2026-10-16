import type { SaveResult } from '@/files/types.ts'
import { stripExtension } from '@/files/stripExtension.ts'

export function download(text: string, filename: string): SaveResult {
  // The browser decides the folder.
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  // Revoked on a delay: revoking immediately can cancel the download in some
  // browsers before they have read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return { name: stripExtension(filename), fellBack: true }
}
