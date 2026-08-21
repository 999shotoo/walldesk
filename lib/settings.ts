"use client"

import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"

import { DEFAULT_FIT_MODE, type FitMode } from "./wallpaper"

const STORE_FILE = "settings.json"
const FIT_MODE_KEY = "fitMode"
const WALLHAVEN_API_KEY = "wallhavenApiKey"

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
  hydrated: boolean
  error: string | null
  hydrate: () => Promise<void>
  setFitMode: (mode: FitMode) => Promise<void>
  setWallhavenApiKey: (key: string) => Promise<void>
}

export const useSettings = create<SettingsState>((set, get) => ({
  fitMode: DEFAULT_FIT_MODE,
  wallhavenApiKey: "",
  hydrated: false,
  error: null,

  hydrate: async () => {
    if (get().hydrated) return
    try {
      const store = await getStore()
      // Read both in one go; the feed waits on `hydrated` before its first
      // request so it doesn't fire anonymously and then refetch with the key.
      const [savedFitMode, savedKey] = await Promise.all([
        store.get<FitMode>(FIT_MODE_KEY),
        store.get<string>(WALLHAVEN_API_KEY),
      ])
      set({
        fitMode: savedFitMode ?? DEFAULT_FIT_MODE,
        wallhavenApiKey: savedKey ?? "",
        hydrated: true,
        error: null,
      })
    } catch (error: unknown) {
      // Settings falling back to defaults is recoverable; don't block the UI.
      // `hydrated` still flips so the feed is never left waiting forever.
      set({ hydrated: true, error: String(error) })
    }
  },

  setFitMode: async (mode) => {
    set({ fitMode: mode, error: null })
    try {
      const store = await getStore()
      await store.set(FIT_MODE_KEY, mode)
      await store.save()
    } catch (error: unknown) {
      set({ error: String(error) })
    }
  },

  setWallhavenApiKey: async (key) => {
    const trimmed = key.trim()
    set({ wallhavenApiKey: trimmed, error: null })
    try {
      const store = await getStore()
      await store.set(WALLHAVEN_API_KEY, trimmed)
      await store.save()
    } catch (error: unknown) {
      set({ error: String(error) })
    }
  },
}))
