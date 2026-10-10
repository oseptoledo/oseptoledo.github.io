import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_NAME, SITE_ORIGIN, SITE_SHORT_NAME } from '../constants'
import { COPY } from '../content/copy'
import { NEWS, type NewsItem } from '../content/news'
import { FUNDER_IDS, PARTNERS, type PartnerId } from '../content/partners'
import { LOCALES } from '../i18n/locale'
import { publicFile } from './helpers/imageIntrinsicSize'

/**
 * The JSON-LD @graph in index.html is static text (a crawler reads it without
 * running JavaScript), so it carries literal copies of facts that live in
 * src/content/ and src/constants/. This holds every copy to its source:
 * partner names, URLs and order; the two funders; the press coverage; the
 * mission; the languages; and the referential integrity of every @id.
 *
 * Reads the source index.html; no build needed.
 */

type Node = Record<string, unknown> & { '@type': string; '@id'?: string }

const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const block = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
const graph = (JSON.parse(block![1]) as { '@graph': Node[] })['@graph']
const byId = new Map(graph.filter((node) => node['@id']).map((node) => [node['@id'] as string, node]))

const ids = (refs: unknown) => (refs as { '@id': string }[]).map((ref) => ref['@id'])
const partnerNodeId = (id: PartnerId) => `${SITE_ORIGIN}/#partner-${id}`
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const newsNodeId = (item: NewsItem) => `${SITE_ORIGIN}/#news-${item.date}-${slug(item.outlet)}`

const organization = byId.get(`${SITE_ORIGIN}/#organization`)!

describe('JSON-LD entity graph', () => {
  it('has unique @ids', () => {
    const all = graph.map((node) => node['@id']).filter(Boolean)
    expect(new Set(all).size).toBe(all.length)
  })

  it('resolves every @id reference to a node in the graph', () => {
    const refs = JSON.stringify(graph).match(/\{"@id":"[^"]+"\}/g) ?? []
    for (const ref of refs) {
      const id = (JSON.parse(ref) as { '@id': string })['@id']
      expect(byId.has(id), `${id} is referenced but not defined`).toBe(true)
    }
  })

  it('describes the partnership as the Organization', () => {
    expect(organization['@type']).toBe('Organization')
    expect(organization.name).toBe(SITE_NAME)
    expect(organization.alternateName).toContain(SITE_SHORT_NAME)
    expect(organization.url).toBe(`${SITE_ORIGIN}/`)
    expect(organization.description).toBe(COPY.en.about.mission)
    expect(organization.knowsLanguage).toEqual([...LOCALES])
  })

  it('points the logo and image at files that exist', () => {
    const logo = organization.logo as { url: string }
    for (const url of [logo.url, organization.image as string]) {
      expect(url.startsWith(`${SITE_ORIGIN}/`)).toBe(true)
      expect(() => publicFile(url.slice(SITE_ORIGIN.length))).not.toThrow()
    }
  })

  it('lists every partner as a member, in the order the page shows them', () => {
    expect(ids(organization.member)).toEqual(PARTNERS.map((partner) => partnerNodeId(partner.id)))
  })

  it.each(PARTNERS.map((partner) => [partner.name, partner] as const))('names %s and links its site', (_name, partner) => {
    const node = byId.get(partnerNodeId(partner.id))!
    expect(node['@type']).toBe('Organization')
    expect(node.name).toBe(partner.name)
    expect(node.url).toBe(partner.url)
  })

  it('declares the two Powered By organizations as funders', () => {
    expect(ids(organization.funder)).toEqual(FUNDER_IDS.map(partnerNodeId))
  })

  it('lists every news story as a NewsArticle about the partnership', () => {
    expect(ids(organization.subjectOf)).toEqual(NEWS.map(newsNodeId))
    for (const item of NEWS) {
      const node = byId.get(newsNodeId(item))!
      expect(node['@type']).toBe('NewsArticle')
      expect(node.headline).toBe(item.headline)
      expect(node.url).toBe(item.url)
      expect(node.datePublished).toBe(item.date)
      expect((node.publisher as { name: string }).name).toBe(item.outlet)
      expect((node.about as { '@id': string })['@id']).toBe(`${SITE_ORIGIN}/#organization`)
    }
  })

  it('describes the website in both languages', () => {
    const website = byId.get(`${SITE_ORIGIN}/#website`)!
    expect(website.url).toBe(`${SITE_ORIGIN}/`)
    expect(website.name).toBe(SITE_NAME)
    expect(website.inLanguage).toEqual([...LOCALES])
  })

  it('places the partnership in the Old South End of Toledo, Ohio', () => {
    const place = byId.get(`${SITE_ORIGIN}/#old-south-end`)!
    expect(place.name).toBe('Old South End')
    expect(JSON.stringify(place.containedInPlace)).toContain('"Toledo"')
    expect(JSON.stringify(place.containedInPlace)).toContain('"Ohio"')
  })
})
