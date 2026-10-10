import { useEffect } from 'react'

// Keys that express intent to scroll, so we stop re-anchoring the moment a
// keyboard user takes over (wheel/touch are handled via their own events).
const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar',
])

/**
 * Restores the scroll position for a `/#section` or `/es#section` cold load,
 * e.g. a shared link to `/#partners`, or the 404 page's links back home, which
 * are full page loads. The browser's own fragment scroll runs before React has rendered the
 * target, and scroll restoration or late-loading fonts and images can move
 * it afterward. We watch briefly and re-anchor only while the target has
 * actually drifted off the top — doing nothing once it's in place, and bailing
 * out the instant the user scrolls themselves (wheel, touch, or keyboard).
 */
export default function useHashScrollRestore() {
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return

    let attempts = 0
    let timer: number | undefined
    let stopped = false

    const stop = () => {
      stopped = true
      window.clearTimeout(timer)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', onKeydown)
    }
    const onKeydown = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) stop()
    }

    const tick = () => {
      if (stopped) return
      const el = document.getElementById(id)
      // Re-anchor only while the target is missing or off the top; skip the
      // work (and avoid fighting the user) once it's already in place.
      if (el && Math.abs(el.getBoundingClientRect().top) > 2) {
        // Force an instant jump that overrides the global `scroll-behavior:
        // smooth` (index.css) — without the `'instant'` ScrollBehavior value,
        // which some browsers reject. Inline style beats the stylesheet, and
        // restoring right after is safe because an auto scroll is synchronous.
        const html = document.documentElement
        const prev = html.style.scrollBehavior
        html.style.scrollBehavior = 'auto'
        el.scrollIntoView()
        html.style.scrollBehavior = prev
      }
      if (++attempts < 5) timer = window.setTimeout(tick, 200)
      else stop()
    }

    timer = window.setTimeout(tick, 0)
    window.addEventListener('wheel', stop, { once: true, passive: true })
    window.addEventListener('touchstart', stop, { once: true, passive: true })
    window.addEventListener('keydown', onKeydown)

    return stop
  }, [])
}
