import type { SaveResult } from '@/files/types.ts'
import { PROJECT_TYPE } from '@/files/pickerTypes.ts'
import { rememberRefusal } from '@/files/pickerRefusal.ts'
import { savePicker } from '@/files/savePicker.ts'
import { viaDevServer } from '@/files/viaDevServer.ts'
import { isRefusal } from '@/files/isRefusal.ts'
import { download } from '@/files/download.ts'
import { stripExtension } from '@/files/stripExtension.ts'

export async function saveTextFile(
  text: string,
  suggestedName: string,
): Promise<SaveResult | null> {
  const viaServer = await viaDevServer('save', JSON.stringify({ name: suggestedName, text }))
  if (viaServer) return { name: stripExtension(viaServer.name), fellBack: false }

  const picker = savePicker()
  if (picker) {
    const handle = await picker({ suggestedName, types: [PROJECT_TYPE] })
    try {
      const writable = await handle.createWritable()
      await writable.write(text)
      await writable.close()
      return { name: stripExtension(handle.name), fellBack: false }
    } catch (error) {
      if (!isRefusal(error)) throw error
      rememberRefusal()
      // The dialog has already created an empty file at the chosen path; the
      // refused handle cannot remove it. Download under the chosen name instead.
      console.warn('drift: file handle refused, downloading instead', error)
      return download(text, handle.name)
    }
  }
  return download(text, suggestedName)
}
