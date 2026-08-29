"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
// Not next/link — see the note in components/sidebar.tsx.
import { Link } from "next-transition-router"
import { ArrowLeft, Download, Heart, Monitor, TriangleAlert } from "lucide-react"

import { fetchWallpaperById } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useFavorites, useIsFavorite } from "@/lib/store"
import { useIsOffline } from "@/lib/offline"
import { useSettings } from "@/lib/settings"
import { toastLoading, toastProgress, toastSettle, errorText } from "@/lib/toast"
import {
  applyWallpaper,
  downloadHref,
  parentDir,
  saveWallpaperCopy,
  useDownload,
  useDownloads,
} from "@/lib/downloads"
import {
  FIT_MODES,
  FIT_MODE_LABELS,
  type DownloadProgress,
  type FitMode,
  formatBytes,
  onDownloadProgress,
} from "@/lib/wallpaper"
import { OfflineNotice } from "@/components/common/offline"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

/** What the two disk actions are called, and which one a run is. */
type DetailAction = "set" | "download"

/**
 * The transfer's byte readout, as one line of text.
 *
 * What the progress bar used to say beside itself. A toast has no room for the
 * bar, but the numbers are the part worth keeping — a large wallpaper on a slow
 * connection is the case this exists for.
 */
function progressText(progress: DownloadProgress): string {
  const total = progress.total
  if (total && total > 0) {
    const percent = Math.min(100, Math.round((progress.downloaded / total) * 100))
    return `${percent}% of ${formatBytes(total)}`
  }
  // Some providers send no Content-Length, so there is no percentage to compute
  // — count the bytes up instead of showing a fraction of nothing.
  return formatBytes(progress.downloaded)
}

