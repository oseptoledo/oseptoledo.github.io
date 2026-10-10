/**
 * What ErrorBoundary renders when the page itself fails. The boundary sits
 * outside the language provider, so the message is written in both languages.
 */
export default function ErrorFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="flex max-w-md flex-col gap-8 text-center">
        <div role="alert" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="m-0 text-3xl font-bold">Something went wrong</h1>
            <p className="m-0 text-umber">It’s on our end. Please refresh the page to try again.</p>
          </div>
          <div lang="es" className="flex flex-col gap-3">
            <p className="m-0 text-2xl font-bold">Algo salió mal</p>
            <p className="m-0 text-umber">El problema es nuestro. Actualice la página para intentarlo de nuevo.</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button type="button" onClick={() => window.location.reload()} className="btn btn-brick">
            Refresh · <span lang="es">Actualizar</span>
          </button>
          <a href="/" className="btn btn-outline">
            Home · <span lang="es">Inicio</span>
          </a>
        </div>
      </div>
    </div>
  )
}
