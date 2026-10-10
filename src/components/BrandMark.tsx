import { MARK_BANDS, RIBBON_COLORS, RIBBON_COLORS_ON_DARK } from '../content/brand'

interface BrandMarkProps {
  className?: string
  /** The brighter ribbon set, for the ink footer. */
  onDark?: boolean
}

/**
 * The ribbon mark. Decorative wherever it appears: it always sits next to the
 * "OSE Partnership" wordmark or inside a link that carries the name, so it is
 * aria-hidden rather than given a role and label of its own.
 */
export default function BrandMark({ className, onDark = false }: BrandMarkProps) {
  const colors = onDark ? RIBBON_COLORS_ON_DARK : RIBBON_COLORS
  return (
    <svg viewBox="0 0 160 112" aria-hidden="true" focusable="false" className={className}>
      <g fill="none">
        {MARK_BANDS.map((band, i) => (
          <path
            key={band.y}
            d={`M0 ${band.y} q 20 -14 40 0 q 20 14 40 0 q 40 -18.2 80 0`}
            stroke={colors[i]}
            strokeWidth={band.width}
          />
        ))}
      </g>
    </svg>
  )
}
