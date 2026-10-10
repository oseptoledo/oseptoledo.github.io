/**
 * Hand the browser a URL to open: here, the contact form's mailto: fallback.
 * A one-line seam so tests can observe the hand-off (jsdom does not implement
 * navigation and logs an error if asked to).
 */
export function openUrl(url: string): void {
  window.location.href = url
}
