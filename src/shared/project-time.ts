export type ProjectTimeTick = {
  repoId: string
  displayName: string
  seconds: number
  endedAt?: number
}
export type ProjectTimeEntry = {
  repoId: string
  displayName: string
  days: Record<string, number>
}

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function daysAgo(now: Date, days: number): string {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return localDay(date)
}

export function activeProjectSeconds(
  previous: number,
  now: number,
  lastInput: number,
  focused: boolean
): number {
  if (!focused || !Number.isFinite(lastInput)) {
    return 0
  }
  return Math.max(0, (Math.min(now, lastInput + 300_000) - Math.max(previous, now - 60_000)) / 1000)
}

export function retainProjectTime(entries: ProjectTimeEntry[], now: Date): ProjectTimeEntry[] {
  const oldest = daysAgo(now, 89)
  const today = localDay(now)
  return entries
    .map((entry) => ({
      ...entry,
      days: Object.fromEntries(
        Object.entries(entry.days).filter(([day]) => day >= oldest && day <= today)
      )
    }))
    .filter((entry) => Object.keys(entry.days).length > 0)
}

export function creditProjectTime(
  entries: ProjectTimeEntry[],
  tick: ProjectTimeTick,
  now: Date
): ProjectTimeEntry[] {
  const result = retainProjectTime(entries, now)
  const seconds = Math.min(60, Math.max(0, tick.seconds))
  if (!Number.isFinite(seconds) || seconds === 0) {
    return result
  }
  let entry = result.find((item) => item.repoId === tick.repoId)
  if (!entry) {
    entry = { repoId: tick.repoId, displayName: tick.displayName, days: {} }
    result.push(entry)
  }
  entry.displayName = tick.displayName
  let start = now.getTime() - seconds * 1000
  while (start < now.getTime()) {
    const date = new Date(start)
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
    const end = Math.min(midnight, now.getTime())
    const day = localDay(date)
    entry.days[day] = (entry.days[day] ?? 0) + (end - start) / 1000
    start = end
  }
  return result
}

export function aggregateProjectTime(entries: ProjectTimeEntry[], days: 1 | 7, now = new Date()) {
  const oldest = daysAgo(now, days - 1)
  const today = localDay(now)
  return entries
    .map((entry) => ({
      repoId: entry.repoId,
      displayName: entry.displayName,
      seconds: Object.entries(entry.days).reduce(
        (sum, [day, seconds]) => sum + (day >= oldest && day <= today ? seconds : 0),
        0
      )
    }))
    .filter((entry) => entry.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
}

export function projectDurationParts(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60, underMinute: minutes === 0 }
}
