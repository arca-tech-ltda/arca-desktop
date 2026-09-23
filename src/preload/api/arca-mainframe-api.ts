import type { ArcaMainframePanelDescriptor } from '../../shared/arca-mainframe'

export type ArcaMainframeApi = {
  arcaMainframe: {
    /** Endpoint and partition the Megamind panel attaches its guest to. */
    getPanel: () => Promise<ArcaMainframePanelDescriptor>
  }
}
