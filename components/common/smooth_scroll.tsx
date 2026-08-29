"use client"

import { useEffect, useRef } from "react"
import Lenis from "lenis"
// `lenis-stopped` and `[data-lenis-prevent]` are styled from here rather than
// from `globals.css`, so the rules arrive with the only component that can
// produce those classes.
import "lenis/dist/lenis.css"

import { useSettings } from "@/lib/settings"
import { SCROLL_CONTAINER_ATTR } from "@/lib/use_wallpaper_feed"

/**
 * The app's scroll container, optionally driven by Lenis.
 *
 * This owns the element rather than being wrapped around it, and that is the
 * point. The obvious shape — `smooth ? <ReactLenis>…</ReactLenis> : <div>…</div>`
 * — changes the element type when the setting is toggled, which unmounts the
 * whole page underneath it: an in-progress edit in Settings is discarded the
 * instant you flip the switch that discards it. Rendering one element and
 * attaching Lenis to it in an effect keeps the DOM, the React tree and the scroll
 * position intact across a toggle.
 *
 * Lenis animates the container's real `scrollTop` rather than transforming the
 * content, so `IntersectionObserver` still sees the same geometry it always did
 * — which is what the feed's infinite scroll depends on, rooted on this very
 * element via `SCROLL_CONTAINER_ATTR`.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const enabled = useSettings((state) => state.smoothScroll)

  const wrapper = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled) return

    const wrapperEl = wrapper.current
    const contentEl = content.current
    if (!wrapperEl || !contentEl) return

    const lenis = new Lenis({
      // Both explicit: the defaults are `window` and `document.documentElement`,
      // and the window does not scroll in this app — the shell is a fixed-height
      // flex layout with one `overflow-auto` panel inside it.
      wrapper: wrapperEl,
      content: contentEl,
      // Lenis' own rAF loop. Off by default in the core package (only its React
      // wrapper turns it on), and without it nothing ever advances the animation.
      autoRaf: true,
      // 1.2 is the library default and reads as heavy for a desktop app, where a
      // wheel notch is expected to land somewhere near immediately.
      duration: 0.9,
      // Wheel only. `syncTouch` is what makes Lenis take over touch scrolling
      // too, and a trackpad or touchscreen already has inertia of its own —
      // layering a second easing curve on top of it feels slippery.
      smoothWheel: true,
      syncTouch: false,
      // So a scrollable child — a long `Select` list, a dialog body — keeps its
      // own scrolling instead of the wheel being captured by the page behind it.
      allowNestedScroll: true,
    })

    return () => lenis.destroy()
  }, [enabled])

  return (
    // The scroll root for infinite scroll. `min-h-0` is what lets it shrink
    // inside the flex column instead of overflowing it.
    <div
      ref={wrapper}
      className="min-h-0 flex-1 overflow-auto"
      {...{ [SCROLL_CONTAINER_ATTR]: true }}
    >
      <div ref={content} className="ml-1 p-4">
        {children}
      </div>
    </div>
  )
}
