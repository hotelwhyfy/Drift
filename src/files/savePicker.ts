import type { FileHandleLike, SaveOptions } from '@/files/types.ts'
import { pickerRefused } from '@/files/pickerRefusal.ts'

export function savePicker(): ((options: SaveOptions) => Promise<FileHandleLike>) | null {
  if (pickerRefused()) return null
  const fn: unknown = Reflect.get(window, 'showSaveFilePicker')
  if (typeof fn !== 'function') return null
  const bound: (options: SaveOptions) => Promise<FileHandleLike> = fn.bind(window)
  return bound
}
