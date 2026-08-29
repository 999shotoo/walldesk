"use client"

import { useMemo } from "react"
import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"

import { toastError } from "./toast"

const STORE_FILE = "favorites.json"
const FAVORITES_KEY = "favorites"

/** Stable identity for a wallpaper. Ids are only unique within a provider. */
export function wallpaperKey(wallpaper: { id: string; provider?: string }): string {
  return `${wallpaper.provider ?? "unknown"}:${wallpaper.id}`
}

/**
 * Loading the store is deferred rather than done at module scope: the plugin is
 * only available inside the Tauri webview, so importing this module in a plain
 * browser context (or during the static export build) must not throw.
 */
let storePromise: Promise<Store> | null = null
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { defaults: {}, autoSave: true })
  }
  return storePromise
}

type FavoritesState = {
  /** Whole wallpaper objects, so the favorites view renders without refetching. */
  favorites: Record<string, CombinedWallpaper>
  hydrated: boolean
  hydrate: () => Promise<void>
  toggleFavorite: (wallpaper: CombinedWallpaper) => Promise<void>
}

/**
 * The read in flight, if any.
 *
 * `hydrated` is not a sufficient guard on its own: it is only set once the awaited
 * read comes back, so two callers mounting in the same tick — `AppBoot` and a page
 * that hydrates defensively — both get past it and both read the file. That was
 * merely wasteful when a failure set an `error` field both would set identically;
 * now that a failure raises a toast, it would report one problem twice.
 *
 * Same shape as `storePromise` above, and cleared on settle so a future caller can
 * retry if this one failed.
 */
let hydratePromise: Promise<void> | null = null

export const useFavorites = create<FavoritesState>((set, get) => ({
  favorites: {},
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return Promise.resolve()

    hydratePromise ??= (async () => {
      try {
        const store = await getStore()
        const saved =
          (await store.get<Record<string, CombinedWallpaper>>(FAVORITES_KEY)) ?? {}
        set({ favorites: saved, hydrated: true })
      } catch (error: unknown) {
        // A failed hydrate must not block the UI — favorites just start empty.
        set({ hydrated: true })
        toastError("Your favorites could not be read from disk", error)
      }
    })().finally(() => {
      hydratePromise = null
    })

    return hydratePromise
  },

  toggleFavorite: async (wallpaper) => {
    const key = wallpaperKey(wallpaper)
    const next = { ...get().favorites }
    const removing = Boolean(next[key])

    if (removing) delete next[key]
    else next[key] = wallpaper

    // Update optimistically so the heart responds immediately, then persist.
    set({ favorites: next })

    try {
      const store = await getStore()
      await store.set(FAVORITES_KEY, next)
      await store.save()
    } catch (error: unknown) {
      // Only the write failed, so the heart in the UI is now telling the user
      // something that will not survive a restart. Worth interrupting for — and
      // phrased around the thing they just clicked, since a bare store error
      // means nothing next to a heart icon.
      toastError(
        removing
          ? "That wallpaper was un-favorited, but the change was not saved"
          : "That wallpaper was favorited, but the change was not saved",
        error
      )
    }
  },
}))

/** Subscribe to just one wallpaper's favorite state, to avoid needless re-renders. */
export function useIsFavorite(wallpaper: { id: string; provider?: string }): boolean {
  const key = wallpaperKey(wallpaper)
  return useFavorites((state) => Boolean(state.favorites[key]))
}

/**
 * The saved wallpapers as a list.
 *
 * The `Object.values` has to happen in a memo, not in the selector: zustand v5
 * feeds the selector's result straight to `useSyncExternalStore`, which requires
 * a stable reference between calls. Deriving inside the selector returns a new
 * array every time and React treats each one as a fresh snapshot — an infinite
 * render loop. The `favorites` record only changes identity on a real toggle.
 */
export function useFavoriteList(): CombinedWallpaper[] {
  const favorites = useFavorites((state) => state.favorites)
  return useMemo(() => Object.values(favorites), [favorites])
}
