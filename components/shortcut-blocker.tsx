"use client"

import { useEffect } from "react"

// Prevent common browser shortcuts (reload, devtools, close tab) inside the app
export default function ShortcutBlocker() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey // metaKey covers macOS Command
      const shift = e.shiftKey

      // Common combos to block
      const shouldBlock = (
        // F5
        key === "f5" ||
        // Ctrl/Cmd+R (reload)
        (ctrl && key === "r") ||
        // Ctrl+Shift+R or Cmd+Shift+R (hard reload)
        (ctrl && shift && key === "r") ||
        // Ctrl+W or Cmd+W (close tab/window)
        (ctrl && key === "w") ||
        // F12 (devtools) or Ctrl+Shift+I/J/C
        key === "f12" ||
        (ctrl && shift && (key === "i" || key === "j" || key === "c"))
      )

      if (shouldBlock) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return false
      }
    }

    // also block Ctrl+MouseWheel zoom and pinch gestures at document level if needed
    const wheelHandler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return false
      }
    }

    window.addEventListener("keydown", handler, { capture: true })
    window.addEventListener("wheel", wheelHandler, { passive: false, capture: true })

    // prevent programmatic copying / selection outside of inputs
    const copyHandler = (e: ClipboardEvent) => {
      const target = e?.target as HTMLElement | null
      if (!target) return
      const name = target.tagName.toLowerCase()
      const isEditable = target.isContentEditable || name === 'input' || name === 'textarea'
      if (!isEditable) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return false
      }
    }

    const selectionStartHandler = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const name = target.tagName?.toLowerCase()
      const isEditable = target.isContentEditable || name === 'input' || name === 'textarea'
      if (!isEditable) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return false
      }
    }

    window.addEventListener('copy', copyHandler, { capture: true })
    window.addEventListener('cut', copyHandler, { capture: true })
    window.addEventListener('selectionstart', selectionStartHandler, { capture: true })

    return () => {
      window.removeEventListener("keydown", handler, { capture: true })
      window.removeEventListener("wheel", wheelHandler, { capture: true })
      window.removeEventListener('copy', copyHandler, { capture: true })
      window.removeEventListener('cut', copyHandler, { capture: true })
      window.removeEventListener('selectionstart', selectionStartHandler, { capture: true })
    }
  }, [])

  return null
}
