"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useSettings } from "./settings"
import { useOffline } from "./offline"
import {
  fetchWallpapers,
  feedKey,
  type Cursors,
  type FeedFilters,
  type FeedSource,
  type Provider,
  type ProviderError,
} from "./api"

/**
 * Marks the scrolling element so the infinite-scroll observer can use it as its
 * root. Without this the observer falls back to the viewport, and because the
 * feed actually scrolls inside a nested `overflow-auto` container, `rootMargin`
 * would be silently ignored — no prefetch, and a visible stall every time the
 * user reaches the bottom.
 */
export const SCROLL_CONTAINER_ATTR = "data-scroll-container"

/** How many extra pages to pull when a page turns out to be all duplicates. */
const MAX_EMPTY_ROUNDS = 3

/** Order-independent identity for a filter set, used to detect a real change. */
function canonicalFilterKey(filters: FeedFilters): string {
  return Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")
}

export type WallpaperFeed = {
  wallpapers: CombinedWallpaper[]
  /** A request is in flight. */
  loading: boolean
  /** No page has settled yet — the difference between "empty" and "not asked". */
  initialLoading: boolean
  hasMore: boolean
  errors: ProviderError[]
  loadMore: () => void
  retry: () => void
  sentinelRef: React.RefObject<HTMLDivElement | null>
}

