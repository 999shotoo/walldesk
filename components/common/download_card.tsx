"use client"

import { useCallback, useMemo, useState } from "react"
// Not next/link — see the note in components/sidebar.tsx.
import { Link } from "next-transition-router"
import { Check, Download, Loader2, Monitor, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { wallpaperKey } from "@/lib/store"
import { useSettings } from "@/lib/settings"
import { toastError, toastSuccess } from "@/lib/toast"
import { setWallpaper } from "@/lib/wallpaper"
import {
  downloadHref,
  useDownloads,
  useIsFileMissing,
  type DownloadedWallpaper,
} from "@/lib/downloads"
import { useIsOffline } from "@/lib/offline"
import { LocalImage } from "@/components/common/local_image"
import { Button } from "@/components/ui/button"

/** Which action is in flight, so the right button gets the spinner. */
type Busy = null | "apply" | "redownload"

/**
 * A wallpaper that is already on disk.
 *
 * Not `WallpaperCard`, which is built for feed results: that one links to
 * `/wallpaper` (a route that refetches from the provider), shows its thumbnail
 * from a provider URL, and re-downloads the file on every action. Everything here
 * reads the local copy instead, so the card works with the network off.
 */
export function DownloadCard({
  record,
  eager = false,
}: {
  record: DownloadedWallpaper
  eager?: boolean
}) {
  const [busy, setBusy] = useState<Busy>(null)
  const [done, setDone] = useState(false)

  const fitMode = useSettings((state) => state.fitMode)
  const remove = useDownloads((state) => state.remove)
  const markMissing = useDownloads((state) => state.markMissing)
  const redownload = useDownloads((state) => state.redownload)

  const key = useMemo(() => wallpaperKey(record), [record])
  // The file is gone from disk, so every action that reads it would fail. Getting
  // it back needs the network, which is the one thing this view is built not to
  // depend on — hence both flags.
  const missing = useIsFileMissing(record)
  const offline = useIsOffline()

  const apply = useCallback(async () => {
    setBusy("apply")
    try {
      // The whole point of the ledger: the file is already here, so this is a
      // single OS call with nothing downloaded and nothing to be online for.
      await setWallpaper(record.path, fitMode)
      setDone(true)
      window.setTimeout(() => setDone(false), 2000)
    } catch (error: unknown) {
      // Toasted rather than written into the card: the failure needs the file
      // path and the reason to be any use, and there is no room for either over a
      // thumbnail. The tick on the button covers the success case.
      toastError(`${record.title} could not be set as your wallpaper`, error)
      // The backend refuses to apply a path that is not a file, so a failure here
      // is itself evidence — and the likeliest cause is that the file went away
      // since the last check.
      markMissing(key)
    } finally {
      setBusy(null)
    }
  }, [record.path, record.title, fitMode, markMissing, key])

  const restore = useCallback(async () => {
    setBusy("redownload")
    try {
      await redownload(key)
      toastSuccess(`${record.filename} downloaded again`)
    } catch (error: unknown) {
      toastError(`${record.filename} could not be downloaded again`, error)
    } finally {
      setBusy(null)
    }
  }, [redownload, key, record.filename])

  const overlayButton = cn(
    "h-8 w-8 rounded-full bg-white/10 text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 ease-out group-hover:opacity-100",
    "hover:bg-white/20 hover:text-white disabled:opacity-100"
  )

  return (
    <div className="group relative cursor-pointer overflow-hidden rounded-lg">
      <Link href={downloadHref(record)}>
        {/* This is the full-size file scaled into a card, since there is no local
            thumbnail to use — so it needs a real loading state, which is what
            `LocalImage` is for. Lazy loading keeps decoding to what is on screen; a
            proper fix is generating thumbnails at download time. */}
        <LocalImage
          path={record.path}
          alt={record.title}
          // Only reachable outside the Tauri webview, where there is no `asset:`
          // protocol to serve the file. In the app proper the local copy is used.
          fallbackSrc={record.thumbnail}
          eager={eager}
          wrapperClassName="aspect-video w-full rounded-lg"
          className="transform-gpu h-full w-full object-cover will-change-transform transition-[opacity,transform] duration-300 ease-out group-hover:scale-105 group-hover:opacity-95"
          missingLabel="File was moved or deleted"
          // The image failing to decode is the earliest and cheapest notice that a
          // file has gone, and it costs no disk call — the card is drawing anyway.
          onMissing={() => markMissing(key)}
        />
      </Link>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100" />
      <div className="pointer-events-none absolute right-0 bottom-0 left-0 p-4 text-white opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100">
        <h3 className="truncate text-lg font-semibold capitalize">{record.title}</h3>
        {/* The filename, because this card is about a file — it is what the user
            would search their file manager for. */}
        <p className="truncate text-xs text-white/70">{record.filename}</p>
      </div>

      <div className="absolute top-2 right-2 flex space-x-2">
        {missing ? (
          <Button
            size="icon"
            variant="ghost"
            className={overlayButton}
            title={
              offline
                ? "Redownload needs a connection"
                : "Redownload this wallpaper"
            }
            onClick={() => void restore()}
            disabled={busy !== null || offline}
          >
            {busy === "redownload" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="sr-only">Redownload {record.title}</span>
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className={overlayButton}
            title="Set as wallpaper"
            onClick={() => void apply()}
            disabled={busy !== null}
          >
            {busy === "apply" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : done ? (
              <Check className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
            <span className="sr-only">Set as wallpaper</span>
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className={overlayButton}
          // Deletes the file, not just the record. No confirmation in front of it
          // on purpose: `remove` raises a toast with an Undo that puts the record
          // back and fetches the file again, which costs nothing in the ordinary
          // case where the click was meant — unlike a dialog, which taxes every
          // one of them to catch the rare mistake.
          //
          // Stays enabled while the file is missing: getting rid of a record that
          // points at nothing is exactly what a user would want to do then, and
          // `remove` treats an already-absent file as done rather than failed.
          title={
            missing
              ? "Remove from downloads (the file is already gone)"
              : "Delete this wallpaper and its file"
          }
          onClick={() => void remove(key)}
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">
            {missing
              ? `Remove ${record.filename} from downloads`
              : `Delete ${record.filename}`}
          </span>
        </Button>
      </div>

      {/* Always visible, not hover-gated like the rest: a card whose file is gone
          has to say so before the user clicks anything. */}
      {missing && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white backdrop-blur-sm">
          File missing
        </div>
      )}

      <div className="pointer-events-none absolute top-2 left-2 rounded-full bg-white/10 px-2 py-1 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 ease-out group-hover:opacity-100">
        {record.provider}
      </div>
    </div>
  )
}
