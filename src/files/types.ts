export interface PickerType {
  description: string
  accept: Record<string, string[]>
}

export interface WritableLike {
  write(data: string | Uint8Array<ArrayBuffer>): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}

export interface FileHandleLike {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<WritableLike>
}

export interface SaveOptions {
  suggestedName?: string
  types?: PickerType[]
}

export interface OpenOptions {
  types?: PickerType[]
  multiple?: boolean
}

export interface DevServerFile {
  name: string
  text?: string
}

export interface SaveResult {
  /** The name the file ended up with, without its extension. */
  name: string
  /** True when the browser could not offer a real dialog. */
  fellBack: boolean
}

/**
 * Somewhere a file is written to a piece at a time. Writes are awaited in
 * order by the caller; nothing here buffers more than the piece in hand,
 * except the last-resort download, which has no choice.
 */
export interface FileSink {
  /** The file's name, as the dialog left it. */
  readonly name: string
  /** True when this is a download collected in memory rather than written as it goes. */
  readonly inMemory: boolean
  write(bytes: Uint8Array<ArrayBuffer>): Promise<void>
  close(): Promise<void>
  /** Gives up, removing the partial file wherever that is possible. */
  abort(): Promise<void>
}

export interface OpenedFile {
  name: string
  text: string
}
