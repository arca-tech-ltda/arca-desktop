import { join } from 'node:path'
import { ProjectTimeStore, projectTimeTickSchema } from '../stats/project-time-store'
import { app, ipcMain } from 'electron'
import type { StatsCollector } from '../stats/collector'

export function registerStatsHandlers(stats: StatsCollector): void {
  const projectTime = new ProjectTimeStore(join(app.getPath('userData'), 'project-time.json'))
  ipcMain.handle('projectTime:read', () => projectTime.read())
  ipcMain.handle('projectTime:tick', (_event, payload: unknown) => {
    const tick = projectTimeTickSchema.safeParse(payload)
    if (tick.success) {
      projectTime.tick(tick.data)
    }
  })
  app.on('will-quit', () => {
    try {
      projectTime.close()
    } catch (error) {
      console.error('[project-time] Save failed:', error)
    }
  })
  ipcMain.handle('stats:summary', () => {
    return stats.getSummary()
  })
}
