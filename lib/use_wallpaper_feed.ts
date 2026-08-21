"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useSettings } from "./settings"
import {
  fetchWallpapers,
  feedKey,
  type Cursors,
  type FeedFilters,
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
  }: { providers?: readonly Provider[]; enabled?: boolean } = {}
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
   */
  const ready = enabled && settingsHydrated

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
        const page = await fetchWallpapers({
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

  // Reset and reload whenever the query, the filters, the provider set, or the
  // API key changes — the accumulated items belong to the previous request. The
  // key is in here because it can widen what Wallhaven returns.
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
  }, [filterKey, providerKey, ready, apiKey, load])

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
  }, [hasMore, ready, load])

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
