import { cn } from '@/lib/utils'
import { megamindPresenceLabel, type MegamindPresenceState } from './megamind-presence-state'

/** Three states plus app-only, in the three tokens the app already uses for live/attention/off. */
export function MegamindPresenceDot({
  state,
  label,
  className
}: {
  state: MegamindPresenceState
  /** Overrides the presence wording where the dot means something else, e.g. the connection. */
  label?: string
  className?: string
}): React.JSX.Element {
  return (
    <span
      role="img"
      aria-label={label ?? megamindPresenceLabel(state)}
      className={cn(
        'size-2 shrink-0 rounded-full',
        state === 'working' && 'bg-status-success',
        state === 'idle' && 'bg-attention-dot',
        state === 'app' && 'bg-muted-foreground',
        state === 'away' && 'bg-muted-foreground/35',
        className
      )}
    />
  )
}
