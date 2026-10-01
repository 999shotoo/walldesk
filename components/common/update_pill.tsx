"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { toastError } from "@/lib/toast"

const PROGRESS_EVENT = "update://progress"

type UpdateProgress = {
  downloaded: number
  total: number | null
}

type Phase = "loading" | "available" | "downloading" | "restarting" | "done"

/**
 * A persistent Discord-style pill announcing an app update.
 *
 * The update check itself runs in Rust during the splash (`setup` in lib.rs),
 * which is why the app seems to make the decision before the window exists: this
 * component only asks for the verdict and renders if there is one.
 *
 * The pill sits fixed at the window's bottom edge, above the toast viewport, so
 * it can be acknowledged without competing with per-action notifications. It is
 * cheap to ignore — X dismisses it for the session — but it does not vanish on
 * its own, because an unapplied update is something the user will hit the moment
 * the installer asks them to restart.
 */
export function UpdatePill() {
  const [phase, setPhase] = useState<Phase>("loading")
  const [version, setVersion] = useState<string | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const unlistenRef = useRef<UnlistenFn | null>(null)
  const installingRef = useRef(false)

  // Only ever one install in flight; guard against React 19 double effects.
  const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const startedInstalling = () => (busyRef.current = true)

    const ask = async () => {
      try {
        // In a plain browser (Next static export preview) there is no backend,
        // so a failed invoke means "not a desktop app": stay silent.
        const status = await invoke<{ available: boolean; version: string | null }>(
          "check_for_update"
        )
        if (cancelled || installingRef.current) return
        if (status.available) {
          setVersion(status.version)
          setPhase("available")
        } else {
          setDismissed(true) // nothing to show; drop out silently
        }
      } catch (error: unknown) {
        console.warn("could not check for app updates", error)
        if (!cancelled) setDismissed(true)
      }
    }
    void ask()

    const unlistenPromise = listen<UpdateProgress>(PROGRESS_EVENT, (event) => {
      const { downloaded, total } = event.payload
      if (total) {
        setPercent(Math.round((downloaded / total) * 100))
      }
      // The backend restarts the app once install finishes, so "done" is only
      // reached in the browser where restart is a no-op that resolves.
      setPhase("downloading")
      void startedInstalling
    })
    unlistenPromise.then((fn) => {
      if (cancelled) {
        fn()
      } else {
        unlistenRef.current = fn
      }
    })

    return () => {
      cancelled = true
      unlistenRef.current?.()
    }
  }, [])

  const dismiss = useCallback(() => setDismissed(true), [])

  const update = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    installingRef.current = true
    setPhase("downloading")
    setPercent(0)
    try {
      // install_update installs the bundle and restarts the app itself; in the
      // browser this throws, and we fall through to restoring the pill.
      await invoke("install_update")
      setPhase("done")
      setDismissed(true)
    } catch (error: unknown) {
      setPhase("available")
      busyRef.current = false
      installingRef.current = false
      toastError("Update failed", error)
    }
  }, [])

  // Loading state: do not paint while asking the backend.
  // (The pill is intentionally resolved before mount in the common case, so this
  //  branch is short-lived.)
  if (dismissed || phase === "loading") return null

  const isWorking = phase === "downloading" || phase === "restarting"

  return (
    <div className="pointer-events-auto fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-4 sm:bottom-4 sm:justify-end">
      <div
        role="status"
        aria-live="polite"
        className="bg-card border-border/70 text-card-foreground shadow-lg flex w-full max-w-md items-center gap-3 rounded-xl border px-4 py-3"
      >
        {isWorking ? (
          <Loader2 className="text-primary h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Sparkles className="text-primary h-4 w-4 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          {isWorking ? (
            <>
              <p className="text-sm font-medium">
                {phase === "restarting"
                  ? "Restarting to apply update…"
                  : "Downloading update…"}
              </p>
              <div className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${percent ?? 0}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">
                Update available{version ? ` — v${version}` : ""}
              </p>
              <p className="text-muted-foreground text-xs">
                A new version is ready. Restart to apply it.
              </p>
            </>
          )}
        </div>

        <Button size="sm" onClick={() => void update()} disabled={isWorking}>
          <RefreshCw
            className={isWorking ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
          {isWorking ? "Installing…" : "Restart & Update"}
        </Button>

        <button
          type="button"
          onClick={dismiss}
          disabled={isWorking}
          aria-label="Dismiss update"
          className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
