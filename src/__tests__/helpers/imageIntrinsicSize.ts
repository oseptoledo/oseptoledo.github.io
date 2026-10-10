import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'

/**
 * Reads an image's true intrinsic size out of the file in `public/`, so tests
 * can check an `<img>`'s width/height attributes against the pixels rather than
 * against a number retyped into the test. It reads the WebP flavors this site
 * ships: lossy photos ("VP8 "), and logos with transparency, which libwebp
 * writes as extended ("VP8X") files; plus baseline JPEG, for the social share
 * image.
 *
 * Declaring dimensions an image does not have is worse than declaring none: the
 * browser reserves a box of the wrong shape and then reflows when the pixels
 * arrive, which is the layout shift the attributes exist to prevent.
 *
 * Throws on any other format rather than guessing. Paths resolve from
 * `process.cwd()` (the repo root under Vitest; `import.meta.url` is not a file
 * URL under jsdom).
 */

const PUBLIC_DIR = join(process.cwd(), 'public')
const PNG_SIGNATURE = '\x89PNG\r\n\x1a\n'
/** Start code that opens a VP8 keyframe header, per RFC 6386 §9.1. */
const VP8_KEYFRAME_START_CODE = '9d012a'

export interface IntrinsicSize {
  width: number
  height: number
}

/** Absolute path of a public URL path (`/images/foo.webp`), failing if the file is missing. */
export function publicFile(publicPath: string): string {
  const path = join(PUBLIC_DIR, publicPath.replace(/^\/+/, ''))
  if (!existsSync(path)) {
    throw new Error(`${publicPath} does not exist under public/; an <img> points at a file that will 404.`)
  }
  return path
}

export function intrinsicSize(publicPath: string): IntrinsicSize {
  const bytes = readFileSync(publicFile(publicPath))

  // PNG: 8-byte signature, then IHDR with big-endian width and height at 16 and 20.
  if (bytes.subarray(0, 8).toString('latin1') === PNG_SIGNATURE) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }

  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    const fourCC = bytes.subarray(12, 16).toString('latin1')
    if (fourCC === 'VP8 ') {
      // Lossy: a VP8 keyframe header, then 14-bit little-endian width and height.
      if (bytes.subarray(23, 26).toString('hex') !== VP8_KEYFRAME_START_CODE) {
        throw new Error(`${publicPath} has no VP8 keyframe start code; it is not a still image.`)
      }
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
    }
    if (fourCC === 'VP8X') {
      // Extended: the canvas size, each a 24-bit little-endian value minus one.
      return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 }
    }
    if (fourCC === 'VP8L') {
      // Lossless: after the 0x2f signature, two 14-bit fields, each the size minus one.
      const bits = bytes.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    throw new Error(`${publicPath} is a WebP in the unknown "${fourCC}" flavor.`)
  }

  // JPEG: walk the marker segments to the first start-of-frame (SOF0 to SOF15,
  // except DHT, JPG and DAC), whose height and width are big-endian at +5 and +7.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) break
      const marker = bytes[offset + 1]
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
      if (isFrame) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) }
      offset += 2 + bytes.readUInt16BE(offset + 2)
    }
    throw new Error(`${publicPath} is a JPEG with no start-of-frame segment.`)
  }

  throw new Error(`${publicPath} is not a PNG, WebP or JPEG; this parser cannot size it.`)
}

/**
 * Asserts that an `<img>` declares intrinsic dimensions, that they are the real
 * dimensions of the file its `src` points at, and that every `srcset`
 * candidate exists and is as wide as its `w` descriptor says.
 */
export function expectSizedFromItsOwnFile(img: Element | null | undefined): void {
  expect(img, 'expected an <img>, found none').toBeTruthy()
  const src = img!.getAttribute('src')
  expect(src, '<img> has no src').toBeTruthy()

  const { width, height } = intrinsicSize(src!)
  expect(img, `${src} should declare its intrinsic width`).toHaveAttribute('width', String(width))
  expect(img, `${src} should declare its intrinsic height`).toHaveAttribute('height', String(height))

  const srcSet = img!.getAttribute('srcset')
  if (!srcSet) return
  expect(img, `${src} has a srcset, so it needs sizes`).toHaveAttribute('sizes')
  for (const candidate of srcSet.split(',').map((part) => part.trim())) {
    const [url, descriptor] = candidate.split(/\s+/)
    expect(descriptor, `${url} in ${src}'s srcset needs a w descriptor`).toMatch(/^\d+w$/)
    expect(intrinsicSize(url).width, `${url} is not ${descriptor} wide`).toBe(Number.parseInt(descriptor, 10))
    // Every candidate is the same photo, so the same shape, within a pixel of rounding.
    const candidateSize = intrinsicSize(url)
    expect(Math.abs(candidateSize.width / candidateSize.height - width / height)).toBeLessThan(0.01)
  }
}
