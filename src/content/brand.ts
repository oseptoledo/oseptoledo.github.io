/**
 * The ribbon mark: seven wavy bands, from the partnership's design canvas. One
 * band per color, top to bottom, with the stroke weights that give the mark its
 * rhythm. public/favicon.svg, public/apple-touch-icon.png and
 * public/images/osep-mark-512.png were rendered from these same values
 * (README.md, "Images"); re-render them if the mark changes.
 *
 * The light colors match the `--color-*` ribbon tokens in src/index.css. The
 * on-dark set is the design's brighter variant for the ink footer.
 */
export const RIBBON_COLORS = [
  '#c8283c',
  '#1fa3a8',
  '#f2b21b',
  '#7a3fa0',
  '#e86a2c',
  '#2f54c4',
  '#2e9e5b',
] as const

export const RIBBON_COLORS_ON_DARK = [
  '#e0445a',
  '#2fc0c5',
  '#f2b21b',
  '#a469c9',
  '#f08a4f',
  '#5b7fe6',
  '#46b874',
] as const

/** Band baselines (y) and stroke widths in the mark's 160×112 viewBox. */
export const MARK_BANDS = [
  { y: 23.0, width: 18.0 },
  { y: 38.3, width: 5.4 },
  { y: 50.9, width: 12.6 },
  { y: 62.6, width: 3.6 },
  { y: 72.5, width: 9.0 },
  { y: 83.3, width: 5.4 },
  { y: 96.8, width: 14.4 },
] as const
