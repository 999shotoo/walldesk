"use client"

import { create } from "zustand"

import {
  DEFAULT_PALETTE,
  PALETTE_ATTRIBUTE,
  PALETTE_STORAGE_KEY,
  beginThemeSwitch,
  isPaletteId,
  type PaletteId,
} from "./theme"

type PaletteState = {
  palette: PaletteId
  /**
   * False until `hydrate` has read the stored value. Its main job is to make
   * `hydrate` idempotent — `AppBoot` and the settings picker both call it.
   */
  hydrated: boolean
  hydrate: () => void
  setPalette: (palette: PaletteId) => void
}

export const usePalette = create<PaletteState>((set, get) => ({
  palette: DEFAULT_PALETTE,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return

    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(PALETTE_STORAGE_KEY)
    } catch {
      // Private mode or a locked-down webview — the default is fine.
    }

    // The inline bootstrap in app/layout.tsx already put an attribute on
    // <html>; reading it back as a second choice keeps this store in step with
    // what is on screen even if localStorage held something unrecognised.
    const fromDom = document.documentElement.getAttribute(PALETTE_ATTRIBUTE)
    const resolved = isPaletteId(stored)
      ? stored
      : isPaletteId(fromDom)
        ? fromDom
        : DEFAULT_PALETTE

    document.documentElement.setAttribute(PALETTE_ATTRIBUTE, resolved)
    set({ palette: resolved, hydrated: true })
  },

  setPalette: (palette) => {
    if (get().palette === palette) return

    beginThemeSwitch()
    document.documentElement.setAttribute(PALETTE_ATTRIBUTE, palette)
    set({ palette, hydrated: true })

    try {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, palette)
    } catch {
      // Losing persistence is not worth interrupting the switch for — the
      // palette still applies for this session.
    }
  },
}))
