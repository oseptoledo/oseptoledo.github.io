import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COPY } from '../content/copy'
import { HORIZON } from '../content/horizon'
import { IMAGES } from '../content/images'
import { NEWS, formatDate } from '../content/news'
import { FUNDER_IDS, PARTNERS } from '../content/partners'
import { STATS } from '../content/stats'
import { MILESTONES } from '../content/timeline'
import { LOCALES } from '../i18n/locale'

/**
 * Facts about the content modules that TypeScript cannot check: counts the
 * copy states in words, ids that must resolve, strings that must not be empty
 * in either language, and the partner names the site must spell exactly.
 */

/** Every string reachable inside a value, with its path, for the empty-string check. */
function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') return []
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`))
  }
  return []
}

const EMPTY_BY_DESIGN = new Set(['en.news.readMoreNote'])

describe('content', () => {
  it('has ten partners, because the copy says "Ten" and "Diez" in several places', () => {
    expect(PARTNERS).toHaveLength(10)
    expect(COPY.en.hero.title.startsWith('Ten organizations.')).toBe(true)
    expect(COPY.es.hero.title.startsWith('Diez organizaciones.')).toBe(true)
    expect(COPY.en.partners.title.startsWith('Ten organizations')).toBe(true)
    expect(COPY.es.partners.title.startsWith('Diez organizaciones')).toBe(true)
    expect(STATS[0].value.en).toBe('10')
  })

  it('lays the timeline out in two columns of ceil(milestones / 2) rows, so a new milestone cannot open a third column', () => {
    // Progress.tsx fixes the row count in a class, because the CSP allows no
    // inline style to pass it in. Ten milestones: two columns of five.
    const progress = readFileSync(join(process.cwd(), 'src', 'components', 'Progress.tsx'), 'utf8')
    const rows = Math.ceil(MILESTONES.length / 2)
    expect(progress).toContain('md:grid-flow-col md:grid-cols-2')
    const fix =
      `${MILESTONES.length} milestones need ${rows} rows: in src/components/Progress.tsx, ` +
      `change the md:grid-rows-[repeat(N,auto)] class on the <ol> to md:grid-rows-[repeat(${rows},auto)]`
    expect(progress, fix).toContain(`md:grid-rows-[repeat(${rows},auto)]`)
    expect(progress.match(/md:grid-rows-\[repeat\(\d+,auto\)\]/g), fix).toHaveLength(1)
  })

  it('has six founding partners, because the September 2025 milestone says "Six"', () => {
    expect(PARTNERS.filter((partner) => partner.founding)).toHaveLength(6)
    expect(MILESTONES[MILESTONES.length - 1].body.en.startsWith('Six founding partners')).toBe(true)
  })

  it('gives every partner a unique id and an https link', () => {
    expect(new Set(PARTNERS.map((p) => p.id)).size).toBe(PARTNERS.length)
    for (const partner of PARTNERS) expect(partner.url).toMatch(/^https:\/\//)
  })

  it('resolves every What’s Next card and funder to a partner, each at most once', () => {
    const ids = new Set(PARTNERS.map((p) => p.id))
    for (const item of HORIZON) expect(ids.has(item.partnerId), item.partnerId).toBe(true)
    for (const id of FUNDER_IDS) expect(ids.has(id), id).toBe(true)
    expect(new Set(HORIZON.map((item) => item.partnerId)).size).toBe(HORIZON.length)
  })

  it('has no empty string in either language', () => {
    for (const locale of LOCALES) {
      for (const [path, text] of strings(COPY[locale], locale)) {
        if (EMPTY_BY_DESIGN.has(path)) continue
        expect(text.trim(), `${path} is empty`).not.toBe('')
      }
    }
    const localized = [
      ...PARTNERS.map((p) => p.blurb),
      ...MILESTONES.flatMap((m) => [m.when, m.title, m.body]),
      ...HORIZON.map((h) => h.body),
      ...Object.values(IMAGES).map((image) => image.alt),
      ...STATS.flatMap((s) => [s.value, s.label]),
    ]
    for (const value of localized) for (const locale of LOCALES) expect(value[locale].trim()).not.toBe('')
  })

  it('spells LadderUp Housing as one word everywhere', () => {
    const everything = JSON.stringify([COPY, PARTNERS, MILESTONES, HORIZON])
    expect(everything).not.toMatch(/Ladder Up/)
  })

  it('translates the Spanish copy rather than repeating the English', () => {
    expect(COPY.es.hero.title).not.toBe(COPY.en.hero.title)
    for (const partner of PARTNERS) expect(partner.blurb.es).not.toBe(partner.blurb.en)
    for (const milestone of MILESTONES) expect(milestone.body.es).not.toBe(milestone.body.en)
  })

  it('dates news items with real ISO dates and spells them per language', () => {
    for (const item of NEWS) expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(formatDate('2026-05-14', 'en')).toBe('May 14, 2026')
    expect(formatDate('2026-05-14', 'es')).toBe('14 de mayo de 2026')
    expect(formatDate('2026-03-09', 'en')).toBe('March 9, 2026')
  })

  it('gives every milestone a valid <time> datetime', () => {
    for (const milestone of MILESTONES) expect(milestone.datetime).toMatch(/^\d{4}(-\d{2})?$/)
  })
})
