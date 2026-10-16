import type { FileSink } from '@/files/types.ts'
import { WAV_TYPE } from '@/files/pickerTypes.ts'
import { rememberRefusal } from '@/files/pickerRefusal.ts'
import { savePicker } from '@/files/savePicker.ts'
import { devServerPost } from '@/files/devServerPost.ts'
import { isRefusal } from '@/files/isRefusal.ts'
import { downloadSink } from '@/files/downloadSink.ts'

function isStreamBegun(value: unknown): value is { token: string, name: string } {
  if (typeof value !== 'object' || value === null) return false
  return typeof Reflect.get(value, 'token') === 'string' && typeof Reflect.get(value, 'name') === 'string'
}

/**
 * A file to export a WAV into, chosen through a Save dialog where there is
 * one. Must be called straight from the click that asked for it: the
 * browser's own dialog needs that click to be recent.
 */
export async function openWavSink(suggestedName: string): Promise<FileSink> {
  const begun = await devServerPost('stream/begin', JSON.stringify({ name: suggestedName, extension: '.wav' }))
  if (begun !== null) {
    if (!isStreamBegun(begun)) throw new Error('The dev server could not start the export.')
    const query = `?token=${encodeURIComponent(begun.token)}`
    return {
      name: begun.name,
      inMemory: false,
      write: async (bytes) => { await devServerPost(`stream/write${query}`, bytes) },
      close: async () => { await devServerPost(`stream/end${query}`) },
      abort: async () => { await devServerPost(`stream/abort${query}`) },
    }
  }

  const picker = savePicker()
  if (picker) {
    const handle = await picker({ suggestedName, types: [WAV_TYPE] })
    try {
      // Chrome writes this to a swap file beside the target and moves it into
      // place on close, so nothing accumulates in the tab.
      const writable = await handle.createWritable()
      return {
        name: handle.name,
        inMemory: false,
        write: (bytes) => writable.write(bytes),
        close: () => writable.close(),
        abort: () => writable.abort(),
      }
    } catch (error) {
      if (!isRefusal(error)) throw error
      rememberRefusal()
      console.warn('drift: file handle refused, downloading instead', error)
      return downloadSink(handle.name)
    }
  }
  return downloadSink(suggestedName)
}
