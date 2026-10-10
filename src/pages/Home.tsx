import { useEffect } from 'react'
import About from '../components/About'
import Contact from '../components/Contact'
import Footer from '../components/Footer'
import Hero from '../components/Hero'
import Horizon from '../components/Horizon'
import Navbar from '../components/Navbar'
import News from '../components/News'
import Partners from '../components/Partners'
import PilotZone from '../components/PilotZone'
import PoweredBy from '../components/PoweredBy'
import Progress from '../components/Progress'
import RibbonBand from '../components/RibbonBand'
import useHashScrollRestore from '../hooks/useHashScrollRestore'
import { COPY } from '../content/copy'
import { LocaleContext, type Locale } from '../i18n/locale'

/**
 * The one-page site, in one language. Rendered at `/` (English) and `/es`
 * (Spanish); everything below reads the language from LocaleContext.
 */
function Home({ locale }: { locale: Locale }) {
  useHashScrollRestore()

  // The prerendered es.html already says <html lang="es">. `npm run dev`
  // serves the English template for every path, so set it here too.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <LocaleContext.Provider value={locale}>
      <a
        href="#main-content"
        className="btn btn-ink sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]"
      >
        {COPY[locale].skipLink}
      </a>
      <Navbar />
      <main id="main-content" tabIndex={-1} className="outline-none">
        <Hero />
        <RibbonBand />
        <About />
        <PilotZone />
        <Partners />
        <Progress />
        <Horizon />
        <News />
        <Contact />
        <PoweredBy />
      </main>
      <Footer />
    </LocaleContext.Provider>
  )
}

/** `/`. A named component per language so Root and the prerender registry share one reference. */
export function HomeEnglish() {
  return <Home locale="en" />
}

/** `/es`. */
export function HomeSpanish() {
  return <Home locale="es" />
}
