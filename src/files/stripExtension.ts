export function stripExtension(filename: string): string {
  return filename.replace(/\.drift\.json$/i, '').replace(/\.json$/i, '')
}
