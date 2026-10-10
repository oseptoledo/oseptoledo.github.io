import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface UseModalA11yOptions {
  isOpen: boolean
  onClose: () => void
  /** Receives focus back when the modal closes. Defaults to whatever had focus when it opened. */
  triggerRef?: RefObject<HTMLElement | null>
  /** Receives focus when the modal opens. Defaults to the first focusable element inside it. */
  initialFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Dialog behavior for an overlay: focus moves in on open and back to the
 * trigger on close, Tab and Shift+Tab cycle inside, Escape closes, and the page
 * behind stops scrolling. `initialFocusRef` lets the mobile menu land on its
 * close button rather than on the first focusable element inside it.
 */
export default function useModalA11y({
  isOpen,
  onClose,
  triggerRef,
  initialFocusRef,
}: UseModalA11yOptions) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    // Capture the element that had focus before modal opened
    previouslyFocused.current = (triggerRef?.current ?? document.activeElement) as HTMLElement | null

    // Move focus into the modal
    const frame = requestAnimationFrame(() => {
      if (!modalRef.current) return

      // Ensure the modal container itself is programmatically focusable
      // so the fallback .focus() works even when no focusable children exist
      if (!modalRef.current.getAttribute('tabindex')) {
        modalRef.current.setAttribute('tabindex', '-1')
      }

      const firstFocusable =
        initialFocusRef?.current ?? modalRef.current.querySelector<HTMLElement>(FOCUSABLE)
      if (firstFocusable) {
        firstFocusable.focus()
      } else {
        modalRef.current.focus()
      }
    })

    // Lock body scroll
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Escape key
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (focusable.length === 0) {
          // No focusable children — keep focus on the container itself
          // so Tab/Shift+Tab can't escape the modal
          e.preventDefault()
          modalRef.current.focus()
          return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        // Guard: if focus has escaped the modal (e.g. via programmatic focus
        // changes), pull it back to the appropriate edge element
        if (!modalRef.current.contains(document.activeElement)) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
          return
        }

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKey)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prev

      // Restore focus
      previouslyFocused.current?.focus()
    }
  }, [isOpen, onClose, triggerRef, initialFocusRef])

  return modalRef
}
