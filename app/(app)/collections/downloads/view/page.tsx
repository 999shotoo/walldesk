"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
// Not next/link — see the note in components/sidebar.tsx.
import { Link } from "next-transition-router"
import {
  ArrowLeft,
  Download,
  Heart,
  Monitor,
  Trash2,
  TriangleAlert,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useFavorites, useIsFavorite, wallpaperKey } from "@/lib/store"
import { useSettings } from "@/lib/settings"
import { toastError, toastSuccess } from "@/lib/toast"
import {
  DOWNLOADS_HREF,
  parentDir,
  useDownload,
  useDownloads,
  useIsFileMissing,
} from "@/lib/downloads"
import { useIsOffline } from "@/lib/offline"
import {
  FIT_MODES,
  FIT_MODE_LABELS,
  formatBytes,
  setWallpaper,
  wallpaperHref,
  type FitMode,
} from "@/lib/wallpaper"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { LocalImage } from "@/components/common/local_image"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * A downloaded wallpaper, read entirely from local state.
 *
 * The counterpart to `/wallpaper`, and deliberately not a variant of it. That
 * route takes an id, calls `fetchWallpaperById`, renders the remote file, and
 * re-downloads on every action — three network dependencies. This one resolves the
 * wallpaper from the downloads ledger on disk, renders the saved file over Tauri's
 * asset protocol, and applies it with a single OS call. Nothing here touches the
 * network, which is what makes it usable offline.
 */
