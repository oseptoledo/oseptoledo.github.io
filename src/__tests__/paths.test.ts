import { describe, expect, it } from 'vitest'
import { normalizePath } from '../paths'

describe('normalizePath', () => {
  it.each([
    ['/', '/'],
    ['/es', '/es'],
    ['/es/', '/es'],
    ['/ES', '/es'],
    ['/Es//', '/es'],
    ['', '/'],
  ])('folds the document path %j to %j', (input, expected) => {
    expect(normalizePath(input)).toBe(expected)
  })

  it.each([['/index.html'], ['/Index.html'], ['/404.html'], ['/images/Logo.webp']])(
    'leaves %j alone, because its last segment has a dot',
    (input) => {
      expect(normalizePath(input)).toBe(input)
    },
  )
})
