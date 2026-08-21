"use client"

import { useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"

import { useFavorites } from "@/lib/store"
import { useSettings } from "@/lib/settings"

/**
 * Boot sequence for the main window. Renders nothing.
 *
 * Two jobs:
 *
 * 1. Load persisted state off disk. This lives in a component rather than at
 *    module scope because `@tauri-apps/plugin-store` only exists inside the
 *    webview — importing it eagerly would break the static export build.
 * 2. Report readiness to the backend, which then closes the splash screen and
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

    const boot = async () => {
      // `allSettled`: a store that fails to read falls back to defaults, which
      // must not leave the window hidden forever.
      await Promise.allSettled([
        useFavorites.getState().hydrate(),
        useSettings.getState().hydrate(),
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
