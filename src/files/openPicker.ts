import type { FileHandleLike, OpenOptions } from '@/files/types.ts'
import { pickerRefused } from '@/files/pickerRefusal.ts'

export function openPicker(): ((options: OpenOptions) => Promise<FileHandleLike[]>) | null {
  if (pickerRefused()) return null
  const fn: unknown = Reflect.get(window, 'showOpenFilePicker')
  if (typeof fn !== 'function') return null
  const bound: (options: OpenOptions) => Promise<FileHandleLike[]> = fn.bind(window)
  return bound
}