function WallpaperDetail() {
  // Plain next/navigation router on purpose: next-transition-router's
  // `navigate` short-circuits `back()` before it stages a transition, so its
  // router would behave identically here with an extra layer in between.
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get("id")
  const provider = params.get("provider") ?? "wallhaven"

  const [wallpaper, setWallpaper] = useState<CombinedWallpaper | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fullResLoaded, setFullResLoaded] = useState(false)

  /** Whether a transfer is in flight — all the buttons need from it. */
  const [working, setWorking] = useState(false)
  /**
   * The toast reporting that transfer.
   *
   * A ref rather than state: the progress listener writes to it many times a
   * second and the id is not rendered, so re-rendering the page on every packet
   * would be waste. It is also read from inside a listener registered once per
   * transfer, which a state value would close over stale.
   */
  const pendingToast = useRef<string | null>(null)

  const isFavorite = useIsFavorite({ id: id ?? "", provider })
  const toggleFavorite = useFavorites((state) => state.toggleFavorite)

  const offline = useIsOffline()
  // So the offline state can offer the local copy of *this* wallpaper, if the
  // user happens to have one, instead of only pointing at the list.
  const downloaded = useDownload(id ? { id, provider } : null)

  // The saved default, overridable for this one wallpaper. Settings hydrate off
  // disk after mount, so adopt the stored value when it lands — unless the user
  // has already picked something here.
  const defaultFitMode = useSettings((state) => state.fitMode)
  const wallhavenApiKey = useSettings((state) => state.wallhavenApiKey)
  const settingsHydrated = useSettings((state) => state.hydrated)
  const [fitMode, setFitMode] = useState<FitMode>(defaultFitMode)
  const [fitOverridden, setFitOverridden] = useState(false)

  useEffect(() => {
    if (!fitOverridden) setFitMode(defaultFitMode)
  }, [defaultFitMode, fitOverridden])

  // Idempotent; guards against this page rendering before the layout's boot
  // step has hydrated settings, which would otherwise leave it on a skeleton.
  useEffect(() => {
    void useSettings.getState().hydrate()
    void useDownloads.getState().hydrate()
  }, [])

  useEffect(() => {
    if (!id) {
      setLoadError("No wallpaper was specified.")
      return
    }

    // Wait for the stored key, for the same reason the feed does: fetching
    // anonymously first would just be a discarded request.
    if (!settingsHydrated) return

    // Nothing here can succeed offline, and a failed request would surface as
    // "could not load this wallpaper" — which blames the wallpaper for a problem
    // with the connection. The offline branch below explains it properly.
    if (offline) return

    let cancelled = false
    setWallpaper(null)
    setLoadError(null)
    setFullResLoaded(false)

    fetchWallpaperById(provider, id, wallhavenApiKey)
      .then((result) => {
        if (cancelled) return
        if (result) setWallpaper(result)
        else setLoadError("That wallpaper could not be found.")
      })
      .catch((error: unknown) => {
        // `errorText` rather than `String`, which would prefix "Error: " to a
        // message shown to the user — the same reason the toasts use it.
        if (!cancelled) setLoadError(errorText(error))
      })

    return () => {
      cancelled = true
    }
  }, [id, provider, wallhavenApiKey, settingsHydrated, offline])

  // Progress events are global to the backend, so only listen while a transfer
  // is actually in flight.
  useEffect(() => {
    if (!working) return

    let unlisten: (() => void) | undefined
    let cancelled = false

    onDownloadProgress((progress) => {
      // Straight onto the pending toast. Updating a `loading` toast is safe in a
      // way updating any other kind is not: it was created without a dismiss
      // timer, so there is none for this to cut short.
      if (pendingToast.current !== null) {
        toastProgress(pendingToast.current, {
          description: progressText(progress),
        })
      }
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [working])

  /**
   * Save the file, and apply it if that is what was asked for.
   *
   * Both go through `lib/downloads`, which writes the file and records it in the
   * downloads ledger as one step. Applying counts as a download: it has to save
   * the file first, so the file exists either way and belongs in the list.
   */
  const run = useCallback(
    async (action: DetailAction) => {
      if (!wallpaper) return

      // No description: the first progress event fills it in, and anything put
      // here would be overwritten a moment later. The page already shows which
      // wallpaper this is, so the title has nothing to add either.
      const id = toastLoading(
        action === "set" ? "Applying wallpaper" : "Downloading"
      )
      pendingToast.current = id
      setWorking(true)

      try {
        if (action === "set") {
          await applyWallpaper(wallpaper, fitMode)
          toastSettle(id, {
            kind: "success",
            title: "Wallpaper applied",
            description: FIT_MODE_LABELS[fitMode],
          })
        } else {
          const record = await saveWallpaperCopy(wallpaper)
          // The folder, not the full path: where it went is the useful half, and
          // the filename is already the title of this toast.
          toastSettle(id, {
            kind: "success",
            title: `Saved ${record.filename}`,
            description: parentDir(record.path),
          })
        }
      } catch (error: unknown) {
        toastSettle(id, {
          kind: "error",
          title:
            action === "set"
              ? `${wallpaper.title} could not be set as your wallpaper`
              : `${wallpaper.title} could not be downloaded`,
          error,
        })
      } finally {
        pendingToast.current = null
        setWorking(false)
      }
    },
    [wallpaper, fitMode]
  )

  // Ahead of `loadError`: offline is the more specific explanation, and the
  // request was skipped rather than failed, so there is nothing to report anyway.
  if (offline) {
    return (
      <OfflineNotice message="This page loads the wallpaper from its provider, so it needs a connection.">
        {downloaded && (
          // The same wallpaper, from the copy on disk — which is the whole reason
          // the downloads routes exist separately from this one.
          <Link
            href={downloadHref(downloaded)}
            className={buttonVariants({ variant: "outline" })}
          >
            Open the downloaded copy
          </Link>
        )}
      </OfflineNotice>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <TriangleAlert className="text-muted-foreground h-8 w-8" />
        <div>
          <p className="font-medium">Could not load this wallpaper</p>
          <p className="text-muted-foreground mt-1 text-sm">{loadError}</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <div className="bg-muted relative overflow-hidden rounded-xl">
        {wallpaper ? (
          <>
            {/* The grid already cached the thumbnail, so it fills the frame
                instantly while the full-resolution file streams in. */}
            <img
              src={wallpaper.thumbnail}
              alt=""
              aria-hidden
              className={`max-h-[60vh] w-full scale-105 object-contain blur-lg transition-opacity duration-300 ${
                fullResLoaded ? "opacity-0" : "opacity-100"
              }`}
            />
            <img
              src={wallpaper.imageurl}
              alt={wallpaper.title}
              onLoad={() => setFullResLoaded(true)}
              className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
                fullResLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </>
        ) : (
          <Skeleton className="h-[60vh] w-full" />
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          {wallpaper ? (
            <>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold capitalize">
                  {wallpaper.title}
                </h1>
                <Badge variant="secondary">{wallpaper.provider}</Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                {wallpaper.width && wallpaper.height
                  ? `${wallpaper.width} × ${wallpaper.height}`
                  : "Dimensions unknown"}
              </p>
              {wallpaper.colors?.length ? (
                <div className="mt-1 flex items-center gap-1.5">
                  {wallpaper.colors.slice(0, 6).map((color) => (
                    <span
                      key={color}
                      title={color}
                      style={{ backgroundColor: color }}
                      className="ring-border h-5 w-5 rounded-full ring-1"
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={fitMode}
            onValueChange={(value) => {
              setFitOverridden(true)
              setFitMode(value as FitMode)
            }}
          >
            <SelectTrigger size="sm" className="w-[150px]" disabled={working}>
              <span>{FIT_MODE_LABELS[fitMode]}</span>
            </SelectTrigger>
            <SelectContent>
              {FIT_MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => wallpaper && void toggleFavorite(wallpaper)}
            disabled={!wallpaper}
          >
            <Heart
              className={cn("h-4 w-4", isFavorite && "fill-current text-red-500")}
            />
            {isFavorite ? "Favorited" : "Favorite"}
          </Button>

          <Button
            variant="outline"
            onClick={() => void run("download")}
            disabled={!wallpaper || working}
          >
            <Download className="h-4 w-4" />
            Download
          </Button>

          <Button
            onClick={() => void run("set")}
            disabled={!wallpaper || working}
          >
            <Monitor className="h-4 w-4" />
            Set as wallpaper
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function WallpaperDetailPage() {
  // `useSearchParams` must sit inside a Suspense boundary for static export.
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-xl" />}>
      <WallpaperDetail />
    </Suspense>
  )
}
