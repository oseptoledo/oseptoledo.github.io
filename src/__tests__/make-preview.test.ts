import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  PREVIEW_ROBOTS_META,
  PREVIEW_ROBOTS_TXT,
  makePreview,
  toPreviewHtml,
} from '../../scripts/make-preview.mjs'

/**
 * scripts/make-preview.mjs turns the production build into the temporary
 * GitHub Pages preview (.github/workflows/pages.yml). It runs on a COPY of the
 * built dist/ here, because the other suites read dist/ as production.
 * Requires a prior `npm run build`.
 */

const DIST = join(process.cwd(), 'dist')
const work = mkdtempSync(join(tmpdir(), 'osep-preview-'))

afterAll(() => rmSync(work, { recursive: true, force: true }))

describe('make-preview', () => {
  it('needs a build to work on', () => {
    expect(existsSync(DIST), 'dist/ not found. Run `npm run build` first.').toBe(true)
  })

  it('marks every built page noindex, nofollow and changes nothing inside #root', () => {
    cpSync(DIST, work, { recursive: true })
    const pages = makePreview(work)
    expect(pages.sort()).toEqual(readdirSync(DIST).filter((name) => name.endsWith('.html')).sort())
    for (const name of pages) {
      const before = readFileSync(join(DIST, name), 'utf8')
      const after = readFileSync(join(work, name), 'utf8')
      expect(after.match(/<meta name="robots"[^>]*>/g)).toEqual([PREVIEW_ROBOTS_META])
      const root = (html: string) => html.slice(html.indexOf('<div id="root">'))
      expect(root(after)).toBe(root(before))
    }
  })

  it('asks every crawler to stay out of the preview', () => {
    expect(readFileSync(join(work, 'robots.txt'), 'utf8')).toBe(PREVIEW_ROBOTS_TXT)
    expect(PREVIEW_ROBOTS_TXT).toMatch(/^User-agent: \*\nDisallow: \/\n$/)
  })

  it('refuses a page without exactly one robots meta tag', () => {
    expect(() => toPreviewHtml('<html><head></head></html>', 'x.html')).toThrow(/found 0/)
    const twice = '<meta name="robots" content="index" /><meta name="robots" content="index" />'
    expect(() => toPreviewHtml(twice, 'y.html')).toThrow(/found 2/)
  })
})
