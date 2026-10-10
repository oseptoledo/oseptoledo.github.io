import { COPY, type SiteCopy } from '../content/copy'
import { useLocale } from './locale'

/** The homepage copy in the page's language. */
export function useCopy(): SiteCopy {
  return COPY[useLocale()]
}
