"use client"

import { useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"

import { useFavorites } from "@/lib/store"
import { useCollections } from "@/lib/collections"
import { useDownloads } from "@/lib/downloads"
import { watchConnectivity } from "@/lib/offline"
import { useSettings } from "@/lib/settings"
import { usePalette } from "@/lib/use_palette"

/**
 * Boot sequence for the main window. Renders nothing.
 *
 * Three jobs:
 *
 * 1. Load persisted state off disk. This lives in a component rather than at
 *    module scope because `@tauri-apps/plugin-store` only exists inside the
 *    webview — importing it eagerly would break the static export build.
 * 2. Start watching connectivity, which decides whether the app runs in offline
 *    mode.
 * 3. Report readiness to the backend, which then closes the splash screen and
 *    reveals this window. The splash used to do this on a hardcoded 5s timer;
 *    signalling from here means the window appears when the UI is genuinely
 *    mounted instead of after a fixed wait.
 */
export function AppBoot() {
  const signalled = useRef(false)

  useEffect(() => {
    // React 19 strict mode runs effects twice in development; the handoff must
    // only happen once.
    if (signalled.current) return
    signalled.current = true

    // Synchronous and localStorage-backed, unlike the two stores below — the
    // colours are already on screen courtesy of the bootstrap script in the
    // root layout, this just brings the React store into step for the picker.
    usePalette.getState().hydrate()

    // Not awaited, and deliberately outside `boot`: the first connectivity probe
    // is a network round trip, and holding the splash screen open for it would
    // mean a slow connection delays launch. The app starts optimistic and
    // corrects itself a moment later.
    watchConnectivity()

    const boot = async () => {
      // `allSettled`: a store that fails to read falls back to defaults, which
      // must not leave the window hidden forever.
      await Promise.allSettled([
        useFavorites.getState().hydrate(),
        useSettings.getState().hydrate(),
        useCollections.getState().hydrate(),
        useDownloads.getState().hydrate(),
      ])

      try {
        await invoke("set_complete", { task: "frontend" })
      } catch (error: unknown) {
        console.warn("could not report frontend readiness", error)
      }
    }

    void boot()
  }, [])

  return null
}
