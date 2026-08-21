"use client"

import { useMemo } from "react"
import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"

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
  error: string | null
  hydrate: () => Promise<void>
  toggleFavorite: (wallpaper: CombinedWallpaper) => Promise<void>
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  favorites: {},
  hydrated: false,
  error: null,

  hydrate: async () => {
    if (get().hydrated) return
    try {
      const store = await getStore()
      const saved =
        (await store.get<Record<string, CombinedWallpaper>>(FAVORITES_KEY)) ?? {}
      set({ favorites: saved, hydrated: true, error: null })
    } catch (error: unknown) {
      // A failed hydrate must not block the UI — favorites just start empty.
      set({ hydrated: true, error: String(error) })
    }
  },

  toggleFavorite: async (wallpaper) => {
    const key = wallpaperKey(wallpaper)
    const next = { ...get().favorites }

    if (next[key]) delete next[key]
    else next[key] = wallpaper

    // Update optimistically so the heart responds immediately, then persist.
    set({ favorites: next, error: null })

    try {
      const store = await getStore()
      await store.set(FAVORITES_KEY, next)
      await store.save()
    } catch (error: unknown) {
      set({ error: String(error) })
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
