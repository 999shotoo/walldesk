"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ImageOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { localImageSrc } from "@/lib/downloads"
import { Skeleton } from "@/components/ui/skeleton"

type LoadState = "loading" | "ready" | "missing"

/** How long the placeholder takes to fade out. Matches `duration-300` below. */
const FADE_MS = 300

/**
 * How long to wait for a decode before showing the image regardless.
 *
 * `decode()` only settles when the browser gets round to decoding, and it does
 * not get round to it while nothing is being painted — measured in a
 * deliberately non-compositing window, `load` fired after 9ms for a 6MB image
 * and the decode had still not resolved six seconds later. Without a cap that is
 * a card left pulsing over an image that is sitting there ready, until the window
 * is looked at again. Long enough that a real 4K decode wins the race; short
 * enough that losing it costs one blink.
 */
const DECODE_TIMEOUT_MS = 1200

/**
 * A file on disk, rendered with the three states it can actually be in.
 *
 * Local does not mean instant. These are full-size wallpapers — often 10MB+ at
 * 4K — and the webview still has to read and decode them, which takes long enough
 * to see. Before this existed the img was rendered bare, so the card sat blank with
 * no indication anything was happening, and a file the user had deleted from their
 * file manager showed as a broken-image glyph.
 *
 * The missing case is not hypothetical: the downloads ledger records a path, and
 * nothing stops the file being moved or deleted afterwards. That has to read as an
 * explanation, not as a rendering failure.
 */
