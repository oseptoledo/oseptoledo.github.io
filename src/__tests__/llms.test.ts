import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_NAME } from '../constants'
import { COPY } from '../content/copy'
import { HORIZON } from '../content/horizon'
import { NEWS } from '../content/news'
import { PARTNERS, partnerById } from '../content/partners'
import { STATS, STATS_AS_OF } from '../content/stats'
import { MILESTONES } from '../content/timeline'

/**
 * public/llms.txt is the plain-text summary answer engines read. Like the
 * JSON-LD, it is a static copy of facts that live in src/content/, so every
 * block that repeats one is held to its source here. Prose blocks that only
 * llms.txt carries (the Pilot Zone paragraph, the "Formed" line) are not
 * checked; change them by hand alongside the page.
 */

const llms = readFileSync(join(process.cwd(), 'public', 'llms.txt'), 'utf8')

function section(heading: string): string {
  const start = llms.indexOf(`\n## ${heading}`)
  expect(start, `llms.txt has a "## ${heading}" section`).toBeGreaterThan(-1)
  const rest = llms.slice(start + 4 + heading.length)
  const end = rest.indexOf('\n## ')
  return end === -1 ? rest : rest.slice(0, end)
}

const bullets = (text: string) => text.split('\n').filter((l) => l.startsWith('- '))

describe('llms.txt', () => {
  it('opens with the partnership name', () => {
    expect(llms.startsWith(`# ${SITE_NAME}\n`)).toBe(true)
  })

  it('carries the mission and the about paragraph, word for word', () => {
    const about = section('About')
    expect(about).toContain(COPY.en.about.mission)
    expect(about).toContain(COPY.en.about.body)
  })

  it('lists every organizing group', () => {
    const groups = section('How the partnership is organized')
    for (const group of COPY.en.about.groups) expect(groups).toContain(`- ${group.title}: `)
  })

  it('states the key facts with their as-of date', () => {
    const facts = section(`Key facts (as of ${STATS_AS_OF})`)
    expect(bullets(facts)).toEqual(STATS.map((stat) => `- ${stat.value.en} ${stat.label.en}`))
  })

  it('lists every partner, in order, with its link, founding status and blurb', () => {
    expect(bullets(section('Partners'))).toEqual(
      PARTNERS.map(
        (p) => `- [${p.name}](${p.url})${p.founding ? ' (founding partner)' : ''}: ${p.blurb.en}`,
      ),
    )
  })

  it('lists every milestone, oldest first', () => {
    expect(bullets(section('Milestones'))).toEqual(
      [...MILESTONES].reverse().map((m) => `- ${m.when.en}, ${m.title.en}: ${m.body.en}`),
    )
  })

  it('lists what each partner is doing next', () => {
    expect(bullets(section("What's next"))).toEqual(
      HORIZON.map((item) => `- ${partnerById(item.partnerId).name}: ${item.body.en}`),
    )
  })

  it('links every news story', () => {
    expect(bullets(section('In the news'))).toEqual(
      NEWS.map((item) => `- [${item.headline}](${item.url}), ${item.outlet}, ${item.date}`),
    )
  })
})
