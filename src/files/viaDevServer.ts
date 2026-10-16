import type { DevServerFile } from '@/files/types.ts'
import { devServerPost } from '@/files/devServerPost.ts'

function isDevServerFile(value: unknown): value is DevServerFile {
  if (typeof value !== 'object' || value === null) return false
  const name: unknown = Reflect.get(value, 'name')
  const text: unknown = Reflect.get(value, 'text')
  return typeof name === 'string' && (text === undefined || typeof text === 'string')
}

export async function viaDevServer(route: 'save' | 'open', body?: string): Promise<DevServerFile | null> {
  const payload = await devServerPost(route, body)
  if (payload === null) return null
  if (!isDevServerFile(payload)) throw new Error(`The dev server could not ${route} the file.`)
  return payload
}
