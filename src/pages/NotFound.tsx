import BrandMark from '../components/BrandMark'
import Footer from '../components/Footer'
import Wordmark from '../components/Wordmark'

/**
 * The 404 page. Root renders this for any pathname that is not a real route,
 * and scripts/prerender.mjs renders the same component into dist/404.html,
 * which CloudFront serves under a genuine 404 status for every unknown path
 * (the distribution's one errorResponses entry in infra/lib/website-stack.ts,
 * no SPA fallback). The prerender marks that file noindex and strips
 * its canonical and hreflang links: a page that exists to say "this URL is
 * wrong" must not vote for any URL.
 *
 * We cannot know which language the visitor wanted, so the message is in both.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-cream">
        <div className="site-container flex h-16 items-center xl:h-[88px]">
          <a href="/" aria-label="OSE Partnership home" className="flex items-center gap-2 text-ink no-underline xl:gap-3">
            <BrandMark className="h-6 w-[34px] xl:h-8 xl:w-[46px]" />
            <Wordmark />
          </a>
        </div>
      </header>
      <main id="main-content" className="site-container flex grow flex-col gap-12 py-14 md:py-20">
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="eyebrow m-0 text-brick">404</p>
          <h1 className="section-title">Page not found</h1>
          <p className="m-0 text-lg leading-[1.6] text-umber">
            The page you were looking for isn’t here. It may have moved, or the link may have a small typo.
          </p>
          <a href="/" className="btn btn-ink self-start">
            Go to the homepage
          </a>
        </div>
        <div lang="es" className="flex max-w-2xl flex-col gap-4 border-t border-line pt-10">
          <h2 className="section-title">Página no encontrada</h2>
          <p className="m-0 text-lg leading-[1.6] text-umber">
            La página que buscaba no está aquí. Es posible que se haya movido o que el enlace tenga un pequeño error.
          </p>
          <a href="/es" className="btn btn-outline self-start">
            Ir a la página principal
          </a>
        </div>
      </main>
      <Footer />
    </div>
  )
}
