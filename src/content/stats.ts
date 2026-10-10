import type { Localized } from '../i18n/locale'
import { PARTNERS } from './partners'

/**
 * Headline figures. Every published figure carries an as-of date, printed under
 * the stats grid and in the Key facts block of public/llms.txt. Changing a
 * figure or the date means editing this module and llms.txt in the same PR;
 * src/__tests__/llms.test.ts fails if they disagree.
 *
 * The partner count is derived from PARTNERS rather than typed, so it cannot
 * disagree with the cards.
 */
export const STATS_AS_OF = '2026-09-25'

/** Properties in the Pilot Zone, counted by the Neighborhood Inventory. */
export const PILOT_ZONE_PROPERTIES = 315

export interface Stat {
  value: Localized
  label: Localized
}

export const STATS: readonly Stat[] = [
  {
    value: { en: String(PARTNERS.length), es: String(PARTNERS.length) },
    label: { en: 'partner organizations', es: 'organizaciones socias' },
  },
  {
    value: { en: String(PILOT_ZONE_PROPERTIES), es: String(PILOT_ZONE_PROPERTIES) },
    label: { en: 'properties inventoried', es: 'propiedades inventariadas' },
  },
  {
    value: { en: '3-year', es: '3 años' },
    label: { en: 'shared commitment', es: 'de compromiso compartido' },
  },
]

/** "As of September 2026" / "Cifras a septiembre de 2026", from STATS_AS_OF. */
export const STATS_AS_OF_LABEL: Localized = {
  en: 'Figures as of September 2026',
  es: 'Cifras a septiembre de 2026',
}
