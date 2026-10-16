import { pathToFileURL } from 'node:url'
import { resolve as resolvePath } from 'node:path'

const SRC = resolvePath(import.meta.dirname, '../src')

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context)
  const url = pathToFileURL(resolvePath(SRC, specifier.slice(2))).href
  return nextResolve(url, context)
}
