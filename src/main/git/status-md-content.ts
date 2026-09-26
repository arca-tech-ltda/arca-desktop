import { readFile } from 'node:fs/promises'

const reads = new Map<string, Promise<string>>()

/** Shares disk reads between Tasks and local priorities without retaining stale content. */
export function readStatusMdContent(path: string): Promise<string> {
  let reading = reads.get(path)
  if (!reading) {
    reading = readFile(path, 'utf8').finally(() => {
      reads.delete(path)
    })
    reads.set(path, reading)
  }
  return reading
}
