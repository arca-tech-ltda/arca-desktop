export function browserFileUrlToAbsolutePath(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'file:') {
      return null
    }
    const hostPrefix =
      parsed.hostname && parsed.hostname !== 'localhost' ? `//${parsed.hostname}` : ''
    let absolutePath = `${hostPrefix}${decodeURIComponent(parsed.pathname)}`
    if (/^\/[A-Za-z]:\//.test(absolutePath)) {
      absolutePath = absolutePath.slice(1)
    }
    if (/^[A-Za-z]:\//.test(absolutePath) || absolutePath.startsWith('//')) {
      absolutePath = absolutePath.replaceAll('/', '\\')
    }
    return absolutePath
  } catch {
    return null
  }
}
