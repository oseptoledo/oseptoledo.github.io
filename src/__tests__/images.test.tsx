import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IMAGES } from '../content/images'
import { PARTNERS } from '../content/partners'
import { HomeEnglish, HomeSpanish } from '../pages/Home'
import { expectSizedFromItsOwnFile, intrinsicSize } from './helpers/imageIntrinsicSize'

/**
 * Every image the homepage renders declares its true intrinsic size (so the
 * browser reserves the right box and nothing shifts when it arrives), every
 * responsive candidate exists at the width it claims, and alt text follows the
 * page's language. Sizes are read from the files, never retyped here.
 */
describe.each([
  ['English', HomeEnglish, 'en'],
  ['Spanish', HomeSpanish, 'es'],
] as const)('%s homepage images', (_label, Page, locale) => {
  it('sizes every <img> from its own file, srcset candidates included', () => {
    const { container, unmount } = render(<Page />)
    const images = container.querySelectorAll('img')
    expect(images.length).toBeGreaterThan(10)
    images.forEach((img) => expectSizedFromItsOwnFile(img))
    unmount()
  })

  it('gives every photograph alt text in the page’s language', () => {
    const { container, unmount } = render(<Page />)
    for (const image of Object.values(IMAGES)) {
      const img = container.querySelector(`img[src="${image.src}"]`)
      expect(img, `${image.src} is not on the page`).toBeTruthy()
      expect(img).toHaveAttribute('alt', image.alt[locale])
    }
    unmount()
  })

  it('loads only the hero photo at high priority and lazy-loads everything below the fold', () => {
    const { container, unmount } = render(<Page />)
    const high = container.querySelectorAll('img[fetchpriority="high"]')
    expect(high).toHaveLength(1)
    expect(high[0]).toHaveAttribute('src', IMAGES.heroBroadway.src)
    expect(container.querySelector(`img[src="${IMAGES.pilotZoneMap.src}"]`)).toHaveAttribute('loading', 'lazy')
    unmount()
  })
})

describe('partner logos', () => {
  it('declare the size of the file they point at', () => {
    for (const partner of PARTNERS) {
      expect(intrinsicSize(partner.logo.src), partner.name).toEqual({
        width: partner.logo.width,
        height: partner.logo.height,
      })
    }
  })
})
