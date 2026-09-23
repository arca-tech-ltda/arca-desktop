import { ipcRenderer } from 'electron'
import {
  ARCA_MAINFRAME_ENDPOINT_CHANNEL,
  type ArcaMainframePanelDescriptor
} from '../../shared/arca-mainframe'
import type { PreloadApi } from '../api-types'

export const arcaMainframeApi = {
  getPanel: (): Promise<ArcaMainframePanelDescriptor> =>
    ipcRenderer.invoke(ARCA_MAINFRAME_ENDPOINT_CHANNEL)
} satisfies PreloadApi['arcaMainframe']
