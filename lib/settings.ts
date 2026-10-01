"use client"

import { create } from "zustand"
import { useMemo } from "react"
import { load, type Store } from "@tauri-apps/plugin-store"

import { toastError } from "./toast"
import { DEFAULT_FIT_MODE, type FitMode } from "./wallpaper"
import {
  DEFAULT_RESOLUTION_FILTER,
  coerceResolutionFilter,
  resolutionQuery,
  type ResolutionFilter,
  type ResolutionQuery,
} from "./resolution"

const STORE_FILE = "settings.json"
const FIT_MODE_KEY = "fitMode"
const WALLHAVEN_API_KEY = "wallhavenApiKey"
const SMOOTH_SCROLL_KEY = "smoothScroll"
const IMAGE_MOTION_KEY = "imageMotion"
/**
 * One key for the whole filter rather than four.
 *
 * The fields are only meaningful together — a `mode` without its `atleast`, or a
 * whitelist without the mode that sends it, is not a state the app can act on. A
 * single key means a read gets all of it or none of it, instead of four
 * independent reads that can land in any combination.
 */
const RESOLUTION_KEY = "resolution"

/**
 * Off unless asked for.
 *
 * Smooth scrolling is a preference, not an improvement: it puts an animation
 * between the wheel and the pixels, which some people read as fluid and others
 * read as lag — and it is the kind of thing that has to be opt-in on a desktop
 * app, where the native scroll is what every other window does.
 */
const DEFAULT_SMOOTH_SCROLL = false
const DEFAULT_IMAGE_MOTION = true

/**
 * Deferred for the same reason as the favorites store: the plugin only exists
 * inside the Tauri webview, so touching it at module scope would break the
 * static export build.
 */
let storePromise: Promise<Store> | null = null
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { defaults: {}, autoSave: true })
  }
  return storePromise
}

type SettingsState = {
  fitMode: FitMode
  /**
   * Optional Wallhaven key. Empty string means anonymous, which is the normal
   * case — Wallhaven's public endpoints need no account.
   */
  wallhavenApiKey: string
  /** Whether Lenis drives the main scroller. See `DEFAULT_SMOOTH_SCROLL`. */
  smoothScroll: boolean
  /** Whether image cards and thumbnail placeholders use animated transitions. */
  imageMotion: boolean
  /**
   * The resolution filter every browse surface starts from.
   *
   * A default rather than a lock: the search page copies this into its own state
   * and can narrow or widen it per search without writing back here.
   */
  resolution: ResolutionFilter
  hydrated: boolean
  hydrate: () => Promise<void>
  setFitMode: (mode: FitMode) => Promise<void>
  setWallhavenApiKey: (key: string) => Promise<void>
  setSmoothScroll: (enabled: boolean) => Promise<void>
  setImageMotion: (enabled: boolean) => Promise<void>
  setResolution: (filter: ResolutionFilter) => Promise<void>
}

/** The read in flight, if any — see the note on the one in lib/store.ts. */
let hydratePromise: Promise<void> | null = null

export const useSettings = create<SettingsState>((set, get) => ({
  fitMode: DEFAULT_FIT_MODE,
  wallhavenApiKey: "",
  smoothScroll: DEFAULT_SMOOTH_SCROLL,
  imageMotion: DEFAULT_IMAGE_MOTION,
  resolution: DEFAULT_RESOLUTION_FILTER,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return Promise.resolve()

    hydratePromise ??= (async () => {
      try {
        const store = await getStore()
        // Read them in one go; the feed waits on `hydrated` before its first
        // request so it doesn't fire anonymously and then refetch with the key.
        const [
          savedFitMode,
          savedKey,
          savedSmoothScroll,
          savedImageMotion,
          savedResolution,
        ] =
          await Promise.all([
            store.get<FitMode>(FIT_MODE_KEY),
            store.get<string>(WALLHAVEN_API_KEY),
            store.get<boolean>(SMOOTH_SCROLL_KEY),
            store.get<boolean>(IMAGE_MOTION_KEY),
            store.get<unknown>(RESOLUTION_KEY),
          ])
        set({
          fitMode: savedFitMode ?? DEFAULT_FIT_MODE,
          wallhavenApiKey: savedKey ?? "",
          smoothScroll: savedSmoothScroll ?? DEFAULT_SMOOTH_SCROLL,
          imageMotion: savedImageMotion ?? DEFAULT_IMAGE_MOTION,
          // Coerced rather than trusted: `settings.json` is a file on the user's
          // disk, so anything could be in there. An absent key coerces to the
          // default, which is also what a first run hits.
          resolution: coerceResolutionFilter(savedResolution),
          hydrated: true,
        })
      } catch (error: unknown) {
        // Settings falling back to defaults is recoverable; don't block the UI.
        // `hydrated` still flips so the feed is never left waiting forever.
        set({ hydrated: true })
        toastError("Your settings could not be read from disk", error)
      }
    })().finally(() => {
      hydratePromise = null
    })

    return hydratePromise
  },

  setFitMode: async (mode) => {
    set({ fitMode: mode })
    try {
      const store = await getStore()
      await store.set(FIT_MODE_KEY, mode)
      await store.save()
    } catch (error: unknown) {
      toastError("Your default fit could not be saved", error)
    }
  },

  setWallhavenApiKey: async (key) => {
    const trimmed = key.trim()
    set({ wallhavenApiKey: trimmed })
    try {
      const store = await getStore()
      await store.set(WALLHAVEN_API_KEY, trimmed)
      await store.save()
    } catch (error: unknown) {
      toastError("Your API key could not be saved", error)
    }
  },

  setSmoothScroll: async (enabled) => {
    // Set first: the scroller reads this straight out of the store, so the toggle
    // takes effect on the same frame it is flipped rather than after a disk write.
    set({ smoothScroll: enabled })
    try {
      const store = await getStore()
      await store.set(SMOOTH_SCROLL_KEY, enabled)
      await store.save()
    } catch (error: unknown) {
      toastError("Your smooth scrolling preference could not be saved", error)
    }
  },

  setImageMotion: async (enabled) => {
    set({ imageMotion: enabled })
    try {
      const store = await getStore()
      await store.set(IMAGE_MOTION_KEY, enabled)
      await store.save()
    } catch (error: unknown) {
      toastError("Your image animation preference could not be saved", error)
    }
  },

  setResolution: async (filter) => {
    // Same order as above: every browse feed reads this straight out of the
    // store, so the new filter is in effect before the disk write is attempted.
    set({ resolution: filter })
    try {
      const store = await getStore()
      await store.set(RESOLUTION_KEY, filter)
      await store.save()
    } catch (error: unknown) {
      toastError("Your resolution filter could not be saved", error)
    }
  },
}))

/**
 * The stored resolution filter as query parameters, ready to spread into a feed:
 *
 *     const feed = useWallpaperFeed({ ...POPULAR, ...useResolutionQuery() })
 *
 * Spread at the call site rather than injected inside `useWallpaperFeed` so that
 * a surface with its own filter — the search page, which overrides it per search
 * — is not fighting a default it cannot see. The trade is one extra line on each
 * browse page, which is worth it for the filter being visible where the feed is
 * built.
 *
 * Memoised on the filter object, which zustand only replaces when the value
 * actually changes. Returning a fresh object from the selector instead would
 * hand `useSyncExternalStore` a new reference on every store read and loop.
 */
export function useResolutionQuery(): ResolutionQuery {
  const filter = useSettings((state) => state.resolution)
  return useMemo(() => resolutionQuery(filter), [filter])
}
