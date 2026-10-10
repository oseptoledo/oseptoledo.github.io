import type { SiteImage } from '../content/images'
import { useLocale } from '../i18n/locale'

interface SiteImgProps {
  image: SiteImage
  /** Required whenever the image has a `srcSet`: how wide it renders at each breakpoint. */
  sizes?: string
  className?: string
  /**
   * `lcp` for the one image that is the page's largest paint (the hero photo):
   * fetched eagerly at high priority. `eager` for other above-the-fold images.
   * Everything else lazy-loads.
   */
  loading?: 'lcp' | 'eager' | 'lazy'
}

/**
 * A photograph with its intrinsic size declared (so the browser reserves the
 * box before the pixels arrive), its responsive candidates, and alt text in the
 * page's language.
 */
export default function SiteImg({ image, sizes, className, loading = 'lazy' }: SiteImgProps) {
  const locale = useLocale()
  return (
    <img
      src={image.src}
      srcSet={image.srcSet}
      sizes={image.srcSet ? sizes : undefined}
      width={image.width}
      height={image.height}
      alt={image.alt[locale]}
      loading={loading === 'lazy' ? 'lazy' : 'eager'}
      fetchPriority={loading === 'lcp' ? 'high' : undefined}
      decoding={loading === 'lcp' ? undefined : 'async'}
      className={className}
    />
  )
}
