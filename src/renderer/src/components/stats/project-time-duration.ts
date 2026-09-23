import { projectDurationParts } from '../../../../shared/project-time'
import { translate } from '@/i18n/i18n'

export function formatProjectDuration(seconds: number): string {
  const parts = projectDurationParts(seconds)
  if (parts.underMinute) {
    return translate('projectTime.underMinute', '< 1 min')
  }
  if (parts.hours > 0) {
    return translate('projectTime.hoursMinutes', '{{hours}} h {{minutes}} min', {
      hours: parts.hours,
      minutes: parts.minutes
    })
  }
  return translate('projectTime.minutes', '{{minutes}} min', { minutes: parts.minutes })
}