export function LocalImage({
  path,
  alt,
  fallbackSrc,
  className,
  wrapperClassName,
  aspectRatio,
  eager = false,
  missingLabel = "File not found",
  onMissing,
}: {
  /** Absolute path on disk. */
  path: string
  alt: string
  /**
   * Used when the local file cannot be addressed at all — i.e. outside the Tauri
   * webview, where there is no `asset:` protocol. Not a fallback for a missing
   * file: if the path resolves and the file is gone, that is the missing state.
   */
  fallbackSrc?: string
  /** Classes for the `<img>` itself. */
  className?: string
  /** Classes for the box that reserves space and holds the placeholder. */
  wrapperClassName?: string
  /**
   * Reserved shape while loading, as width/height. Worth passing when the record
   * knows the wallpaper's dimensions — the placeholder is then exactly the size
   * the image will be, so nothing shifts when it appears.
   */
  aspectRatio?: number
  eager?: boolean
  missingLabel?: string
  /**
   * Called when the *local file* turns out not to be loadable — the app finding
   * out a file was deleted at the moment it tries to draw it, rather than on the
   * next disk sweep.
   *
   * Never fired for a failed `fallbackSrc`: that is a network image, and a flaky
   * connection or a dead thumbnail URL says nothing about what is on disk. Firing
   * there would report perfectly good files as missing in the browser preview,
   * where the local path can never resolve in the first place.
   */
  onMissing?: () => void
}) {
  const localSrc = localImageSrc(path)
  const src = localSrc ?? fallbackSrc ?? null
  const ref = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<LoadState>(src ? "loading" : "missing")

  /**
   * Whether the placeholder is still mounted.
   *
   * Tracked separately from `state` because it outlives it by one fade — see the
   * note where it is rendered.
   */
  const [veiled, setVeiled] = useState(Boolean(src))

  /** Bumped whenever `src` changes, so a decode that lands late is ignored. */
  const loadToken = useRef(0)

  // Held in a ref so the reporting effect below depends only on `src` and the
  // state. An inline arrow from the caller is a new function every render, and
  // depending on it directly would re-report on every unrelated re-render.
  const onMissingRef = useRef(onMissing)
  onMissingRef.current = onMissing

  /**
   * Take the image as loaded, once it can actually be painted.
   *
   * `load` is not that moment. With `decoding="async"` the browser is free to
   * decode on a later frame, and these are full-size wallpapers — a 4K file takes
   * long enough that dropping the placeholder on `load` leaves an empty card up
   * for several frames, which reads as the placeholder vanishing before the image
   * arrived. `decode()` resolves once the frame is ready, so by then there is
   * nothing left to wait for.
   *
   * Raced against `DECODE_TIMEOUT_MS` rather than awaited outright, and a
   * rejection counts as ready too: `decode` can fail, or never answer at all, for
   * reasons that do not stop the browser drawing the image the ordinary way. A
   * placeholder that never leaves is the worse outcome of the two.
   */
  const settle = useCallback((img: HTMLImageElement) => {
    // `complete` is also true for an image that finished *failing*, so the
    // decoded width is what separates the two.
    if (img.naturalWidth === 0) {
      setState("missing")
      return
    }

    const token = loadToken.current
    // Ignores a decode that lands after `src` moved on, which would otherwise
    // report the previous file's success against the current one.
    const ready = () => {
      if (token === loadToken.current) setState("ready")
    }

    if (typeof img.decode !== "function") {
      ready()
      return
    }

    const capped = window.setTimeout(ready, DECODE_TIMEOUT_MS)
    const finish = () => {
      window.clearTimeout(capped)
      ready()
    }
    void img.decode().then(finish, finish)
  }, [])

  // Re-arm when the file changes, or a second card would inherit the first's
  // resolved state and never show its own placeholder.
  useEffect(() => {
    loadToken.current += 1
    setState(src ? "loading" : "missing")

    // A cached or already-decoded image fires `load` before React attaches the
    // handler, and that event never comes back — the placeholder would stay up
    // forever. `complete` is the only way to catch it after the fact.
    const img = ref.current
    if (src && img?.complete) settle(img)
  }, [src, settle])

  // Unmount the placeholder a fade after the image is paintable, rather than in
  // the same commit that reveals it — an element removed on the frame its opacity
  // changes never gets to animate, and the reveal would be a hard cut.
  useEffect(() => {
    if (state === "loading") {
      setVeiled(true)
      return
    }
    // Straight off for `missing`: the notice below replaces the placeholder
    // instead of being revealed under it, so there is nothing to reveal.
    if (state === "missing") {
      setVeiled(false)
      return
    }
    const timer = window.setTimeout(() => setVeiled(false), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [state])

  // Reported from an effect rather than straight out of `onError`, so the one
  // callback covers both routes into the missing state — the error handler and
  // the already-failed-while-cached check above.
  useEffect(() => {
    if (state !== "missing") return
    // `localSrc` null means the path could not even be addressed — no webview.
    // That is not evidence about the disk, so it must not be reported.
    if (!localSrc) return
    onMissingRef.current?.()
  }, [state, localSrc])

  return (
    <div
      className={cn("relative overflow-hidden", wrapperClassName)}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {src && state !== "missing" && (
        // Plain <img>, not next/image: the source is an `asset:` URL, which the
        // loader cannot resolve — and next/image is unoptimized under
        // `output: 'export'` regardless.
        //
        // Rendered at full opacity throughout. Fading it in instead would leave
        // the card blank for the length of the fade, and could not be styled from
        // here anyway: callers pass their own `transition-*` (the hover zoom on a
        // download card) and tailwind-merge keeps only one per element.
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={(event) => settle(event.currentTarget)}
          onError={() => setState("missing")}
          className={className}
        />
      )}

      {/* The same `Skeleton` the grids use, so handing over from a page's
          placeholder grid to these is invisible — it used to be a hand-rolled
          pulse in a different colour, which read as one placeholder being
          swapped for another.

          Absolutely positioned, so it paints *over* the in-flow image no matter
          the DOM order: fading it out reveals an image that is already opaque
          underneath, with no dip in the middle the way a crossfade has. */}
      {veiled && (
        <Skeleton
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-none transition-opacity duration-300",
            state === "ready" && "animate-none opacity-0"
          )}
        />
      )}

      {/* In flow rather than overlaid, unlike the placeholder above: there is no
          img left to overlay, and this way the box still has a height even if the
          caller gave it none. */}
      {state === "missing" && (
        <div className="bg-muted text-muted-foreground flex h-full min-h-24 w-full flex-col items-center justify-center gap-1.5 p-3 text-center">
          <ImageOff className="h-5 w-5 shrink-0" />
          <span className="text-xs leading-tight">{missingLabel}</span>
        </div>
      )}
    </div>
  )
}
