import type { OpenedFile } from '@/files/types.ts'
import { PROJECT_TYPE } from '@/files/pickerTypes.ts'
import { rememberRefusal } from '@/files/pickerRefusal.ts'
import { openPicker } from '@/files/openPicker.ts'
import { viaDevServer } from '@/files/viaDevServer.ts'
import { isRefusal } from '@/files/isRefusal.ts'
import { stripExtension } from '@/files/stripExtension.ts'

export async function openTextFile(): Promise<OpenedFile | null> {
  const viaServer = await viaDevServer('open')
  if (viaServer?.text !== undefined) return { name: stripExtension(viaServer.name), text: viaServer.text }

  const picker = openPicker()
  if (picker) {
    const [handle] = await picker({ types: [PROJECT_TYPE], multiple: false })
    if (!handle) return null
    try {
      const file = await handle.getFile()
      return { name: stripExtension(handle.name), text: await file.text() }
    } catch (error) {
      if (!isRefusal(error)) throw error
      rememberRefusal()
      // A second dialog cannot be opened here: the click that allowed the
      // first has been spent. Dropping the file needs no permission at all.
      console.warn('drift: file handle refused', error)
      throw new Error('This browser blocked reading the file. Open again, or drag it onto the window.')
    }
  }

  // Fallback: a transient file input.
  return new Promise<OpenedFile | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      void file.text().then((text) => resolve({ name: stripExtension(file.name), text }))
    }
    // A cancelled input fires nothing at all in some browsers, so the promise
    // is simply left unsettled rather than resolving to a false "no file".
    input.click()
  })
}
