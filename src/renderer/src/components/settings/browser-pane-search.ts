import type { SettingsSearchEntry } from './settings-search'
import { getBrowserPaneSearchEntries } from './browser-search'
import { getBrowserUsePaneSearchEntries } from './browser-use-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { ARCA_PI_IS_AUTHORITY } from '../../../../shared/arca-product'

export const getBrowserPaneCombinedSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    ...(!ARCA_PI_IS_AUTHORITY ? getBrowserUsePaneSearchEntries() : []),
    ...getBrowserPaneSearchEntries()
  ]
)
