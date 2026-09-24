import { ipcMain } from 'electron'
import { registerMegamind } from '../arca-megamind/register'
import {
  ARCA_MAINFRAME_ENDPOINT_CHANNEL,
  ARCA_MAINFRAME_PARTITION,
  type ArcaMainframePanelDescriptor
} from '../../shared/arca-mainframe'
import { getArcaMainframeEndpoint } from '../arca-mainframe/arca-mainframe-endpoint'

/** The renderer cannot read env, so the panel asks main which endpoint and partition to attach. */
export function registerArcaMainframeHandlers(): void {
  registerMegamind()
  ipcMain.handle(ARCA_MAINFRAME_ENDPOINT_CHANNEL, (): ArcaMainframePanelDescriptor => ({
    ...getArcaMainframeEndpoint(),
    partition: ARCA_MAINFRAME_PARTITION
  }))
}
