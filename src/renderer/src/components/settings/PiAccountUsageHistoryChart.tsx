import { useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import type { PiAccountUsageSample } from '../../../../shared/pi-account-usage'

type HistoryRange = '24h' | '7d'

const RANGE_MS: Record<HistoryRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
}
const WIDTH = 240
const HEIGHT = 36
const MISSING = -1

/** Area path over a fixed 0–100 scale, so two accounts' charts compare directly. */
function buildPaths(
  samples: PiAccountUsageSample[],
  from: number,
  to: number
): { line: string; area: string } | null {
  const points = samples
    .filter(([seconds, session]) => seconds * 1000 >= from && session !== MISSING)
    .map(([seconds, session]) => {
      const x = ((seconds * 1000 - from) / Math.max(1, to - from)) * WIDTH
      return [Math.max(0, Math.min(WIDTH, x)), HEIGHT - (session / 100) * HEIGHT] as const
    })
  if (points.length < 2) {
    return null
  }
  const line = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ')
  const first = points[0]
  const last = points.at(-1) ?? first
  return {
    line,
    area: `${line} L${last[0].toFixed(1)} ${HEIGHT} L${first[0].toFixed(1)} ${HEIGHT} Z`
  }
}

export function PiAccountUsageHistoryChart({
  samples
}: {
  samples: PiAccountUsageSample[]
}): React.JSX.Element {
  const [range, setRange] = useState<HistoryRange>('24h')
  const now = Date.now()
  const paths = useMemo(
    () => buildPaths(samples, now - RANGE_MS[range], now),
    // Why: `now` intentionally excluded — a new clock value every render would rebuild the path.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [samples, range]
  )

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {translate('piAccounts.usageHistoryTitle', 'Usage over time (5h window)')}
        </span>
        <div className="flex items-center gap-1">
          {(['24h', '7d'] as const).map((option) => (
            <Button
              key={option}
              size="xs"
              variant={range === option ? 'secondary' : 'ghost'}
              onClick={() => setRange(option)}
            >
              {option === '24h'
                ? translate('piAccounts.usageRange24h', '24h')
                : translate('piAccounts.usageRange7d', '7d')}
            </Button>
          ))}
        </div>
      </div>
      {paths ? (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-9 w-full"
          role="img"
          aria-label={translate('piAccounts.usageHistoryTitle', 'Usage over time (5h window)')}
        >
          <path d={paths.area} className="fill-muted-foreground/20" />
          <path
            d={paths.line}
            fill="none"
            strokeWidth={1.5}
            strokeLinejoin="round"
            className="stroke-muted-foreground/70"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'piAccounts.usageHistoryEmpty',
            'History starts once ARCA has read this account a few times.'
          )}
        </p>
      )}
    </div>
  )
}
