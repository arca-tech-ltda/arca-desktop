import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'
import type { ArcaMainframePanelDescriptor } from '../../../../shared/arca-mainframe'
import { attachMegamindWebview } from './megamind-webview-attach'

type MegamindState = 'loading' | 'ready' | 'error' | 'unsupported'

function isPanelDescriptor(value: unknown): value is ArcaMainframePanelDescriptor {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate: Record<string, unknown> = { ...value }
  return (
    typeof candidate.origin === 'string' &&
    typeof candidate.panelUrl === 'string' &&
    typeof candidate.partition === 'string'
  )
}

export default function MegamindPanel(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const reloadRef = useRef<(() => void) | null>(null)
  const [panel, setPanel] = useState<ArcaMainframePanelDescriptor | null>(null)
  const [state, setState] = useState<MegamindState>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let disposed = false
    const getPanel = window.api.arcaMainframe?.getPanel
    // The paired web client has no webview tag, so there is nothing to embed there.
    if (!getPanel || isWebClientLocation()) {
      setState('unsupported')
      return
    }
    setState('loading')
    void getPanel()
      .then((descriptor) => {
        if (disposed) {
          return
        }
        // A stale preload answers this channel with undefined rather than failing.
        if (!isPanelDescriptor(descriptor)) {
          setState('unsupported')
          return
        }
        setPanel(descriptor)
      })
      .catch(() => {
        if (!disposed) {
          setState('error')
        }
      })
    return () => {
      disposed = true
    }
  }, [attempt])

  useEffect(() => {
    const container = containerRef.current
    if (!panel || !container) {
      return
    }
    let failed = false
    const attached = attachMegamindWebview({
      container,
      panel,
      ariaLabel: translate('arca.megamind.guestAriaLabel', 'ARCA Megamind'),
      onLoadStarted: () => {
        failed = false
        setState('loading')
      },
      onLoadStopped: () => {
        if (!failed) {
          setState('ready')
        }
      },
      onLoadFailed: (event) => {
        // -3 is an aborted load (a navigation replaced it), not a reachability failure.
        if (!event.isMainFrame || event.errorCode === -3) {
          return
        }
        failed = true
        setState('error')
      }
    })
    reloadRef.current = attached.reload
    return () => {
      reloadRef.current = null
      attached.detach()
    }
  }, [attempt, panel])

  const handleReload = useCallback(() => {
    if (!panel || state === 'error') {
      // Remount instead of reloading: a guest that never loaded has nothing to reload.
      setPanel(null)
      setAttempt((count) => count + 1)
      return
    }
    reloadRef.current?.()
  }, [panel, state])

  const handleOpenExternally = useCallback(() => {
    if (panel) {
      void window.api.shell.openUrl(panel.panelUrl)
    }
  }, [panel])

  const reloadLabel = translate('arca.megamind.reload', 'Reload Megamind')
  const openExternallyLabel = translate('arca.megamind.openInBrowser', 'Open in browser')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-8 min-h-8 items-center gap-2 border-b border-border px-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {translate('arca.megamind.title', 'Megamind')}
        </span>
        {state === 'loading' ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={reloadLabel}
              onClick={handleReload}
            >
              <RefreshCw className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {reloadLabel}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={openExternallyLabel}
              aria-disabled={!panel}
              onClick={handleOpenExternally}
            >
              <ExternalLink className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {openExternallyLabel}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="relative flex min-h-0 flex-1 overflow-hidden" ref={containerRef}>
        {state === 'error' || state === 'unsupported' ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background px-6 text-center">
            <AlertCircle className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              {state === 'unsupported'
                ? translate('arca.megamind.unsupportedTitle', 'Megamind needs the desktop app')
                : translate('arca.megamind.errorTitle', 'Megamind is unreachable')}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {state === 'unsupported'
                ? translate(
                    'arca.megamind.unsupportedDetail',
                    'This panel embeds the ARCA Mainframe, which only runs in the desktop app.'
                  )
                : translate(
                    'arca.megamind.errorDetail',
                    'The ARCA Mainframe did not respond. Check your connection and try again.'
                  )}
            </p>
            {state === 'error' ? (
              <Button type="button" variant="outline" size="sm" onClick={handleReload}>
                {translate('arca.megamind.retry', 'Try again')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
