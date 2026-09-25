import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type FloatingLauncherButtonProps = React.ComponentProps<'button'> & {
  icon: React.ReactNode
  label: string
  tooltip: React.ReactNode
  showAttentionDot?: boolean
}

/** Parked square launcher shared by the floating workspace and project-task overlays. */
export function FloatingLauncherButton({
  icon,
  label,
  tooltip,
  showAttentionDot = false,
  className,
  ...buttonProps
}: FloatingLauncherButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="launcher"
          size="icon"
          className={cn('relative', className)}
          aria-label={label}
          {...buttonProps}
        >
          {icon}
          {showAttentionDot ? (
            // Ring matches the button fill so the dot reads on light and dark surfaces.
            <span
              aria-hidden
              data-floating-launcher-attention
              className="pointer-events-none absolute top-1 right-1 size-2 rounded-full bg-attention-dot ring-2 ring-card dark:ring-accent"
            />
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={6}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
