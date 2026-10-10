import { createContext, useContext } from 'react'

/**
 * The site ships in English and Spanish. Each language is its own prerendered
 * page (`/` and `/es`) with its own `<html lang>`, title, description and
 * canonical, and both pages declare each other with hreflang alternates. There
 * is no runtime translation: the locale is fixed per page at build time, so the
 * served HTML a crawler reads is already in the right language.
 */
export type Locale = 'en' | 'es'

export const LOCALES: readonly Locale[] = ['en', 'es']

/** A value written once per language. TypeScript fails the build if one is missing. */
export type Localized<T = string> = Record<Locale, T>

/** Pathname of each language's homepage. Mirrors the routes in src/entry-prerender.tsx. */
export const LOCALE_HOME_PATH: Localized = { en: '/', es: '/es' }

/** Language names as written in that language, for the language switcher. */
export const LOCALE_NAME: Localized = { en: 'English', es: 'Español' }

/** Open Graph locale codes (`og:locale`). */
export const OG_LOCALE: Localized = { en: 'en_US', es: 'es_US' }

export const LocaleContext = createContext<Locale>('en')

/** The page's language. Defaults to English outside a provider (the 404 page). */
export function useLocale(): Locale {
  return useContext(LocaleContext)
}
