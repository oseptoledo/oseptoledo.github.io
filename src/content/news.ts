import type { Locale } from '../i18n/locale'

/**
 * Press coverage, newest first. Each item is also a `NewsArticle` node in the
 * index.html JSON-LD (as the Organization's `subjectOf`) and a line in the In
 * the news block of public/llms.txt; entity-graph.test.ts and llms.test.ts fail
 * if either copy drifts. Headlines are quoted as published, in English, so the
 * Spanish page marks them `lang="en"`.
 */
export interface NewsItem {
  outlet: string
  /** Publication date, YYYY-MM-DD. */
  date: string
  headline: string
  url: string
}

export const NEWS: readonly NewsItem[] = [
  {
    outlet: 'Toledo City Paper',
    date: '2026-05-14',
    headline: "Old South End Partnership Focuses On Neighborhood's Housing Challenges",
    url: 'https://toledocitypaper.com/the-city/old-south-end-partnership-focuses-on-neighborhoods-housing-challenges/',
  },
  {
    outlet: '13ABC',
    date: '2026-03-19',
    headline: 'Local partnership works to strengthen the foundation of the Old South End',
    url: 'https://www.13abc.com/2026/03/19/local-partnership-works-strengthen-foundation-old-south-end/',
  },
  {
    outlet: 'Toledo Today',
    date: '2026-03-19',
    headline: 'Old South End Partnership Launches $1 Million Housing Pilot',
    url: 'https://nationaltoday.com/us/oh/toledo/news/2026/03/19/old-south-end-partnership-launches-1-million-housing-pilot/',
  },
]

const MONTHS: Record<Locale, readonly string[]> = {
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  es: [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ],
}

/**
 * "May 14, 2026" / "14 de mayo de 2026". Written out by hand rather than with
 * Intl.DateTimeFormat: the page hydrates, and two ICU builds (Node's at build
 * time, the visitor's browser) are not guaranteed to spell a date identically.
 * Any difference would make React discard the prerendered HTML.
 */
export function formatDate(iso: string, locale: Locale): string {
  const [year, month, day] = iso.split('-').map(Number)
  const name = MONTHS[locale][month - 1]
  return locale === 'es' ? `${day} de ${name} de ${year}` : `${name} ${day}, ${year}`
}