export function useWallpaperFeed(
  filters: FeedFilters = {},
  {
    providers,
    enabled = true,
    source,
    sourceKey = "",
  }: {
    providers?: readonly Provider[]
    enabled?: boolean
    /**
     * Where pages come from. Defaults to the multi-provider search.
     *
     * The point of the override is everything below it: a collection view gets
     * the infinite-scroll observer, the cross-page dedupe, the generation guard
     * and the error handling unchanged, and only supplies its own pager.
     */
    source?: FeedSource
    /**
     * Identity of `source`, so switching to a different collection resets the
     * feed. Needed because `source` is a closure — a fresh one is built on every
     * render, so its reference cannot be used to detect a real change.
     */
    sourceKey?: string
  } = {}
): WallpaperFeed {
  const [wallpapers, setWallpapers] = useState<CombinedWallpaper[]>([])
  const [loading, setLoading] = useState(false)
  const [settled, setSettled] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [errors, setErrors] = useState<ProviderError[]>([])

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Both primitives, so these selectors are safe to read directly — zustand v5
  // hands the result straight to `useSyncExternalStore`, which needs a stable
  // reference between calls.
  const apiKey = useSettings((state) => state.wallhavenApiKey)
  const settingsHydrated = useSettings((state) => state.hydrated)
  const online = useOffline((state) => state.online)

  // `AppBoot` normally does this, but hydrating here too means a feed rendered
  // outside that layout still gets its key. `hydrate` returns early once done,
  // so the duplicate call is free.
  useEffect(() => {
    void useSettings.getState().hydrate()
  }, [])

  /**
   * Hold the first request until the stored key is available. Firing before
   * then would send an anonymous page and then immediately refetch once the key
   * landed — a wasted round trip and a visible flash as the grid cleared.
   * Hydration is a local file read, and `hydrated` flips even when it fails, so
   * this cannot stall the feed.
   *
   * `online` is in here so offline mode is enforced in one place rather than at
   * each of the four browse surfaces: no feed anywhere can fire a request that is
   * certain to fail. It also gives recovery for free — this is a dependency of the
   * reset effect below, so the feed reloads itself the moment the connection is
   * confirmed back.
   */
  const ready = enabled && settingsHydrated && online

  // Latest values, read inside the stable `load` callback so that changing a
  // filter does not rebuild the callback and re-trigger the observer effect.
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const providersRef = useRef(providers)
  providersRef.current = providers
  const readyRef = useRef(ready)
  readyRef.current = ready
  const apiKeyRef = useRef(apiKey)
  apiKeyRef.current = apiKey
  const sourceRef = useRef(source)
  sourceRef.current = source

  const cursorsRef = useRef<Cursors>({})
  const seenRef = useRef<Set<string>>(new Set())
  const inFlightRef = useRef(false)
  const hasMoreRef = useRef(true)
  /** Bumped on every reset so results from a superseded filter set are dropped. */
  const generationRef = useRef(0)

  const load = useCallback(async () => {
    if (!readyRef.current || inFlightRef.current || !hasMoreRef.current) return

    const generation = generationRef.current
    inFlightRef.current = true
    setLoading(true)

    try {
      // A page can be entirely duplicates of what we already hold. Appending
      // nothing would leave the sentinel on screen without a new intersection
      // event, so the feed would silently stop; keep pulling instead.
      for (let round = 0; round < MAX_EMPTY_ROUNDS; round++) {
        const page = await (sourceRef.current ?? fetchWallpapers)({
          filters: filtersRef.current,
          cursors: cursorsRef.current,
          providers: providersRef.current,
          apiKey: apiKeyRef.current,
        })

        if (generation !== generationRef.current) return

        cursorsRef.current = page.cursors
        hasMoreRef.current = page.hasMore
        setHasMore(page.hasMore)
        setErrors(page.errors)

        // Every provider failed and nothing came back. That looks like a dead
        // connection rather than a dead provider, so let the offline check decide
        // — it probes rather than trusting this, since a rate-limited response
        // reaches here too.
        if (page.errors.length > 0 && page.wallpapers.length === 0) {
          useOffline.getState().reportFailure()
        }

        const fresh = page.wallpapers.filter((wallpaper) => {
          const key = feedKey(wallpaper)
          if (seenRef.current.has(key)) return false
          seenRef.current.add(key)
          return true
        })

        if (fresh.length > 0) {
          setWallpapers((previous) => [...previous, ...fresh])
          return
        }

        if (!page.hasMore) return
      }
    } catch (error: unknown) {
      if (generation !== generationRef.current) return
      setErrors([
        {
          provider: "wallhaven",
          message: error instanceof Error ? error.message : String(error),
        },
      ])
      hasMoreRef.current = false
      setHasMore(false)
      // A thrown request is the strongest hint available that the network is gone.
      useOffline.getState().reportFailure()
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = false
        setLoading(false)
        setSettled(true)
      }
    }
  }, [])

  const filterKey = canonicalFilterKey(filters)
  const providerKey = (providers ?? []).join(",")

  // Reset and reload whenever the query, the filters, the provider set, the
  // source, or the API key changes — the accumulated items belong to the
  // previous request. The key is in here because it can widen what Wallhaven
  // returns.
  useEffect(() => {
    generationRef.current += 1
    cursorsRef.current = {}
    seenRef.current = new Set()
    inFlightRef.current = false
    hasMoreRef.current = true

    setWallpapers([])
    setErrors([])
    setHasMore(true)
    setSettled(false)
    setLoading(false)

    if (ready) void load()
  }, [filterKey, providerKey, sourceKey, ready, apiKey, load])

  /**
   * Infinite scroll.
   *
   * `wallpapers.length` is in the dependency list on purpose, and it is what
   * makes this work at all. `IntersectionObserver` reports *changes* in
   * intersection, and with a 1200px `rootMargin` the sentinel is usually still
   * inside the root's expanded rect after a page lands — one screenful of cards
   * does not push it 1200px clear. So it went: intersecting (fires, loads
   * page 1) → still intersecting (no event, ever again). The feed served one
   * page and then stopped, no matter how far you scrolled.
   *
   * Re-observing after each append forces a fresh initial callback, so the
   * question "is the sentinel still in range?" gets asked again. If it is, the
   * next page loads immediately; the loop ends when the content finally pushes
   * the sentinel out of range or the provider runs out. `inFlightRef` keeps the
   * re-observations from stacking requests.
   */
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || !ready) return

    const root = sentinel.closest(`[${SCROLL_CONTAINER_ATTR}]`)
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load()
      },
      { root, rootMargin: "1200px" }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, ready, load, wallpapers.length])

  return {
    wallpapers,
    loading,
    initialLoading: !settled && wallpapers.length === 0,
    hasMore,
    errors,
    loadMore: load,
    retry: load,
    sentinelRef,
  }
}
