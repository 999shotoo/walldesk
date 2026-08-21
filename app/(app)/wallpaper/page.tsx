"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  Check,
  Download,
  Heart,
  Monitor,
  TriangleAlert,
} from "lucide-react"

import { fetchWallpaperById } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useFavorites, useIsFavorite } from "@/lib/store"
import { useSettings } from "@/lib/settings"
import {
  FIT_MODES,
  FIT_MODE_LABELS,
  type DownloadProgress,
  type FitMode,
  downloadAndSetWallpaper,
  downloadWallpaper,
  formatBytes,
  onDownloadProgress,
  wallpaperFilename,
} from "@/lib/wallpaper"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

type ActionState =
  | { kind: "idle" }
  | { kind: "working"; label: string; progress: DownloadProgress | null }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string }

function WallpaperDetail() {
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get("id")
  const provider = params.get("provider") ?? "wallhaven"

  const [wallpaper, setWallpaper] = useState<CombinedWallpaper | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fullResLoaded, setFullResLoaded] = useState(false)
  const [action, setAction] = useState<ActionState>({ kind: "idle" })

  const isFavorite = useIsFavorite({ id: id ?? "", provider })
  const toggleFavorite = useFavorites((state) => state.toggleFavorite)

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
  }, [])

  useEffect(() => {
    if (!id) {
      setLoadError("No wallpaper was specified.")
      return
    }

    // Wait for the stored key, for the same reason the feed does: fetching
    // anonymously first would just be a discarded request.
    if (!settingsHydrated) return

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
        if (!cancelled) setLoadError(String(error))
      })

    return () => {
      cancelled = true
    }
  }, [id, provider, wallhavenApiKey, settingsHydrated])

  // Progress events are global to the backend, so only listen while a transfer
  // is actually in flight.
  const isWorking = action.kind === "working"
  useEffect(() => {
    if (!isWorking) return

    let unlisten: (() => void) | undefined
    let cancelled = false

    onDownloadProgress((progress) => {
      setAction((current) =>
        current.kind === "working" ? { ...current, progress } : current
      )
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [isWorking])

  const handleSetWallpaper = useCallback(async () => {
    if (!wallpaper) return
    setAction({ kind: "working", label: "Applying wallpaper", progress: null })
    try {
      await downloadAndSetWallpaper(
        wallpaper.imageurl,
        wallpaperFilename(wallpaper),
        fitMode
      )
      setAction({ kind: "done", message: "Wallpaper applied." })
    } catch (error: unknown) {
      setAction({ kind: "error", message: String(error) })
    }
  }, [wallpaper, fitMode])

  const handleDownload = useCallback(async () => {
    if (!wallpaper) return
    setAction({ kind: "working", label: "Downloading", progress: null })
    try {
      const path = await downloadWallpaper(
        wallpaper.imageurl,
        wallpaperFilename(wallpaper),
        "downloads"
      )
      setAction({ kind: "done", message: `Saved to ${path}` })
    } catch (error: unknown) {
      setAction({ kind: "error", message: String(error) })
    }
  }, [wallpaper])

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
            <SelectTrigger size="sm" className="w-[150px]" disabled={isWorking}>
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
            onClick={handleDownload}
            disabled={!wallpaper || isWorking}
          >
            <Download className="h-4 w-4" />
            Download
          </Button>

          <Button onClick={handleSetWallpaper} disabled={!wallpaper || isWorking}>
            <Monitor className="h-4 w-4" />
            Set as wallpaper
          </Button>
        </div>
      </div>

      {action.kind !== "idle" && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            action.kind === "error"
              ? "border-destructive/40 text-destructive"
              : "border-border text-muted-foreground"
          }`}
        >
          {action.kind === "working" && (
            <ProgressLine label={action.label} progress={action.progress} />
          )}
          {action.kind === "done" && (
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              <span className="break-all">{action.message}</span>
            </span>
          )}
          {action.kind === "error" && (
            <span className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <span className="break-all">{action.message}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function ProgressLine({
  label,
  progress,
}: {
  label: string
  progress: DownloadProgress | null
}) {
  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span>{label}…</span>
        <span className="tabular-nums">
          {progress
            ? percent !== null
              ? `${percent}% of ${formatBytes(progress.total!)}`
              : formatBytes(progress.downloaded)
            : ""}
        </span>
      </div>
      <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
        <div
          className={`bg-primary h-full transition-all duration-200 ${
            percent === null ? "w-1/3 animate-pulse" : ""
          }`}
          style={percent !== null ? { width: `${percent}%` } : undefined}
        />
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
