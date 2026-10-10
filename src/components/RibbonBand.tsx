import { RIBBON_COLORS } from '../content/brand'

/**
 * The full-width ribbon band under the hero. Two drawings, as in the design:
 * a long, gentle wave for wide screens and a tighter one for phones, because a
 * single drawing stretched across both either flattens on desktop or crowds on
 * a phone. Pure decoration, so both are aria-hidden.
 */
const WIDE = {
  viewBox: '0 0 1440 72',
  start: -40,
  half: 90,
  rise: 12,
  repeats: 9,
  ys: [16.0, 24.5, 31.5, 38.0, 43.5, 49.5, 57.0],
  widths: [10, 3, 7, 2, 5, 3, 8],
}

const NARROW = {
  viewBox: '0 0 390 48',
  start: -30,
  half: 65,
  rise: 10,
  repeats: 4,
  ys: [12.0, 18.8, 24.4, 29.6, 34.0, 38.8, 44.8],
  widths: [8, 2.4, 5.6, 1.6, 4, 2.4, 6.4],
}

function wave(spec: typeof WIDE, y: number): string {
  const step = spec.half * 2
  const tail = ` t ${step} 0`.repeat(spec.repeats)
  return `M${spec.start} ${y} q ${spec.half} -${spec.rise} ${step} 0${tail}`
}

function Band({ spec, className }: { spec: typeof WIDE; className: string }) {
  return (
    <svg
      viewBox={spec.viewBox}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g fill="none">
        {spec.ys.map((y, i) => (
          <path key={y} d={wave(spec, y)} stroke={RIBBON_COLORS[i]} strokeWidth={spec.widths[i]} />
        ))}
      </g>
    </svg>
  )
}

export default function RibbonBand() {
  return (
    <div className="w-full">
      <Band spec={NARROW} className="block h-12 w-full md:hidden" />
      <Band spec={WIDE} className="hidden h-[72px] w-full md:block" />
    </div>
  )
}