function DownloadDetail() {
  // Plain next/navigation router, same as on the other detail page: the
  // transition router short-circuits `back()` anyway.
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get("id")
  const provider = params.get("provider") ?? "wallhaven"

  const record = useDownload(id ? { id, provider } : null)
  const hydrated = useDownloads((state) => state.hydrated)
  const remove = useDownloads((state) => state.remove)
  const markMissing = useDownloads((state) => state.markMissing)
  const redownload = useDownloads((state) => state.redownload)

  // Whether the saved file is still there. Everything that reads it is gated on
  // this; everything that reads only the ledger — favoriting, removing — is not.
  const missing = useIsFileMissing({ id: id ?? "", provider })
  const offline = useIsOffline()

  const isFavorite = useIsFavorite({ id: id ?? "", provider })
  const toggleFavorite = useFavorites((state) => state.toggleFavorite)

  /**
   * Whether an action is in flight.
   *
   * Just a boolean now that outcomes are toasted: what the buttons need is
   * "something is happening, don't start another", and the toast carries which
   * action it was and how it went.
   */
  const [working, setWorking] = useState(false)

  // The saved default, overridable for this one wallpaper — same arrangement as
  // the catalogue detail page.
  const defaultFitMode = useSettings((state) => state.fitMode)
  const [fitMode, setFitMode] = useState<FitMode>(defaultFitMode)
  const [fitOverridden, setFitOverridden] = useState(false)

  useEffect(() => {
    if (!fitOverridden) setFitMode(defaultFitMode)
  }, [defaultFitMode, fitOverridden])

  // Idempotent. Guards against this page rendering before `AppBoot` has read
  // either store off disk, which would otherwise strand it on a skeleton.
  useEffect(() => {
    void useDownloads.getState().hydrate()
    void useSettings.getState().hydrate()
    void useFavorites.getState().hydrate()
  }, [])

  const apply = useCallback(async () => {
    if (!record) return
    setWorking(true)
    try {
      // No download step: the file is already on disk, so there is no progress to
      // report and nothing to be online for.
      await setWallpaper(record.path, fitMode)
      toastSuccess("Wallpaper applied", FIT_MODE_LABELS[fitMode])
    } catch (error: unknown) {
      toastError("That wallpaper could not be applied", error)
      // The backend refuses a path that is not a file, so a failure is itself
      // evidence — and a file deleted since the last check is the likeliest cause.
      markMissing(wallpaperKey(record))
    } finally {
      setWorking(false)
    }
  }, [record, fitMode, markMissing])

  const restore = useCallback(async () => {
    if (!record) return
    setWorking(true)
    try {
      // Sourced from the record itself, so this needs no provider lookup — the
      // ledger already holds the wallpaper's URL alongside its id.
      await redownload(wallpaperKey(record))
      toastSuccess(`${record.filename} downloaded again`)
    } catch (error: unknown) {
      toastError(`${record.filename} could not be downloaded again`, error)
    } finally {
      setWorking(false)
    }
  }, [record, redownload])

  const forget = useCallback(async () => {
    if (!record) return
    // Navigate first, and don't await: `remove` deletes the file and raises its
    // own toast with the Undo, which outlives this page — so waiting on it would
    // only leave the user looking at a detail page for a wallpaper being deleted.
    router.replace(DOWNLOADS_HREF)
    void remove(wallpaperKey(record))
  }, [record, remove, router])

  // Hydration has to finish before "not found" can mean anything — the ledger is
  // empty until it is read.
  if (!hydrated) {
    return (
      <div className="flex flex-col gap-5 pt-5">
        <Skeleton className="h-[60vh] w-full rounded-xl" />
        <Skeleton className="h-6 w-48" />
      </div>
    )
  }

  if (!record) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <TriangleAlert className="text-muted-foreground h-8 w-8" />
        <div>
          <p className="font-medium">Not in your downloads</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {id
              ? "This wallpaper has not been saved to this device, or it was removed from the list."
              : "No wallpaper was specified."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.replace(DOWNLOADS_HREF)}>
            Downloads
          </Button>
          {id && (
            // The catalogue route can still show it — that one fetches from the
            // provider, so unlike this page it needs a connection.
            <Link
              href={wallpaperHref({ id, provider })}
              className={buttonVariants({ variant: "ghost" })}
            >
              Open from {provider}
            </Link>
          )}
        </div>
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

      {/* Reserve the wallpaper's real shape while it decodes, so nothing below
          jumps when it appears. A record with no recorded dimensions falls back to
          a fixed box — better an approximate placeholder than a collapsed one. */}
      <LocalImage
        path={record.path}
        alt={record.title}
        fallbackSrc={record.thumbnail}
        eager
        aspectRatio={
          record.width && record.height ? record.width / record.height : undefined
        }
        wrapperClassName={cn(
          "bg-muted w-full max-h-[60vh] rounded-xl",
          !(record.width && record.height) && "min-h-[40vh]"
        )}
        className="h-full w-full object-contain"
        missingLabel="This file is no longer on disk — it was moved or deleted outside the app."
        // The image failing is the app's earliest notice that a file has gone, and
        // it costs no disk call — this page is drawing the file anyway.
        onMissing={() => markMissing(wallpaperKey(record))}
      />

      {/* The explanation and the fix, together. The placeholder above says what
          happened; this says what can be done about it, and why it might not be
          available right now. */}
      {missing && (
        <div className="border-destructive/40 flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm">
            <TriangleAlert className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">This file is missing</p>
              <p className="text-muted-foreground mt-0.5">
                {offline
                  ? "It can be downloaded again once you are back online."
                  : `It can be downloaded again from ${record.provider}.`}
              </p>
            </div>
          </div>
          <Button
            onClick={() => void restore()}
            disabled={working || offline}
            className="shrink-0"
          >
            <Download className="h-4 w-4" />
            Redownload
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold capitalize">{record.title}</h1>
            <Badge variant="secondary">{record.provider}</Badge>
            {/* Worth stating: a wallpaper can be in this list without the user
                having asked for a copy, because applying one writes a file. */}
            <Badge variant="outline">
              {record.via === "wallpaper" ? "Saved when applied" : "Downloaded"}
            </Badge>
          </div>

          <p className="text-muted-foreground text-sm">
            {[
              record.width && record.height
                ? `${record.width} × ${record.height}`
                : null,
              record.sizeBytes !== null ? formatBytes(record.sizeBytes) : null,
              `Saved ${new Date(record.savedAt).toLocaleString()}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {/* The full path, because the point of this list is that these are
              files. `break-all` since Windows paths are long and have no spaces
              to wrap at. */}
          <p className="text-muted-foreground font-mono text-xs break-all">
            {record.path}
          </p>

          {record.colors?.length ? (
            <div className="mt-1 flex items-center gap-1.5">
              {record.colors.slice(0, 6).map((color) => (
                <span
                  key={color}
                  title={color}
                  style={{ backgroundColor: color }}
                  className="ring-border h-5 w-5 rounded-full ring-1"
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={fitMode}
            onValueChange={(value) => {
              setFitOverridden(true)
              setFitMode(value as FitMode)
            }}
          >
            {/* Disabled alongside the apply button, since fit mode is only ever
                used by it — leaving it live would offer a setting with nothing to
                set. */}
            <SelectTrigger
              size="sm"
              className="w-[150px]"
              disabled={working || missing}
            >
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

          {/* Favorites are stored whole, so this works with no connection too —
              and with no file, which is why it stays live while one is missing. */}
          <Button variant="outline" onClick={() => void toggleFavorite(record)}>
            <Heart
              className={cn("h-4 w-4", isFavorite && "fill-current text-red-500")}
            />
            {isFavorite ? "Favorited" : "Favorite"}
          </Button>

          {/* Also stays live: deleting a record that points at nothing is the
              other reasonable thing to do about a missing file, and `remove`
              treats an already-absent file as done rather than failed. */}
          <Button variant="outline" onClick={() => void forget()} disabled={working}>
            <Trash2 className="h-4 w-4" />
            {missing ? "Remove from downloads" : "Delete"}
          </Button>

          <Button
            onClick={() => void apply()}
            disabled={working || missing}
            title={missing ? "The file is missing — redownload it first" : undefined}
          >
            <Monitor className="h-4 w-4" />
            Set as wallpaper
          </Button>
        </div>
      </div>

      {/* Stated up front, next to a button that does it. The file is the point of
          this list, so a user has to know the button is not just tidying a list —
          and that the toast it raises is their one chance to take it back. */}
      <p className="text-muted-foreground text-xs">
        {missing
          ? "This file is already gone from disk — removing it only clears the record."
          : `Deleting removes the record and the file from ${parentDir(record.path)}. You can undo it from the message that appears.`}
      </p>
    </div>
  )
}

export default function DownloadDetailPage() {
  // `useSearchParams` must sit inside a Suspense boundary for static export.
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-xl" />}>
      <DownloadDetail />
    </Suspense>
  )
}
